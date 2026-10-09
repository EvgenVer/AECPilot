"""The project's own files in the scanner and the roots (task 3K.2, SPEC UR45).

The rule under test is «never on its own»: a vault file nobody marked is never
read, while a marked one behaves exactly like a file of a source.
"""

from __future__ import annotations

import json
import sqlite3

from aec_rag.__main__ import main
from aec_rag.project_scope import PROJECT_SOURCE_ID, add_to_project_index, all_roots


def make_vault(tmp_path):
    vault = tmp_path / "vault"
    (vault / ".aecpilot").mkdir(parents=True)
    (vault / "wiki").mkdir()
    (vault / "workspace").mkdir()
    (vault / "wiki" / "КР.md").write_text("# КР\nСваи С-1.", encoding="utf-8")
    (vault / "wiki" / "ОВ.md").write_text("# ОВ", encoding="utf-8")
    (vault / "workspace" / "черновик.txt").write_text("черновик", encoding="utf-8")
    (vault / ".aecpilot" / "project.json").write_text(
        json.dumps(
            {
                "schema_version": 1,
                "name": "тест",
                "created_at": "2026-10-09T00:00:00Z",
                "sources": [],
                "settings": {"wiki_lang": "auto", "scan_interval_s": 300, "embedding_model": ""},
            }
        ),
        encoding="utf-8",
    )
    return vault


def project_rows(vault):
    conn = sqlite3.connect(str(vault / ".aecpilot" / "index.db"))
    try:
        return dict(
            conn.execute(
                "SELECT rel_path, status FROM files WHERE source_id = ? ORDER BY rel_path",
                (PROJECT_SOURCE_ID,),
            ).fetchall()
        )
    finally:
        conn.close()


def scan(vault, capsys):
    assert main(["scan", "--project", str(vault)]) == 0
    return json.loads(capsys.readouterr().out)["sources"][PROJECT_SOURCE_ID]


def test_nothing_of_the_vault_is_scanned_unless_marked(tmp_path, capsys):
    vault = make_vault(tmp_path)

    report = scan(vault, capsys)

    assert report["added"] == []
    assert project_rows(vault) == {}


def test_only_marked_files_are_scanned(tmp_path, capsys):
    vault = make_vault(tmp_path)
    add_to_project_index(vault / ".aecpilot" / "project.json", ["wiki/КР.md", "workspace"])

    report = scan(vault, capsys)

    assert sorted(report["added"]) == ["wiki/КР.md", "workspace/черновик.txt"]
    assert "wiki/ОВ.md" not in project_rows(vault)


def test_a_marked_file_changes_and_disappears_like_a_source_file(tmp_path, capsys):
    vault = make_vault(tmp_path)
    add_to_project_index(vault / ".aecpilot" / "project.json", ["wiki/КР.md", "wiki/ОВ.md"])
    scan(vault, capsys)

    (vault / "wiki" / "КР.md").write_text("# КР\nСваи С-2, длина 12 м.", encoding="utf-8")
    (vault / "wiki" / "ОВ.md").unlink()
    report = scan(vault, capsys)

    assert report["changed"] == ["wiki/КР.md"]
    assert report["deleted"] == ["wiki/ОВ.md"]


def test_project_rows_are_not_swept_as_an_orphan_source(tmp_path, capsys):
    """The sweep detaches every source id absent from project.json — and
    ``project`` is never in its sources list."""
    vault = make_vault(tmp_path)
    add_to_project_index(vault / ".aecpilot" / "project.json", ["wiki/КР.md"])
    scan(vault, capsys)
    scan(vault, capsys)

    assert project_rows(vault) == {"wiki/КР.md": "ok"}


def test_all_roots_names_the_vault(tmp_path):
    vault = make_vault(tmp_path)

    roots = all_roots(vault / ".aecpilot" / "project.json")

    assert roots == {PROJECT_SOURCE_ID: str(vault)}


def test_the_inventory_lists_marked_project_files(tmp_path, capsys):
    vault = make_vault(tmp_path)
    add_to_project_index(vault / ".aecpilot" / "project.json", ["wiki/КР.md"])
    scan(vault, capsys)

    assert main(["inventory", "--project", str(vault)]) == 0
    files = json.loads(capsys.readouterr().out)["files"]

    assert [(f["source_id"], f["rel_path"], f["index"]) for f in files] == [
        (PROJECT_SOURCE_ID, "wiki/КР.md", "missing")
    ]


# --- task 3K.7: the agent's search tells a project file from a source ---------


def test_search_marks_project_files_and_only_them(tmp_path):
    import asyncio
    from types import SimpleNamespace

    from aec_rag.chunk import Chunk
    from aec_rag.db import open_index
    from aec_rag.server import search_chunks
    from aec_rag.store import store_chunks

    conn = open_index(tmp_path / "index.db")
    store_chunks(conn, PROJECT_SOURCE_ID, "wiki/КР.md", "a", [Chunk(text="Сваи С-1", locator={})])
    store_chunks(conn, "tasks", "задание.pdf", "b", [Chunk(text="Сваи С-2", locator={"page": 3})])

    async def no_vectors(_query, top_k):
        return []

    rag = SimpleNamespace(chunks_vdb=SimpleNamespace(query=no_vectors))
    hits = asyncio.run(search_chunks(conn, rag, "Сваи"))
    conn.close()

    marks = {hit["rel_path"]: hit.get("project_file") for hit in hits}
    assert marks == {"wiki/КР.md": True, "задание.pdf": None}


