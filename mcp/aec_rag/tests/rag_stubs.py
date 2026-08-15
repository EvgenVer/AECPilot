"""Shared stubs for the aec-rag server tests (tasks 2.10–2.11a).

Nothing here calls a paid API. Embeddings are a deterministic bag-of-words hash,
which is enough for nearest-neighbour search to prefer the chunk that shares
words with the query; the parser is a one-segment-per-line stand-in, because the
server tests are about the tools' contract and parsing has its own tests on real
fixtures.
"""

from __future__ import annotations

import hashlib
import json

import numpy as np
from aec_rag.db import open_index as open_db
from aec_rag.rag_index import RagSettings, open_index
from aec_rag.server import build_server

DIM = 32


def _vector(text: str) -> np.ndarray:
    vector = np.zeros(DIM, dtype=np.float32)
    for word in text.lower().split():
        vector[hashlib.sha256(word.encode()).digest()[0] % DIM] += 1.0
    norm = float(np.linalg.norm(vector))
    return vector / norm if norm else vector


def word_embedding():
    from lightrag.utils import EmbeddingFunc

    async def embed(texts, **kwargs):
        return np.array([_vector(text) for text in texts], dtype=np.float32)

    return EmbeddingFunc(embedding_dim=DIM, max_token_size=8192, model_name="stub", func=embed)


async def forbidden_llm(prompt, system_prompt=None, **kwargs):
    raise AssertionError("уровень 1 не имеет права звать модель")


def extracting_llm(calls: list[str]):
    """A model that answers both questions the tier-2 path asks of it: which
    keywords a query is about, and which entities a chunk contains.
    """

    async def complete(prompt, system_prompt=None, **kwargs):
        calls.append(prompt)
        haystack = f"{system_prompt or ''}\n{prompt}"
        # `high_level_keywords` appears only in the keyword-extraction prompt.
        # A looser test on «keyword» matches the *entity* prompt too — it asks
        # for `relationship_keywords` — and then extraction silently gets a JSON
        # answer and finds nothing.
        if "high_level_keywords" in haystack:
            return (
                '{"high_level_keywords": ["электроснабжение"],'
                ' "low_level_keywords": ["мощность", "щит"]}'
            )
        # Their line format (lightrag.prompt, `entity_extraction_examples`):
        # entity<|#|>name<|#|>type<|#|>description
        # relation<|#|>source<|#|>target<|#|>keywords<|#|>description
        return (
            "entity<|#|>ТМГ-1000<|#|>Artifact<|#|>Силовой трансформатор проекта.\n"
            "entity<|#|>ЩС-1<|#|>Artifact<|#|>Щит силовой первый.\n"
            "relation<|#|>ТМГ-1000<|#|>ЩС-1<|#|>питание<|#|>Трансформатор питает щит.\n"
            "<|COMPLETE|>"
        )

    return complete


def make_project(tmp_path):
    """A vault with one source and an empty index.db. Returns (project.json, source)."""
    vault = tmp_path / "vault"
    source = tmp_path / "источник"
    (vault / ".aecpilot").mkdir(parents=True)
    source.mkdir()
    project_json = vault / ".aecpilot" / "project.json"
    project_json.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "name": "тест",
                "sources": [{"id": "tasks", "root_path": str(source)}],
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    open_db(vault / ".aecpilot" / "index.db").close()
    return project_json, source


def add_scanned(project_json, source, rel_path, text):
    """Put a file on disk and record it in `files` the way a scan would."""
    path = source / rel_path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    conn = open_db(project_json.parent / "index.db")
    conn.execute(
        "INSERT INTO files (source_id, rel_path, size, mtime, sha256, status, indexed_at) "
        "VALUES ('tasks', ?, 1, 1.0, ?, 'ok', '2026-08-15T00:00:00Z') "
        "ON CONFLICT (source_id, rel_path) DO UPDATE SET sha256 = excluded.sha256",
        (rel_path, hashlib.sha256(text.encode()).hexdigest()),
    )
    conn.commit()
    conn.close()


def fake_parser(path):
    from aec_rag.parse import ParsedDocument, ParsedSegment

    lines = path.read_text(encoding="utf-8").splitlines()
    return ParsedDocument(
        doctype="pdf",
        markdown="\n\n".join(lines),
        segments=tuple(
            ParsedSegment(locator={"page": number}, markdown=line)
            for number, line in enumerate(lines, start=1)
        ),
    )


def _ingest_with_stub_parser(real_ingest):
    async def run(*args, **kwargs):
        kwargs.setdefault("parser", fake_parser)
        return await real_ingest(*args, **kwargs)

    return run


async def stub_server(project_json, monkeypatch, llm_func=forbidden_llm):
    """The server as it ships, with the index and the parser stubbed."""
    import aec_rag.ingest as ingest_module
    import aec_rag.server as server_module

    server = build_server(project_json)
    settings = RagSettings(embedding_model="text-embedding-3-large", embedding_dim=DIM)
    server.rag_state._index = await open_index(
        project_json.parent.parent,
        settings,
        embedding_func=word_embedding(),
        llm_func=llm_func,
    )
    monkeypatch.setattr(ingest_module, "parse_file", fake_parser)
    monkeypatch.setattr(server_module, "ingest", _ingest_with_stub_parser(ingest_module.ingest))
    return server


async def call(client, name, arguments=None):
    result = await client.call_tool(name, arguments or {})
    if result.isError:
        raise AssertionError(
            "\n".join(block.text for block in result.content if hasattr(block, "text"))
        )
    return result.structuredContent


def error_text(result):
    return "\n".join(block.text for block in result.content if hasattr(block, "text"))


async def ingest_and_wait(client, server):
    started = await call(client, "rag_ingest", {})
    job = server.rag_state.jobs[started["job_id"]]
    await job.task
    assert job.status == "done", job.error
    return job


async def graph_add_and_wait(client, server, paths, kinds=None):
    started = await call(
        client, "rag_graph_add", {"paths": paths, **({"kinds": kinds} if kinds else {})}
    )
    job = server.rag_state.jobs[started["job_id"]]
    await job.task
    assert job.status == "done", job.error
    return started, job
