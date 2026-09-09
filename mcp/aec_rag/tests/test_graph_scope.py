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
    merge_scope,
    preview_add,
    read_scope,
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
