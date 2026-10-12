"""Выбор документов для графа: что считается «уже отмеченным» и чего стоит
предпросмотр (задачи 2.10b, 5.15).

Здесь проверяется не MCP-контракт (он в `test_rag_graph.py`), а две вещи, от
которых зависит честность подтверждения из проводника: повторная отметка ничего
не добавляет, а предпросмотр ничего не пишет.
"""

from __future__ import annotations

import json

from aec_rag.db import open_index
from aec_rag.graph_scope import (
    ScopeEntry,
    add_to_scope,
    mark_in_graph,
    merge_scope,
    pending_for_scope,
    preview_add,
    preview_rebuild,
    read_scope,
    scope_files,
)


def make_vault(tmp_path):
    vault = tmp_path / "vault"
    project_json = vault / ".aecpilot" / "project.json"
    project_json.parent.mkdir(parents=True)
    project_json.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "name": "тест",
                "sources": [{"id": "tasks", "root_path": str(tmp_path / "источник")}],
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    return project_json


def folder(path: str) -> ScopeEntry:
    return ScopeEntry(path=path, kind="folder", added_at="2026-09-09T00:00:00Z")


def test_a_second_click_on_the_same_folder_adds_nothing():
    entries, added = merge_scope([folder("tasks/ЭОМ")], ["tasks/ЭОМ"], {})

    assert [entry.path for entry in entries] == ["tasks/ЭОМ"]
    assert added == []


def test_a_file_inside_a_marked_folder_is_already_in_the_graph():
    """Своей записи такой файл не получает: папка его уже покрывает, и вторая
    запись сделала бы список «что входит в граф» длиннее правды."""
    entries, added = merge_scope(
        [folder("tasks/ЭОМ")], ["tasks/ЭОМ/задание.pdf"], {"tasks/ЭОМ/задание.pdf": "file"}
    )

    assert [entry.path for entry in entries] == ["tasks/ЭОМ"]
    assert added == []


def test_a_marked_folder_does_not_swallow_its_neighbour():
    entries, added = merge_scope([folder("tasks/ЭОМ")], ["tasks/ЭОМ-2"], {})

    assert [entry.path for entry in entries] == ["tasks/ЭОМ", "tasks/ЭОМ-2"]
    assert [entry.path for entry in added] == ["tasks/ЭОМ-2"]


def test_a_path_written_with_slashes_and_spaces_is_the_same_path():
    entries, added = merge_scope([folder("tasks/ЭОМ")], ["  tasks/ЭОМ/  "], {})

    assert added == []
    assert len(entries) == 1


def test_the_root_of_a_source_is_markable():
    entries, added = merge_scope([], ["tasks"], {})

    assert [(entry.path, entry.kind) for entry in added] == [("tasks", "folder")]
    assert len(entries) == 1


def test_preview_writes_nothing_to_project_json(tmp_path):
    """Главное свойство задачи 5.15: отказ ничего не индексирует и ничего не
    помечает. Проверяется побайтово — «почти тот же файл» здесь не считается."""
    project_json = make_vault(tmp_path)
    before = project_json.read_bytes()
    conn = open_index(project_json.parent / "index.db")
    try:
        preview = preview_add(conn, project_json, ["tasks/ЭОМ"], {})
    finally:
        conn.close()

    assert project_json.read_bytes() == before
    assert read_scope(project_json) == []
    assert [entry["path"] for entry in preview["adds"]] == ["tasks/ЭОМ"]
    assert preview["documents"] == 0


def test_preview_says_nothing_is_new_when_the_scope_already_covers_it(tmp_path):
    project_json = make_vault(tmp_path)
    add_to_scope(project_json, ["tasks/ЭОМ"], {})
    conn = open_index(project_json.parent / "index.db")
    try:
        preview = preview_add(conn, project_json, ["tasks/ЭОМ"], {})
    finally:
        conn.close()

    assert preview["adds"] == []
    assert [entry["path"] for entry in preview["entries"]] == ["tasks/ЭОМ"]


def test_a_rebuild_covers_what_is_already_in_the_graph_and_writes_nothing(tmp_path):
    """Task 3L.7 «Перестроить граф»: the same marks, every document under them
    extracted again — the one already in the graph is the point, not skipped."""
    import hashlib

    from rag_stubs import add_scanned

    project_json = make_vault(tmp_path)
    source = tmp_path / "источник"
    text = "Плита перекрытия 200 мм."
    add_scanned(project_json, source, "ЭОМ/задание.pdf", text)
    add_to_scope(project_json, ["tasks/ЭОМ"], {})
    conn = open_index(project_json.parent / "index.db")
    try:
        sha = hashlib.sha256(text.encode()).hexdigest()
        mark_in_graph(conn, "tasks", "ЭОМ/задание.pdf", sha, 1)
        entries = read_scope(project_json)
        before = project_json.read_bytes()

        assert pending_for_scope(conn, entries) == []
        assert [file.rel_path for file in scope_files(conn, entries)] == ["ЭОМ/задание.pdf"]
        preview = preview_rebuild(conn, project_json)
    finally:
        conn.close()

    assert project_json.read_bytes() == before
    assert preview["documents"] == 1
    assert preview["adds"] == []
    assert [entry["path"] for entry in preview["entries"]] == ["tasks/ЭОМ"]
