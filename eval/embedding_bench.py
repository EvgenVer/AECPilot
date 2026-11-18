"""Задача T83 (UR53): бесплатный локальный замер моделей эмбеддингов.

Что мерим. Документы `eval/samples/project` (и фикстура CSV вопросов про щиты)
режутся тем же разборщиком и нарезчиком, что у индекса (`aec_rag.parse`,
`aec_rag.chunk`). Каждая модель запускается сборкой llama.cpp, закреплённой
ядром (`llama-server --embeddings`), и векторизует все фрагменты и вопросы
`eval/qa_dataset.yaml` с известным источником. Попадание — фрагмент из
ожидаемого файла (и страницы, если она указана) среди первых k по косинусу.

Вопросы уходят в модель как есть, без инструкций-префиксов: так их отправляет
индекс (LightRAG зовёт эмбеддинги тем же текстом, что задал агент). Колонка
«с префиксом» — справочно, для моделей, обученных с префиксом запроса.

Ничего не уходит в сеть: модели и сервер локальные.

    .venv/Scripts/python.exe eval/embedding_bench.py --engine <llama-server.exe> \
        --model имя=путь.gguf [--model …] [--out eval/reports/embedding-bench.md]
"""

from __future__ import annotations

import argparse
import json
import re
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

import numpy as np
import yaml

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent / "mcp" / "aec_rag" / "src"))

from aec_rag.chunk import DEFAULT_MAX_CHARS as MAX_CHARS  # noqa: E402
from aec_rag.chunk import chunk_document  # noqa: E402
from aec_rag.parse import ParseError, parse_file  # noqa: E402

# Префиксы запроса из карточек моделей — только для справочной колонки.
QUERY_PREFIX = {
    "qwen3": "Instruct: Given a question, retrieve passages that answer it\nQuery: ",
    "e5": "Instruct: Given a question, retrieve passages that answer it\nQuery: ",
}


def corpus(cache: Path) -> list[dict]:
    """Фрагменты всех документов: текст, файл, страница. Разбор кэшируется."""
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    files = sorted((ROOT / "samples" / "project").iterdir()) + [
        ROOT / "fixtures" / "injection-probe.csv"
    ]
    chunks: list[dict] = []
    for path in files:
        started = time.monotonic()
        try:
            parsed = parse_file(path)
        except ParseError as error:
            print(f"  пропущен {path.name}: {error}", flush=True)
            continue
        for chunk in chunk_document(parsed):
            # Таблицы docx приходят выровненными пробелами — фрагмент до 52 тыс.
            # знаков, почти весь из пробелов (находка замера, см. отчёт). Модели
            # пробелы ничего не говорят: сжимаются до одного, как в одной строке.
            text = re.sub(r"-{3,}", "---", re.sub(r"[ \t]{2,}", " ", chunk.text)).strip()
            # Срез по номинальному размеру фрагмента индекса (`DEFAULT_MAX_CHARS`):
            # длиннее его фрагмент быть не должен, и модели с окном 512 токенов
            # (e5) иначе молча обрезали бы своё, а другие — нет.
            text = text[:MAX_CHARS]
            if text:
                page = chunk.locator.get("page")
                chunks.append({"file": path.name, "page": page, "text": text})
        print(f"  {path.name}: {time.monotonic() - started:.0f} с", flush=True)
    cache.write_text(json.dumps(chunks, ensure_ascii=False), encoding="utf-8")
    return chunks


