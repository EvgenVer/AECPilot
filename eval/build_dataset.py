"""Draft the eval question set from the indexed documents (task 2.16).

The decision behind this file (owner, 2026-08-15): I collect the questions, the
owner checks them. A question assembled from a text asks what that text happens
to answer well, and flatters the system — so every generated entry is marked
``provenance: needs_owner_check``, and the runner reports how many such entries
a score rests on.

Two guards keep the draft honest:

1. **Every pair is verified against the source, programmatically.** The model
   proposes a question and an answer; this script then checks that the answer's
   number actually appears in the chunk it came from. A pair that fails is
   dropped, not fixed — a fixed one is no longer evidence about the document.
2. **The citation is built here, not by the model.** It is written from the
   chunk's own `source_id`, `rel_path` and `locator`, so the expected source is
   correct by construction and the runner is checking retrieval, not the
   model's ability to copy a path.

Negative, injection and overview questions are NOT generated: they are about
what the system must refuse or admit, which no amount of document text implies.
They live in `eval/qa_seed.yaml`, written by hand, and are merged in here.

    uv run python eval/build_dataset.py --per-doc 8
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import random
import re
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "eval"))

from graph_cost import load_env_file  # noqa: E402

VAULT = REPO_ROOT / "eval" / ".eval-vault"
SEED = REPO_ROOT / "eval" / "qa_seed.yaml"
OUT = REPO_ROOT / "eval" / "qa_dataset.yaml"
DEFAULT_ENV_FILE = REPO_ROOT / "runtime" / "dev-profile" / ".env"

MODEL = "gpt-5.4-mini-2026-03-17"

# A chunk worth asking about carries a number with a unit — that is what an
# engineer looks up, and what a fluent but wrong answer gets wrong.
NUMERIC = re.compile(
    r"\d+[.,]?\d*\s*(?:кВт|кВ|кН|МПа|мм|см|м2|м3|м/с|м|кг|%|Вт/м2|Гц|°C|шт|мин|ч|сут)"
)

RULES = """Ты составляешь вопросы для проверки поиска по проектной документации.

Тебе дан фрагмент документа. Придумай ОДИН вопрос, на который этот фрагмент
отвечает точным значением, и запиши ответ.

Требования:
- вопрос задаёт инженер, который ищет конкретную величину или требование;
- вопрос понятен БЕЗ фрагмента (не «какая скорость указана выше», а «какая
  максимальная скорость воздуха в вытяжных системах жилой части»);
- ответ содержит число с единицей ровно так, как во фрагменте;
- если во фрагменте нет однозначной величины — верни {"skip": true}.

Ответь ТОЛЬКО JSON: {"question": "...", "answer": "..."} или {"skip": true}"""


def load_seed() -> list[dict[str, Any]]:
    import yaml

    if not SEED.is_file():
        return []
    return yaml.safe_load(SEED.read_text(encoding="utf-8")) or []


def candidate_chunks(conn, per_doc: int, seed: int) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT source_id, rel_path, locator, is_table, text FROM chunks ORDER BY id"
    ).fetchall()
    by_document: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for source_id, rel_path, locator, is_table, text in rows:
        if len(text) < 200 or not NUMERIC.search(text):
            continue
        by_document.setdefault((source_id, rel_path), []).append(
            {
                "source_id": source_id,
                "rel_path": rel_path,
                "locator": json.loads(locator),
                "is_table": bool(is_table),
                "text": text,
            }
        )

    generator = random.Random(seed)
    picked: list[dict[str, Any]] = []
    for chunks in by_document.values():
        generator.shuffle(chunks)
        picked.extend(chunks[:per_doc])
    return picked


async def draft(chunk: dict[str, Any]) -> dict[str, Any] | None:
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])
    response = await client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": RULES},
            {"role": "user", "content": chunk["text"][:4000]},
        ],
        response_format={"type": "json_object"},
    )
    try:
        parsed = json.loads(response.choices[0].message.content or "{}")
    except json.JSONDecodeError:
        return None
    if parsed.get("skip") or not parsed.get("question") or not parsed.get("answer"):
        return None
    return parsed


def verified(chunk: dict[str, Any], pair: dict[str, Any]) -> bool:
    """Does the proposed answer's number actually appear in the chunk?

    Digits only, punctuation-insensitive: the model writes «2,5 м/с» where the
    document has «до 2,5 м/с». A pair whose number is not in the text is a pair
    about a document nobody has.
    """
    numbers = re.findall(r"\d+(?:[.,]\d+)?", str(pair["answer"]))
    if not numbers:
        return False
    haystack = chunk["text"].replace(",", ".")
    return all(number.replace(",", ".") in haystack for number in numbers[:2])


async def build(args) -> list[dict[str, Any]]:
    from aec_rag.citation import format_citation
    from aec_rag.db import open_index as open_db

    conn = open_db(VAULT / ".aecpilot" / "index.db")
    try:
        chunks = candidate_chunks(conn, args.per_doc, args.seed)
    finally:
        conn.close()

    print(f"== кандидатов: {len(chunks)}", flush=True)
    entries: list[dict[str, Any]] = []
    dropped = 0
    for index, chunk in enumerate(chunks, start=1):
        pair = await draft(chunk)
        if pair is None or not verified(chunk, pair):
            dropped += 1
            continue
        citation = format_citation(chunk["source_id"], chunk["rel_path"], chunk["locator"])
        entries.append(
            {
                "id": f"g{index:03d}",
                "question": pair["question"].strip(),
                "expected_answer": pair["answer"].strip(),
                "expected_sources": [citation.removeprefix("[src: ").removesuffix("]")],
                "type": "table" if chunk["is_table"] else "factual",
                "provenance": "needs_owner_check",
                "note": "выведен из текста документа; проверить, что вопрос осмыслен",
            }
        )
        print(f"[{index}/{len(chunks)}] {pair['question'][:70]}", flush=True)

    print(f"== отброшено (не сверилось с источником или без величины): {dropped}")
    return entries


def main(argv: list[str] | None = None) -> int:
    import yaml

    parser = argparse.ArgumentParser(prog="build_dataset")
    parser.add_argument("--per-doc", type=int, default=8)
    parser.add_argument("--seed", type=int, default=2026)
    parser.add_argument("--env-file", default=str(DEFAULT_ENV_FILE))
    args = parser.parse_args(argv)

    load_env_file(Path(args.env_file))
    if not os.environ.get("OPENAI_API_KEY"):
        print("build_dataset: OPENAI_API_KEY не задан", file=sys.stderr)
        return 1

    generated = asyncio.run(build(args))
    dataset = load_seed() + generated
    OUT.write_text(
        "# Эвал-датасет aec-qa (задача 2.16).\n"
        "#\n"
        "# `provenance: derived` — вопрос написан руками против понятого документа.\n"
        "# `provenance: needs_owner_check` — вопрос выведен из текста моделью и сверен\n"
        "# с источником программно; осмысленность проверяет владелец (задача 2.16a).\n"
        "#\n"
        "# Пересобрать сгенерированную часть: uv run python eval/build_dataset.py\n"
        + yaml.safe_dump(dataset, allow_unicode=True, sort_keys=False, width=100),
        encoding="utf-8",
    )
    print(f"== записано {len(dataset)} вопросов в {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
