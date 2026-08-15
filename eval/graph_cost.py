"""What a knowledge graph actually costs, measured on one document (task 2.9a).

SPECIFICATION R6 says building a graph costs an LLM call per chunk. That is the
reason UR24 makes the graph opt-in per folder or file. This script turns the
sentence into numbers, on one real document, *before* anything runs over a whole
project: if a single document turns out to be indecently expensive, what has to
change is the scheme, not the interface that offers it.

Two modes, and the difference between them is the point:

* ``--dry`` (default) — runs the real LightRAG extraction pipeline with a fake
  model that records every prompt it is handed and answers "nothing found".
  Zero API calls, zero cost, and the input-token count is *exact*, because the
  prompts are the real ones. What it cannot know is the size of the answers.
* ``--run`` — the same pipeline against the configured extraction model, with
  usage read off the API responses. This is the measurement the task asks for;
  it spends money on the owner's account, so it is never the default.

Usage:
    uv run python eval/graph_cost.py                      # free, input tokens only
    uv run python eval/graph_cost.py --run --max-chunks 40 # real, bounded spend

The API key is read from the process environment (PLAN rule R2) or, with
``--env-file``, loaded out of a dotenv file by this script — never printed,
never echoed into a report.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import shutil
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SAMPLES = REPO_ROOT / "eval" / "samples" / "project"
DEFAULT_ENV_FILE = REPO_ROOT / "runtime" / "dev-profile" / ".env"

# The reference project's chunk count, from PLAN §Architecture (464 chunks ×
# 3072 dimensions ≈ 5.7 MB of vectors). Every extrapolation below is per-chunk
# cost × this number.
REFERENCE_PROJECT_CHUNKS = 464


@dataclass
class Usage:
    """Everything one run of the extraction pipeline consumed."""

    calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    seconds: float = 0.0
    prompts: list[int] = field(default_factory=list)

    def record(self, *, input_tokens: int, output_tokens: int, seconds: float) -> None:
        self.calls += 1
        self.input_tokens += input_tokens
        self.output_tokens += output_tokens
        self.seconds += seconds
        self.prompts.append(input_tokens)


def load_env_file(path: Path) -> bool:
    """Load ``KEY=VALUE`` lines into the environment. Values are never printed.

    Returns whether the file existed. Only keys that are not already set are
    taken, so an explicitly exported key always wins.
    """
    if not path.is_file():
        return False
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and value and key not in os.environ:
            os.environ[key] = value
    return True


def pick_document(explicit: str | None) -> Path:
    if explicit:
        path = Path(explicit)
        if not path.is_file():
            raise SystemExit(f"нет такого файла: {path}")
        return path
    candidates = [
        path
        for path in sorted(SAMPLES.glob("*"))
        if path.is_file() and path.suffix.lower() in {".pdf", ".docx", ".xlsx", ".csv"}
    ]
    if not candidates:
        raise SystemExit(
            f"в {SAMPLES} нет документов — положите их туда (см. eval/README.md) "
            f"или укажите --document"
        )
    # The smallest one: this measurement is about cost per chunk, and the
    # cheapest document that yields chunks answers it just as well.
    return min(candidates, key=lambda path: path.stat().st_size)


CACHE_DIR = REPO_ROOT / "eval" / ".graph-cost-cache"


def parse_and_chunk(document: Path, *, use_cache: bool = True):
    """Parse and chunk, remembering the result: Docling takes minutes on a real
    document and the token accounting below is re-run many times over the same
    one.
    """
    from aec_rag.chunk import Chunk

    cache = CACHE_DIR / f"{document.stem[:60]}-{document.stat().st_size}.json"
    if use_cache and cache.is_file():
        data = json.loads(cache.read_text(encoding="utf-8"))
        chunks = [
            Chunk(text=entry["text"], locator=entry["locator"], is_table=entry["is_table"])
            for entry in data["chunks"]
        ]
        return data["segments"], chunks

    segments, chunks = _parse_and_chunk_uncached(document)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache.write_text(
        json.dumps(
            {
                "segments": segments,
                "chunks": [
                    {"text": c.text, "locator": c.locator, "is_table": c.is_table} for c in chunks
                ],
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    return segments, chunks


def _parse_and_chunk_uncached(document: Path):
    from aec_rag.chunk import chunk_document
    from aec_rag.parse import parse_docx, parse_pdf, parse_spreadsheet

    suffix = document.suffix.lower()
    if suffix == ".pdf":
        parsed = parse_pdf(document)
    elif suffix == ".docx":
        parsed = parse_docx(document)
    elif suffix in {".xlsx", ".csv"}:
        parsed = parse_spreadsheet(document)
    else:
        raise SystemExit(f"неподдерживаемый формат: {suffix}")
    return len(parsed.segments), chunk_document(parsed)


def token_counter():
    import tiktoken

    encoding = tiktoken.get_encoding("cl100k_base")
    return lambda text: len(encoding.encode(text or ""))


def dry_llm(usage: Usage):
    """A model that reads the prompt, counts it, and reports finding nothing."""
    count = token_counter()

    async def complete(prompt: str, system_prompt: str | None = None, **kwargs) -> str:
        started = time.monotonic()
        history = kwargs.get("history_messages") or []
        tokens = (
            count(prompt)
            + count(system_prompt)
            + sum(count(m.get("content")) for m in history)
        )
        usage.record(input_tokens=tokens, output_tokens=0, seconds=time.monotonic() - started)
        return "<|COMPLETE|>"

    return complete


def live_llm(usage: Usage, model: str):
    """The configured extraction model, with usage read off each response."""
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])

    async def complete(prompt: str, system_prompt: str | None = None, **kwargs) -> str:
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.extend(kwargs.get("history_messages") or [])
        messages.append({"role": "user", "content": prompt})

        request: dict = {"model": model, "messages": messages}
        if kwargs.get("response_format") is not None:
            request["response_format"] = kwargs["response_format"]
        if kwargs.get("max_tokens"):
            request["max_completion_tokens"] = int(kwargs["max_tokens"])

        started = time.monotonic()
        try:
            response = await client.chat.completions.create(**request)
        except Exception as exc:  # noqa: BLE001 — a measurement must say what broke
            unsupported = "max_completion_tokens" in str(exc) or "response_format" in str(exc)
            if not unsupported:
                raise
            request.pop("max_completion_tokens", None)
            request.pop("response_format", None)
            response = await client.chat.completions.create(**request)

        elapsed = time.monotonic() - started
        counts = response.usage
        usage.record(
            input_tokens=counts.prompt_tokens if counts else 0,
            output_tokens=counts.completion_tokens if counts else 0,
            seconds=elapsed,
        )
        return response.choices[0].message.content or ""

    return complete


def embedding_func(model: str, dimensions: int, *, live: bool):
    """Embeddings are level 1 and are measured elsewhere; here they are only in
    the way, so the dry run fakes them and only a live run pays for them.
    """
    import numpy as np
    from lightrag.utils import EmbeddingFunc

    if live:
        from lightrag.llm.openai import openai_embed

        async def embed(texts, **kwargs):
            # `.func` and an explicit `embedding_dim` — see the note in
            # aec_rag.rag_index._default_embedding_func.
            return await openai_embed.func(
                texts,
                model=model,
                api_key=os.environ["OPENAI_API_KEY"],
                embedding_dim=dimensions,
            )
    else:

        async def embed(texts, **kwargs):
            return np.zeros((len(texts), dimensions), dtype=np.float32)

    return EmbeddingFunc(
        embedding_dim=dimensions, max_token_size=8192, model_name=model, func=embed
    )


async def measure(args) -> dict:
    from aec_rag.lightrag_bridge import IndexedChunk, insert_document
    from aec_rag.rag_index import EMBEDDING_DIMENSIONS, EXTRACTION_MODEL, RagSettings, open_index
    from aec_rag.store import chunk_id as make_chunk_id

    document = pick_document(args.document)
    print(f"== документ: {document.name} ({document.stat().st_size / 1_048_576:.1f} МБ)")

    started = time.monotonic()
    segments, chunks = parse_and_chunk(document, use_cache=not args.no_cache)
    parse_seconds = time.monotonic() - started
    print(f"== разбор: {parse_seconds:.1f} с, сегментов {segments}, чанков {len(chunks)}")

    measured = chunks[: args.max_chunks] if args.max_chunks else chunks
    count = token_counter()
    chunk_tokens = sum(count(chunk.text) for chunk in measured)
    print(f"== в замер идут {len(measured)} чанков, {chunk_tokens} токенов текста")

    usage = Usage()
    model = args.model or EXTRACTION_MODEL
    settings = RagSettings(
        embedding_model=args.embedding_model,
        embedding_dim=EMBEDDING_DIMENSIONS[args.embedding_model],
        extraction_model=model,
    )

    # Always from scratch. LightRAG caches every LLM answer next to the index,
    # so a second run over the same vault would report zero calls and a cost of
    # nothing — the most flattering possible lie for a measurement to tell.
    vault = Path(args.vault) if args.vault else REPO_ROOT / "eval" / ".graph-cost-vault"
    if vault.exists():
        shutil.rmtree(vault)
    (vault / ".aecpilot").mkdir(parents=True, exist_ok=True)
    (vault / ".aecpilot" / "project.json").write_text(
        json.dumps({"schema_version": 1, "name": "graph-cost", "sources": []}, ensure_ascii=False),
        encoding="utf-8",
    )

    rag = await open_index(
        vault,
        settings,
        embedding_func=embedding_func(
            settings.embedding_model, settings.embedding_dim, live=args.run
        ),
        llm_func=live_llm(usage, model) if args.run else dry_llm(usage),
    )

    entries = [
        IndexedChunk(
            chunk_id=make_chunk_id("eval", document.name, ordinal, chunk.text),
            text=chunk.text,
        )
        for ordinal, chunk in enumerate(measured)
    ]

    build_started = time.monotonic()
    await insert_document(
        rag,
        source_id="eval",
        rel_path=document.name,
        chunks=entries,
        build_graph=True,
    )
    build_seconds = time.monotonic() - build_started

    entities, relations = await graph_size(rag)

    per_chunk_in = usage.input_tokens / len(measured) if measured else 0
    per_chunk_out = usage.output_tokens / len(measured) if measured else 0

    report = {
        "mode": "live" if args.run else "dry",
        "document": document.name,
        "document_mb": round(document.stat().st_size / 1_048_576, 2),
        "extraction_model": model,
        "parse_seconds": round(parse_seconds, 1),
        "chunks_total": len(chunks),
        "chunks_measured": len(measured),
        "chunk_text_tokens": chunk_tokens,
        "llm_calls": usage.calls,
        "calls_per_chunk": round(usage.calls / len(measured), 2) if measured else 0,
        "input_tokens": usage.input_tokens,
        "output_tokens": usage.output_tokens,
        "input_tokens_per_chunk": round(per_chunk_in),
        "output_tokens_per_chunk": round(per_chunk_out),
        "build_seconds": round(build_seconds, 1),
        "seconds_per_chunk": round(build_seconds / len(measured), 2) if measured else 0,
        "entities": entities,
        "relations": relations,
        "projection": {
            "chunks": args.project_chunks,
            "input_tokens": round(per_chunk_in * args.project_chunks),
            "output_tokens": round(per_chunk_out * args.project_chunks),
            "minutes": round(build_seconds / len(measured) * args.project_chunks / 60, 1)
            if measured
            else 0,
        },
    }
    if args.price_in and args.price_out:
        report["projection"]["usd"] = round(
            per_chunk_in * args.project_chunks / 1e6 * args.price_in
            + per_chunk_out * args.project_chunks / 1e6 * args.price_out,
            2,
        )
    return report


async def graph_size(rag) -> tuple[int, int]:
    """How much graph the run produced, asked of the storage rather than guessed."""
    try:
        labels = await rag.chunk_entity_relation_graph.get_all_labels()
        edges = await rag.chunk_entity_relation_graph.get_all_edges()
        return len(labels), len(edges)
    except Exception:  # noqa: BLE001 — a missing count must not lose the measurement
        return -1, -1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="graph_cost")
    parser.add_argument(
        "--document",
        help="Документ для замера (по умолчанию — самый лёгкий в eval/samples/project)",
    )
    parser.add_argument("--run", action="store_true", help="Звать настоящую модель (тратит деньги)")
    parser.add_argument(
        "--max-chunks", type=int, default=40, help="Сколько чанков брать в замер (0 — все)"
    )
    parser.add_argument("--project-chunks", type=int, default=REFERENCE_PROJECT_CHUNKS)
    parser.add_argument("--model", help="Модель извлечения (по умолчанию — из rag_index)")
    parser.add_argument("--embedding-model", default="text-embedding-3-large")
    parser.add_argument("--vault", help="Куда положить временный индекс")
    parser.add_argument("--env-file", default=str(DEFAULT_ENV_FILE))
    parser.add_argument("--no-cache", action="store_true", help="Разобрать документ заново")
    parser.add_argument(
        "--price-in", type=float, help="$ за 1M входных токенов — только для оценки"
    )
    parser.add_argument("--price-out", type=float, help="$ за 1M выходных токенов")
    parser.add_argument("--json", help="Куда записать отчёт машиночитаемо")
    args = parser.parse_args(argv)

    if args.run:
        loaded = load_env_file(Path(args.env_file))
        if not os.environ.get("OPENAI_API_KEY"):
            where = args.env_file if loaded else "окружении"
            print(f"graph_cost: OPENAI_API_KEY не найден в {where}", file=sys.stderr)
            return 1

    report = asyncio.run(measure(args))
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if args.json:
        Path(args.json).write_text(
            json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
