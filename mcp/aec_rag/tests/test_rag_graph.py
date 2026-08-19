"""Contract tests for tier 2 — the knowledge graph (tasks 2.10b, 2.11a).

The behaviour under test is SPECIFICATION UR24 and the two graph scenarios of
specs/qa-over-sources.md: the graph is empty until someone chooses otherwise, it
says how much work it is *before* doing it, a document outside it is still
searchable, and new files in a marked folder wait to be confirmed rather than
being billed for.
"""

from __future__ import annotations

import pytest
from mcp_harness import connected_session
from rag_stubs import (
    add_scanned,
    call,
    extracting_llm,
    graph_add_and_wait,
    ingest_and_wait,
    make_project,
    stub_server,
)


@pytest.fixture
def project(tmp_path):
    return make_project(tmp_path)


@pytest.fixture
def calls():
    return []


async def graph_server(project_json, monkeypatch, calls):
    return await stub_server(project_json, monkeypatch, llm_func=extracting_llm(calls))


@pytest.mark.anyio
async def test_a_clean_project_has_an_empty_graph(project, monkeypatch):
    """UR24: empty by default. A product that builds a graph on its own spends
    money nobody asked it to spend.
    """
    project_json, source = project
    add_scanned(project_json, source, "задание.pdf", "Мощность 250 кВт.")
    server = await stub_server(project_json, monkeypatch)

    async with connected_session(server) as client:
        await ingest_and_wait(client, server)
        scope = await call(client, "rag_graph_scope")

    assert scope["entries"] == []
    assert scope["documents"] == 0
    assert scope["in_graph"] == []
    assert scope["covers_whole_project"] is False


@pytest.mark.anyio
async def test_graph_add_says_how_much_work_it_is_before_doing_it(project, monkeypatch, calls):
    """The estimate is the point of the confirmation UR24 requires: a run that
    takes a quarter of an hour must not start at a moment nobody chose.
    """
    project_json, source = project
    add_scanned(project_json, source, "ЭОМ/задание.pdf", "Мощность 250 кВт.\nЩит ЩС-1.")
    server = await graph_server(project_json, monkeypatch, calls)

    async with connected_session(server) as client:
        await ingest_and_wait(client, server)
        started, job = await graph_add_and_wait(client, server, ["tasks/ЭОМ"])

        assert started["documents"] == 1
        assert started["chunks_estimate"] == 2
        assert started["not_indexed"] == 0
        assert job.report["documents_added"] == 1

        scope = await call(client, "rag_graph_scope")

    assert [entry["path"] for entry in scope["entries"]] == ["tasks/ЭОМ"]
    assert scope["in_graph"][0]["rel_path"] == "ЭОМ/задание.pdf"
    assert scope["pending"] == []
    assert calls, "граф без единого вызова модели построиться не мог"


@pytest.mark.anyio
async def test_a_document_outside_the_graph_is_still_searchable(project, monkeypatch, calls):
    """specs/qa-over-sources.md, «Документ не выбран в граф»: an ordinary
    question about it is answered by ordinary search, with a place.
    """
    project_json, source = project
    add_scanned(project_json, source, "ЭОМ/задание.pdf", "Мощность 250 кВт.")
    add_scanned(project_json, source, "ОВ/задание.pdf", "Тепловая нагрузка 40 кВт.")
    server = await graph_server(project_json, monkeypatch, calls)

    async with connected_session(server) as client:
        await ingest_and_wait(client, server)
        await graph_add_and_wait(client, server, ["tasks/ЭОМ"])

        found = await call(client, "rag_query", {"query": "тепловая нагрузка"})
        scope = await call(client, "rag_graph_scope")

    assert found["chunks"][0]["rel_path"] == "ОВ/задание.pdf"
    assert [document["rel_path"] for document in scope["in_graph"]] == ["ЭОМ/задание.pdf"]