def questions() -> list[dict]:
    out = []
    for item in yaml.safe_load((ROOT / "qa_dataset.yaml").read_text(encoding="utf-8")):
        sources = item.get("expected_sources") or []
        if not sources:
            continue  # отрицательные вопросы — ответа в корпусе нет
        targets = []
        for source in sources:
            name = source.split("/")[-1]
            page = None
            if "#p" in name:
                name, page = name.split("#p")
                page = int(page)
            targets.append((name, page))
        out.append({"id": item["id"], "question": item["question"], "targets": targets})
    return out


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def embed(port: int, texts: list[str], batch: int = 8) -> np.ndarray:
    vectors = []
    for start in range(0, len(texts), batch):
        body = json.dumps({"input": texts[start : start + batch], "model": "m"}).encode()
        request = urllib.request.Request(
            f"http://127.0.0.1:{port}/v1/embeddings",
            data=body,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(request, timeout=600) as answer:
            data = json.load(answer)["data"]
        vectors.extend(item["embedding"] for item in sorted(data, key=lambda d: d["index"]))
    matrix = np.asarray(vectors, dtype=np.float32)
    return matrix / np.linalg.norm(matrix, axis=1, keepdims=True)


def hit(chunk: dict, targets: list[tuple[str, int | None]]) -> bool:
    return any(
        chunk["file"] == name and (page is None or chunk["page"] == page) for name, page in targets
    )


def score(chunks, qs, chunk_vectors, question_vectors) -> dict:
    sims = question_vectors @ chunk_vectors.T
    at1 = at5 = 0
    mrr = 0.0
    for row, q in zip(sims, qs, strict=True):
        order = np.argsort(-row)[:10]
        ranks = [i for i, idx in enumerate(order) if hit(chunks[idx], q["targets"])]
        if ranks:
            first = ranks[0]
            at1 += first == 0
            at5 += first < 5
            mrr += 1 / (first + 1)
    n = len(qs)
    return {"hit@1": at1 / n, "hit@5": at5 / n, "mrr@10": mrr / n}


def run_model(engine: Path, name: str, gguf: Path, chunks, qs) -> dict:
    port = free_port()
    server = subprocess.Popen(
        [
            str(engine),
            "-m",
            str(gguf),
            "--embeddings",
            "--port",
            str(port),
            "--host",
            "127.0.0.1",
            "-c",
            "8192",
            "-b",
            "8192",
            "-ub",
            "8192",
            "-np",
            "1",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        deadline = time.monotonic() + 300
        while True:
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=5) as r:
                    if r.status == 200:
                        break
            except OSError:
                pass
            if time.monotonic() > deadline or server.poll() is not None:
                raise RuntimeError(f"{name}: сервер не поднялся")
            time.sleep(1)
        started = time.monotonic()
        chunk_vectors = embed(port, [c["text"] for c in chunks])
        seconds = time.monotonic() - started
        plain = score(chunks, qs, chunk_vectors, embed(port, [q["question"] for q in qs]))
        prefix = QUERY_PREFIX.get(next((k for k in QUERY_PREFIX if k in name), ""), "")
        prefixed = (
            score(chunks, qs, chunk_vectors, embed(port, [prefix + q["question"] for q in qs]))
            if prefix
            else None
        )
        return {
            "name": name,
            "file": gguf.name,
            "size_mb": round(gguf.stat().st_size / 1e6),
            "dim": int(chunk_vectors.shape[1]),
            "chunks_per_s": round(len(chunks) / seconds, 2),
            "plain": plain,
            "prefixed": prefixed,
        }
    finally:
        server.terminate()
        try:
            server.wait(timeout=30)
        except subprocess.TimeoutExpired:
            server.kill()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--engine", required=True, type=Path)
    parser.add_argument("--model", action="append", required=True)
    parser.add_argument("--cache", type=Path, default=Path("embedding-bench-corpus.json"))
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()

    print("Разбор корпуса…", flush=True)
    chunks = corpus(args.cache)
    qs = questions()
    print(f"Фрагментов: {len(chunks)}, вопросов: {len(qs)}", flush=True)
    results = []
    for spec in args.model:
        name, path = spec.split("=", 1)
        print(f"Модель {name}…", flush=True)
        result = run_model(args.engine, name, Path(path), chunks, qs)
        print(json.dumps(result, ensure_ascii=False), flush=True)
        results.append(result)
    if args.out:
        args.out.write_text(
            json.dumps(
                {"chunks": len(chunks), "questions": len(qs), "results": results},
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )


if __name__ == "__main__":
    main()
