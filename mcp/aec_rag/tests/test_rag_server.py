"""Contract tests for the aec-rag MCP tools (tasks 2.10, 2.11).

Checked against specs/qa-over-sources.md §API contracts through the real MCP
session, so the shape an agent sees is the shape asserted here.

The LLM stub asserts on call. That is how «tier one never calls a model»
(SPECIFICATION UR24) is verified rather than stated in prose.
"""

from __future__ import annotations

import anyio
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
    """D-142: отказ — обычный ответ, а не ошибка, которую ядро считает сбоем сервера."""
    project_json, _ = project
    server = await stub_server(project_json, monkeypatch)

    async with connected_session(server) as client:
        for tool in ("rag_query", "rag_overview"):
            result = await call(client, tool, {"query": " \t "})
            assert result["ok"] is False
            assert "пустой запрос" in result["refused"]


@pytest.mark.anyio
async def test_wiki_write_refusals_are_answers_not_errors(project, monkeypatch):
    """D-142, D-143: чужой абзац и путь вне раскладки — ответ `{ok: false, refused}`."""
    from aec_rag.wiki import checkpoint_pages

    project_json, _ = project
    vault = project_json.parent.parent
    server = await stub_server(project_json, monkeypatch)

    async with connected_session(server) as client:
        await call(client, "wiki_init", {})
        page = "wiki/entities/ТП-1.md"
        await call(client, "wiki_write_page", {"rel": page, "text": "Мощность 250 кВт."})
        checkpoint_pages(vault)
        (vault / page).write_text("Мощность 250 кВт.\n\nАбзац человека.", encoding="utf-8")

        lost = await call(client, "wiki_write_page", {"rel": page, "text": "Мощность 320 кВт."})
        assert lost["ok"] is False
        assert "Абзац человека" in lost["refused"]

        stray = await call(
            client, "wiki_write_page", {"rel": "wiki/annotations/update.md", "text": "x"}
        )
        assert stray["ok"] is False
        assert "wiki/entities/" in stray["refused"]
        assert not (vault / "wiki" / "annotations").exists()


@pytest.mark.anyio
async def test_a_real_write_failure_stays_an_error(project, monkeypatch):
    """Настоящая поломка (диск) — по-прежнему ошибка: её скрывать нельзя."""
    import aec_rag.wiki as wiki_module

    project_json, _ = project
    server = await stub_server(project_json, monkeypatch)

    def broken(*_args, **_kwargs):
        raise OSError("диск недоступен")

    monkeypatch.setattr(wiki_module, "write_page", broken)
    async with connected_session(server) as client:
        result = await client.call_tool(
            "wiki_write_page", {"rel": "wiki/entities/ТП-1.md", "text": "x"}
        )

    assert result.is_error
    assert "диск недоступен" in error_text(result)


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


# --- Находка D-49: две мутирующие задачи разом ------------------------------
#
# `rag_ingest` и `rag_graph_add` заводили `asyncio.create_task` без всякого
# взаимного исключения. Две такие задачи работают на ОДНОМ `sqlite3.Connection`
# и одном экземпляре LightRAG; зовёт их модель, поэтому ограничения в окне тут
# не помогают. Тесты держат наблюдаемое обещание — «вторую не начинаем», — а не
# устройство замка.


class _EmptyReport:
    """Отчёт-заглушка: тесту важна очерёдность, а не содержимое."""

    def as_dict(self):
        return {"files_ingested": 0, "chunks": 0}


def _hanging_ingest(release):
    async def run(*args, **kwargs):
        await release.wait()
        return _EmptyReport()

    return run


@pytest.mark.anyio
async def test_second_ingest_is_refused_while_the_first_still_runs(project, monkeypatch):
    import aec_rag.server as server_module

    project_json, source = project
    add_scanned(project_json, source, "задание.pdf", "Мощность 250 кВт.")
    server = await stub_server(project_json, monkeypatch)

    release = anyio.Event()
    monkeypatch.setattr(server_module, "ingest", _hanging_ingest(release))

    async with connected_session(server) as client:
        first = await call(client, "rag_ingest", {})

        second = await client.call_tool("rag_ingest", {})

        assert second.is_error, "вторая задача начала работать поверх первой"
        message = error_text(second)
        # В отказе обязан стоять идентификатор работающей задачи: без него
        # модели некуда пойти, и она просто попробует ещё раз.
        assert first["job_id"] in message, message

        release.set()
        await server.rag_state.jobs[first["job_id"]].task


@pytest.mark.anyio
async def test_graph_add_is_refused_while_an_ingest_runs(project, monkeypatch):
    """Разные виды задач — тот же общий conn и тот же LightRAG."""
    import aec_rag.server as server_module

    project_json, source = project
    add_scanned(project_json, source, "задание.pdf", "Мощность 250 кВт.")
    server = await stub_server(project_json, monkeypatch)

    release = anyio.Event()
    monkeypatch.setattr(server_module, "ingest", _hanging_ingest(release))

    async with connected_session(server) as client:
        first = await call(client, "rag_ingest", {})
        before = (project_json).read_text(encoding="utf-8")

        refused = await client.call_tool("rag_graph_add", {"paths": ["tasks/задание.pdf"]})

        assert refused.is_error
        # Отказ приходит РАНЬШЕ, чем что-либо записано: `add_to_scope` правит
        # project.json, и сделать это, а потом отказать — хуже, чем отказать.
        assert project_json.read_text(encoding="utf-8") == before

        release.set()
        await server.rag_state.jobs[first["job_id"]].task


@pytest.mark.anyio
async def test_the_next_job_starts_once_the_first_has_finished(project, monkeypatch):
    """Замок не должен превратиться в «одна задача на всю жизнь сервера»."""
    project_json, source = project
    add_scanned(project_json, source, "задание.pdf", "Мощность 250 кВт.")
    server = await stub_server(project_json, monkeypatch)

    async with connected_session(server) as client:
        await ingest_and_wait(client, server)

        second = await call(client, "rag_ingest", {})

        assert second["job_id"] in server.rag_state.jobs
        await server.rag_state.jobs[second["job_id"]].task


@pytest.mark.anyio
async def test_a_failed_job_does_not_wedge_the_lock(project, monkeypatch):
    """Упавшая задача обязана освободить место — иначе один сбой глушит сервер."""
    import aec_rag.server as server_module

    project_json, source = project
    add_scanned(project_json, source, "задание.pdf", "Мощность 250 кВт.")
    server = await stub_server(project_json, monkeypatch)

    async def failing(*args, **kwargs):
        raise RuntimeError("нарочно")

    monkeypatch.setattr(server_module, "ingest", failing)

    async with connected_session(server) as client:
        first = await call(client, "rag_ingest", {})
        job = server.rag_state.jobs[first["job_id"]]
        await job.task
        assert job.status == "failed"

        # Место свободно: следующая задача заводится.
        again = await call(client, "rag_ingest", {})
        assert again["job_id"] != first["job_id"]
        await server.rag_state.jobs[again["job_id"]].task
