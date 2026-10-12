"""«Убрать из индекса» for a source file (task 3L.3, SPEC UR46).

What is under test: the file leaves everything the index holds — fragments,
vectors, its graph document, its inventory rows — but not the disk; the next
scan does not bring it back; «Индексировать» puts it back on the list and the
scan finds it again.
"""

from __future__ import annotations

import json
import sqlite3
from types import SimpleNamespace

import pytest
from aec_rag.__main__ import main
from aec_rag.index_exclude import (
    add_index_exclude,
    is_excluded,
    read_index_exclude,
    remove_index_exclude,
    split_place,
)
from aec_rag.lightrag_bridge import document_id
from aec_rag.project_scope import ProjectPathError

SOURCE = "src-1"


def make_vault(tmp_path):
    source = tmp_path / "source"
    (source / "КР").mkdir(parents=True)
    (source / "КР" / "Сваи.txt").write_text("Сваи С-1.", encoding="utf-8")
    (source / "КР" / "Ростверк.txt").write_text("Ростверк Рм-1.", encoding="utf-8")
    (source / "КР-2").mkdir()
    (source / "КР-2" / "Плиты.txt").write_text("Плита П-1.", encoding="utf-8")
    vault = tmp_path / "vault"
    (vault / ".aecpilot").mkdir(parents=True)
    (vault / ".aecpilot" / "project.json").write_text(
        json.dumps(
            {
                "schema_version": 1,
                "name": "тест",
                "created_at": "2026-10-12T00:00:00Z",
                "sources": [{"id": SOURCE, "root_path": str(source), "added_at": "x"}],
                "settings": {"wiki_lang": "auto", "scan_interval_s": 300, "embedding_model": ""},
                "graph_scope": {"entries": []},
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    return vault, source


def run(capsys, *argv):
    code = main(list(argv))
    lines = capsys.readouterr().out.strip().splitlines()
    return code, json.loads(lines[-1])


def rows(vault, table="files"):
    conn = sqlite3.connect(str(vault / ".aecpilot" / "index.db"))
    try:
        return sorted(
            rel
            for (rel,) in conn.execute(
                f"SELECT rel_path FROM {table} WHERE source_id = ?", (SOURCE,)
            ).fetchall()
        )
    finally:
        conn.close()


def seed_indexed(vault, rel):
    """What a finished ingest and graph run leave behind for one file."""
    from aec_rag.chunk import Chunk
    from aec_rag.db import open_index
    from aec_rag.graph_scope import mark_in_graph
    from aec_rag.store import store_chunks

    conn = open_index(vault / ".aecpilot" / "index.db")
    try:
        store_chunks(conn, SOURCE, rel, "sha", [Chunk(text="Сваи С-1.", locator={})])
        mark_in_graph(conn, SOURCE, rel, "sha", 1)
    finally:
        conn.close()


class FakeRag:
    def __init__(self):
        self.deleted = []

    async def adelete_by_doc_id(self, doc_id):
        self.deleted.append(doc_id)
        return SimpleNamespace(status="success", message="")


@pytest.fixture
def fake_rag(monkeypatch):
    from aec_rag import rag_index

    rag = FakeRag()

    async def fake_open(_vault, _settings):
        return rag

    monkeypatch.setattr(rag_index, "open_index", fake_open)
    monkeypatch.setattr(rag_index, "load_settings", lambda _path: None)
    return rag


def test_exclude_takes_the_file_out_of_everything_but_the_disk(tmp_path, capsys, fake_rag):
    from aec_rag import rag_index

    vault, source = make_vault(tmp_path)
    assert main(["scan", "--project", str(vault)]) == 0
    capsys.readouterr()
    seed_indexed(vault, "КР/Сваи.txt")
    rag_index.index_dir(vault).mkdir(parents=True)

    code, report = run(
        capsys, "index-exclude", "--project", str(vault), "--path", f"{SOURCE}/КР/Сваи.txt"
    )

    assert code == 0
    assert report["added"] == [f"{SOURCE}/КР/Сваи.txt"]
    assert report["removed"] == [f"{SOURCE}/КР/Сваи.txt"]
    assert report["excluded"] == [f"{SOURCE}/КР/Сваи.txt"]
    assert fake_rag.deleted == [document_id(SOURCE, "КР/Сваи.txt")]
    for table in ("files", "chunks", "ingested_files", "graph_documents"):
        assert "КР/Сваи.txt" not in rows(vault, table), table
    assert (source / "КР" / "Сваи.txt").is_file()
    assert rows(vault) == ["КР-2/Плиты.txt", "КР/Ростверк.txt"]


def test_the_scan_does_not_bring_an_excluded_file_back(tmp_path, capsys):
    vault, _source = make_vault(tmp_path)
    run(capsys, "index-exclude", "--project", str(vault), "--path", f"{SOURCE}/КР/Сваи.txt")

    assert main(["scan", "--project", str(vault)]) == 0
    report = json.loads(capsys.readouterr().out)["sources"][SOURCE]

    assert sorted(report["added"]) == ["КР-2/Плиты.txt", "КР/Ростверк.txt"]
    assert report["deleted"] == []
    assert rows(vault) == ["КР-2/Плиты.txt", "КР/Ростверк.txt"]


def test_a_folder_takes_what_is_under_it_and_not_its_namesake(tmp_path, capsys):
    vault, _source = make_vault(tmp_path)
    assert main(["scan", "--project", str(vault)]) == 0
    capsys.readouterr()

    _code, report = run(capsys, "index-exclude", "--project", str(vault), "--path", f"{SOURCE}/КР")

    assert report["removed"] == [f"{SOURCE}/КР/Ростверк.txt", f"{SOURCE}/КР/Сваи.txt"]
    assert rows(vault) == ["КР-2/Плиты.txt"]


def test_include_puts_it_back_and_the_scan_finds_it(tmp_path, capsys):
    vault, _source = make_vault(tmp_path)
    run(capsys, "index-exclude", "--project", str(vault), "--path", f"{SOURCE}/КР")

    code, report = run(
        capsys, "index-include", "--project", str(vault), "--path", f"{SOURCE}/КР/Сваи.txt"
    )

    # A file inside an excluded folder: the folder's entry is not this file,
    # so it stays — «Индексировать» on one file does not undo the folder.
    assert code == 0
    assert report["returned"] == []
    assert report["excluded"] == [f"{SOURCE}/КР"]

    _code, report = run(capsys, "index-include", "--project", str(vault), "--path", f"{SOURCE}/КР")

    assert report["returned"] == [f"{SOURCE}/КР"]
    assert report["excluded"] == []
    assert sorted(report["scan"][SOURCE]["added"]) == ["КР/Ростверк.txt", "КР/Сваи.txt"]
    assert "КР/Сваи.txt" in rows(vault)


def test_exclude_of_a_never_indexed_file_needs_no_provider(tmp_path, capsys, monkeypatch):
    from aec_rag import rag_index

    vault, _source = make_vault(tmp_path)
    assert main(["scan", "--project", str(vault)]) == 0
    capsys.readouterr()
    rag_index.index_dir(vault).mkdir(parents=True)

    def refuse(*_args):
        raise AssertionError("the vector store must not be opened")

    monkeypatch.setattr(rag_index, "load_settings", refuse)

    code, report = run(
        capsys, "index-exclude", "--project", str(vault), "--path", f"{SOURCE}/КР/Сваи.txt"
    )

    assert code == 0
    assert report["removed"] == [f"{SOURCE}/КР/Сваи.txt"]


def test_project_files_and_unknown_sources_are_refused(tmp_path, capsys):
    vault, _source = make_vault(tmp_path)

    code, report = run(capsys, "index-exclude", "--project", str(vault), "--path", "project/wiki")
    assert code == 1
    assert "снятием отметки" in report["fatal"]["detail"]

    code, report = run(capsys, "index-exclude", "--project", str(vault), "--path", "чужой/файл")
    assert code == 1
    assert "вне подключённых источников" in report["fatal"]["detail"]

    code, report = run(capsys, "index-exclude", "--project", str(vault), "--path", SOURCE)
    assert code == 1
    assert "нет файла внутри источника" in report["fatal"]["detail"]


def test_the_list_keeps_other_keys_and_is_not_doubled(tmp_path):
    vault, _source = make_vault(tmp_path)
    project_json = vault / ".aecpilot" / "project.json"

    assert add_index_exclude(project_json, [(SOURCE, "КР/Сваи.txt")]) == [f"{SOURCE}/КР/Сваи.txt"]
    assert add_index_exclude(project_json, [(SOURCE, "КР/Сваи.txt")]) == []
    assert [entry.place for entry in read_index_exclude(project_json)] == [f"{SOURCE}/КР/Сваи.txt"]
    data = json.loads(project_json.read_text(encoding="utf-8"))
    assert data["graph_scope"] == {"entries": []}
    assert remove_index_exclude(project_json, [(SOURCE, "КР")]) == [f"{SOURCE}/КР/Сваи.txt"]
    assert read_index_exclude(project_json) == []


def test_paths_are_compared_on_segments():
    assert is_excluded("КР/Сваи.txt", ["КР"])
    assert not is_excluded("КР-2/Плиты.txt", ["КР"])
    assert split_place("src-1\\КР\\Сваи.txt", ["src-1"]) == ("src-1", "КР/Сваи.txt")
    with pytest.raises(ProjectPathError):
        split_place("src-1/../чужое", ["src-1"])
