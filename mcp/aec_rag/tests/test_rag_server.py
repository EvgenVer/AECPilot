"""Contract tests for the aec-rag MCP tools (tasks 2.10, 2.11).

Checked against specs/qa-over-sources.md §API contracts through the real MCP
session, so the shape an agent sees is the shape asserted here.

The LLM stub asserts on call. That is how «tier one never calls a model»
(SPECIFICATION UR24) is verified rather than stated in prose.
"""

from __future__ import annotations

import pytest
from mcp_harness import connected_session
from rag_stubs import (
    add_scanned,
    call,
    error_text,
    ingest_and_wait,
    make_project,
    stub_server,
)


@pytest.fixture
def project(tmp_path):
    return make_project(tmp_path)


@pytest.mark.anyio
async def test_ingest_returns_a_job_and_the_job_reports_what_it_did(project, monkeypatch):
    project_json, source = project
    add_scanned(project_json, source, "ЭОМ/задание.pdf", "Мощность 250 кВт.\nКатегория вторая.")
    server = await stub_server(project_json, monkeypatch)

    async with connected_session(server) as client:
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

    async with connected_session(server) as client:
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

    async with connected_session(server) as client:
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

    async with connected_session(server) as client:
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

    async with connected_session(server) as client:
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

    async with connected_session(server) as client:
        result = await client.call_tool("rag_ingest", {"mode": "быстро"})

    assert result.is_error
    assert "быстро" in error_text(result)


@pytest.mark.anyio
async def test_an_empty_query_is_refused(project, monkeypatch):
    project_json, _ = project
    server = await stub_server(project_json, monkeypatch)

    async with connected_session(server) as client:
        result = await client.call_tool("rag_query", {"query": "   "})

    assert result.is_error


@pytest.mark.anyio
async def test_wiki_init_creates_the_skeleton_through_the_tool(project, monkeypatch):
    """Задача 4.7: скилу вики нужен именно инструмент, а не CLI."""
    project_json, _ = project
    server = await stub_server(project_json, monkeypatch)

    async with connected_session(server) as client:
        result = await client.call_tool("wiki_init", {})

    assert not result.is_error
    vault = project_json.parent.parent
    assert (vault / "wiki" / "SCHEMA.md").is_file()
    assert (vault / "wiki" / "entities").is_dir()