def test_the_search_tool_tells_the_agent_how_to_treat_a_project_file():
    """Owner's decision, 2026-10-09 (waiver — no eval): the description is the
    only place the agent learns this."""
    import inspect

    from aec_rag import server

    source = inspect.getsource(server)
    assert "`project_file: true`" in source
    assert "[src: project/<rel_path>]" in source
    assert "never present it as a primary source" in source


# --- task 3K.3: project-include / project-exclude ---------------------------


def run(capsys, *argv):
    code = main(list(argv))
    lines = capsys.readouterr().out.strip().splitlines()
    return code, json.loads(lines[-1])


def test_include_marks_scans_and_names_what_to_index(tmp_path, capsys):
    vault = make_vault(tmp_path)

    code, report = run(
        capsys,
        "project-include",
        "--project",
        str(vault),
        "--path",
        "workspace",
        "--path",
        "wiki/КР.md",
    )

    assert code == 0
    assert report["selected"] == ["wiki/КР.md", "workspace/черновик.txt"]
    assert report["files"] == ["workspace/черновик.txt", "wiki/КР.md"]
    assert sorted(report["scan"]["added"]) == ["wiki/КР.md", "workspace/черновик.txt"]
    assert set(project_rows(vault)) == {"wiki/КР.md", "workspace/черновик.txt"}


def test_a_second_include_still_names_the_file(tmp_path, capsys):
    """A run stopped before the file was read: the next click must index it,
    although nothing new gets marked."""
    vault = make_vault(tmp_path)
    run(capsys, "project-include", "--project", str(vault), "--path", "wiki/КР.md")

    _code, report = run(capsys, "project-include", "--project", str(vault), "--path", "wiki")

    assert report["added"] == ["wiki/ОВ.md"]
    assert report["selected"] == ["wiki/КР.md", "wiki/ОВ.md"]


def test_include_of_a_path_outside_the_project_is_an_answer(tmp_path, capsys):
    vault = make_vault(tmp_path)

    code, report = run(capsys, "project-include", "--project", str(vault), "--path", "../чужое")

    assert code == 1
    assert "путь вне проекта" in report["fatal"]["detail"]


def seed_indexed(vault, rel):
    """What a finished ingest and graph run leave behind for one file."""
    from aec_rag.chunk import Chunk
    from aec_rag.db import open_index
    from aec_rag.graph_scope import mark_in_graph
    from aec_rag.store import record_file_error, store_chunks

    conn = open_index(vault / ".aecpilot" / "index.db")
    try:
        store_chunks(conn, PROJECT_SOURCE_ID, rel, "sha", [Chunk(text="Сваи С-1.", locator={})])
        mark_in_graph(conn, PROJECT_SOURCE_ID, rel, "sha", 1)
        record_file_error(conn, PROJECT_SOURCE_ID, rel, "sha", "index", "parse_failed", "x")
    finally:
        conn.close()


class FakeRag:
    def __init__(self):
        self.deleted = []

    async def adelete_by_doc_id(self, doc_id):
        from types import SimpleNamespace

        self.deleted.append(doc_id)
        return SimpleNamespace(status="success", message="")


def test_exclude_takes_the_file_out_of_everything_but_the_disk(tmp_path, capsys, monkeypatch):
    from aec_rag import rag_index
    from aec_rag.lightrag_bridge import document_id

    vault = make_vault(tmp_path)
    run(capsys, "project-include", "--project", str(vault), "--path", "wiki")
    seed_indexed(vault, "wiki/КР.md")
    rag_index.index_dir(vault).mkdir(parents=True)
    rag = FakeRag()

    async def fake_open(_vault, _settings):
        return rag

    monkeypatch.setattr(rag_index, "open_index", fake_open)
    monkeypatch.setattr(rag_index, "load_settings", lambda _path: None)

    code, report = run(capsys, "project-exclude", "--project", str(vault), "--path", "wiki/КР.md")

    assert code == 0
    assert report == {"removed": ["wiki/КР.md"], "files": ["wiki/ОВ.md"]}
    assert rag.deleted == [document_id(PROJECT_SOURCE_ID, "wiki/КР.md")]
    conn = sqlite3.connect(str(vault / ".aecpilot" / "index.db"))
    try:
        for table in ("files", "chunks", "ingested_files", "graph_documents", "file_errors"):
            left = conn.execute(
                f"SELECT count(*) FROM {table} WHERE source_id = ? AND rel_path = ?",
                (PROJECT_SOURCE_ID, "wiki/КР.md"),
            ).fetchone()[0]
            assert left == 0, table
    finally:
        conn.close()
    assert (vault / "wiki" / "КР.md").is_file()
    assert "wiki/ОВ.md" in project_rows(vault)


def test_exclude_of_a_never_indexed_file_needs_no_provider(tmp_path, capsys, monkeypatch):
    """Only scanned, never read: nothing in the vector store, so it is not
    opened — unmarking must work with no provider configured at all."""
    from aec_rag import rag_index

    vault = make_vault(tmp_path)
    run(capsys, "project-include", "--project", str(vault), "--path", "workspace")
    rag_index.index_dir(vault).mkdir(parents=True)

    def refuse(*_args):
        raise AssertionError("the vector store must not be opened")

    monkeypatch.setattr(rag_index, "load_settings", refuse)

    code, report = run(capsys, "project-exclude", "--project", str(vault), "--path", "workspace")

    assert code == 0
    assert report == {"removed": ["workspace/черновик.txt"], "files": []}
    assert project_rows(vault) == {}
    # And the next scan does not bring it back.
    assert scan(vault, capsys)["added"] == []