@pytest.mark.anyio
async def test_new_files_in_a_marked_folder_wait_for_a_confirmation(project, monkeypatch, calls):
    """UR24: they are indexed cheaply at once and found by search, but they are
    NOT added to the graph silently — they appear as pending, with a number.
    """
    project_json, source = project
    add_scanned(project_json, source, "ЭОМ/задание.pdf", "Мощность 250 кВт.")
    server = await graph_server(project_json, monkeypatch, calls)

    async with connected_session(server) as client:
        await ingest_and_wait(client, server)
        await graph_add_and_wait(client, server, ["tasks/ЭОМ"])

        add_scanned(project_json, source, "ЭОМ/задание-ред2.pdf", "Мощность 320 кВт.")
        await ingest_and_wait(client, server)
        scope = await call(client, "rag_graph_scope")
        found = await call(client, "rag_query", {"query": "320"})

    assert [file["rel_path"] for file in scope["pending"]] == ["ЭОМ/задание-ред2.pdf"]
    assert scope["pending_estimate"]["chunks_estimate"] == 1
    assert [document["rel_path"] for document in scope["in_graph"]] == ["ЭОМ/задание.pdf"]
    assert found["chunks"], "новый файл обязан находиться поиском сразу"


@pytest.mark.anyio
async def test_a_marked_folder_does_not_swallow_its_neighbour(project, monkeypatch, calls):
    """Marking `ЭОМ` must not pull in `ЭОМ-2`: the comparison is on path
    segments, not on string prefixes.
    """
    project_json, source = project
    add_scanned(project_json, source, "ЭОМ/задание.pdf", "Мощность 250 кВт.")
    add_scanned(project_json, source, "ЭОМ-2/задание.pdf", "Мощность 90 кВт.")
    server = await graph_server(project_json, monkeypatch, calls)

    async with connected_session(server) as client:
        await ingest_and_wait(client, server)
        started, _ = await graph_add_and_wait(client, server, ["tasks/ЭОМ"])

    assert started["documents"] == 1


@pytest.mark.anyio
async def test_overview_returns_material_and_admits_partial_coverage(project, monkeypatch, calls):
    project_json, source = project
    add_scanned(project_json, source, "ЭОМ/задание.pdf", "Трансформатор ТМГ-1000 питает ЩС-1.")
    add_scanned(project_json, source, "ОВ/задание.pdf", "Тепловая нагрузка 40 кВт.")
    server = await graph_server(project_json, monkeypatch, calls)

    async with connected_session(server) as client:
        await ingest_and_wait(client, server)
        await graph_add_and_wait(client, server, ["tasks/ЭОМ"])
        result = await call(client, "rag_overview", {"query": "расскажи о проекте"})

    assert result["graph_scope"]["covers_whole_project"] is False
    assert result["graph_scope"]["documents_outside"] == 1
    names = {entity["name"] for entity in result["entities"]}
    assert names & {"ТМГ-1000", "ЩС-1"}
    cited = {
        document["rel_path"] for entity in result["entities"] for document in entity["documents"]
    }
    assert cited == {"ЭОМ/задание.pdf"}


@pytest.mark.anyio
async def test_overview_says_the_graph_covers_everything_when_it_does(project, monkeypatch, calls):
    project_json, source = project
    add_scanned(project_json, source, "ЭОМ/задание.pdf", "Трансформатор ТМГ-1000 питает ЩС-1.")
    server = await graph_server(project_json, monkeypatch, calls)

    async with connected_session(server) as client:
        await ingest_and_wait(client, server)
        await graph_add_and_wait(client, server, ["tasks"])
        result = await call(client, "rag_overview", {"query": "расскажи о проекте"})

    assert result["graph_scope"]["covers_whole_project"] is True


@pytest.mark.anyio
async def test_graph_add_without_paths_is_refused(project, monkeypatch):
    project_json, _ = project
    server = await stub_server(project_json, monkeypatch)

    async with connected_session(server) as client:
        result = await client.call_tool("rag_graph_add", {"paths": []})

    assert result.is_error


@pytest.mark.anyio
async def test_the_choice_survives_in_project_json(project, monkeypatch, calls):
    """The marked folders are project configuration, not index state: they have
    to outlive a re-index, and they are what the interface shows.
    """
    import json

    project_json, source = project
    add_scanned(project_json, source, "ЭОМ/задание.pdf", "Мощность 250 кВт.")
    server = await graph_server(project_json, monkeypatch, calls)

    async with connected_session(server) as client:
        await ingest_and_wait(client, server)
        await graph_add_and_wait(client, server, ["tasks/ЭОМ"])

    data = json.loads(project_json.read_text(encoding="utf-8"))
    assert data["graph_scope"]["entries"][0]["path"] == "tasks/ЭОМ"
    assert data["sources"], "чужие ключи project.json обязаны пережить запись"
