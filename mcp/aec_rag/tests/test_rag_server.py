"""Contract tests for the aec-rag MCP tools (tasks 2.10, 2.11).

Checked against specs/qa-over-sources.md §API contracts through the real MCP
session, so the shape an agent sees is the shape asserted here.

The index is opened with stub models. The LLM stub asserts on call, which is how
«tier one never calls a model» is verified rather than asserted in prose.
"""

from __future__ import annotations

import hashlib
import json

import numpy as np
import pytest
from aec_rag.db import open_index as open_db
from aec_rag.rag_index import RagSettings, open_index
from aec_rag.server import build_server
from mcp.shared.memory import create_connected_server_and_client_session

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


@pytest.fixture
def project(tmp_path):
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


async def stub_server(project_json, monkeypatch):
    """A server whose index and parser are stubs, wired the way it ships."""
    import aec_rag.ingest as ingest_module
    import aec_rag.server as server_module

    server = build_server(project_json)
    settings = RagSettings(embedding_model="text-embedding-3-large", embedding_dim=DIM)
    server.rag_state._index = await open_index(
        project_json.parent.parent,
        settings,
        embedding_func=word_embedding(),
        llm_func=forbidden_llm,
    )
    monkeypatch.setattr(ingest_module, "parse_file", fake_parser)
    monkeypatch.setattr(server_module, "ingest", _ingest_with_stub_parser(ingest_module.ingest))
    return server


def _ingest_with_stub_parser(real_ingest):
    async def run(*args, **kwargs):
        kwargs.setdefault("parser", fake_parser)
        return await real_ingest(*args, **kwargs)

    return run


async def call(client, name, arguments=None):
    result = await client.call_tool(name, arguments or {})
    if result.isError:
        raise AssertionError(
            "\n".join(block.text for block in result.content if hasattr(block, "text"))
        )
    return result.structuredContent


async def ingest_and_wait(client, server):
    started = await call(client, "rag_ingest", {})
    job = server.rag_state.jobs[started["job_id"]]
    await job.task
    assert job.status == "done", job.error
    return job


@pytest.mark.anyio
async def test_ingest_returns_a_job_and_the_job_reports_what_it_did(project, monkeypatch):
    project_json, source = project
    add_scanned(project_json, source, "ЭОМ/задание.pdf", "Мощность 250 кВт.\nКатегория вторая.")
    server = await stub_server(project_json, monkeypatch)

    async with create_connected_server_and_client_session(server._mcp_server) as client:
        job = await ingest_and_wait(client, server)

        assert job.report["files_ingested"] == 1
        assert job.report["chunks"] == 2
        events = await call(client, "rag_job", {"job_id": job.job_id})
        assert events["events"][0]["stage"] == "started"
        assert events["events"][-1]["stage"] == "finished"


@pytest.mark.anyio
async def test_status_answers_what_the_index_holds(project, monkeypatch):
    project_json, source = project
    add_scanned(project_json, source, "задание.pdf", "Мощность 250 кВт.")
    server = await stub_server(project_json, monkeypatch)

    async with create_connected_server_and_client_session(server._mcp_server) as client:
        before = await call(client, "rag_status")
        assert before["files_total"] == 1
        assert before["files_indexed"] == 0
        assert before["stale_count"] == 1
        assert before["last_ingest_at"] is None

        await ingest_and_wait(client, server)
        after = await call(client, "rag_status")

        assert after["files_indexed"] == 1
        assert after["stale_count"] == 0
        assert after["last_ingest_at"] is not None
        assert after["graph"] == {
            "documents": 0,
            "chunks": 0,
            "documents_outside": 1,
            "covers_whole_project": False,
        }


@pytest.mark.anyio
async def test_query_returns_chunks_with_the_place_they_came_from(project, monkeypatch):
    project_json, source = project
    add_scanned(
        project_json,
        source,
        "ЭОМ/задание.pdf",
        "Установленная мощность 250 кВт.\nКатегория надёжности вторая.",
    )
    server = await stub_server(project_json, monkeypatch)

    async with create_connected_server_and_client_session(server._mcp_server) as client:
        await ingest_and_wait(client, server)
        result = await call(client, "rag_query", {"query": "установленная мощность"})

    top = result["chunks"][0]
    assert top["source_id"] == "tasks"
    assert top["rel_path"] == "ЭОМ/задание.pdf"
    assert top["locator"] == {"page": 1}
    assert "250 кВт" in top["text"]
    assert 0.0 < top["score"] <= 1.0


@pytest.mark.anyio
async def test_query_honours_filters(project, monkeypatch):
    project_json, source = project
    add_scanned(project_json, source, "ЭОМ/задание.pdf", "Мощность 250 кВт.")
    add_scanned(project_json, source, "ОВ/задание.pdf", "Мощность 40 кВт по отоплению.")
    server = await stub_server(project_json, monkeypatch)

    async with create_connected_server_and_client_session(server._mcp_server) as client:
        await ingest_and_wait(client, server)
        result = await call(
            client, "rag_query", {"query": "мощность", "filters": {"path_prefix": "ОВ/"}}
        )

    assert [chunk["rel_path"] for chunk in result["chunks"]] == ["ОВ/задание.pdf"]


@pytest.mark.anyio
async def test_query_never_returns_a_chunk_whose_file_is_gone(project, monkeypatch):
    """A vector can outlive its file for a moment. Citing a document the person
    cannot open is worse than one fewer result.
    """
    project_json, source = project
    add_scanned(project_json, source, "задание.pdf", "Мощность 250 кВт.")
    server = await stub_server(project_json, monkeypatch)

    async with create_connected_server_and_client_session(server._mcp_server) as client:
        await ingest_and_wait(client, server)
        conn = server.rag_state.db()
        conn.execute("DELETE FROM chunks")
        conn.commit()
        result = await call(client, "rag_query", {"query": "мощность"})

    assert result["chunks"] == []


@pytest.mark.anyio
async def test_an_unknown_mode_is_refused_rather_than_guessed(project, monkeypatch):
    project_json, _ = project
    server = await stub_server(project_json, monkeypatch)

    async with create_connected_server_and_client_session(server._mcp_server) as client:
        result = await client.call_tool("rag_ingest", {"mode": "быстро"})

    assert result.isError
    assert "быстро" in "\n".join(
        block.text for block in result.content if hasattr(block, "text")
    )


@pytest.mark.anyio
async def test_an_empty_query_is_refused(project, monkeypatch):
    project_json, _ = project
    server = await stub_server(project_json, monkeypatch)

    async with create_connected_server_and_client_session(server._mcp_server) as client:
        result = await client.call_tool("rag_query", {"query": "   "})

    assert result.isError
