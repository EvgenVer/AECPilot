"""Tests for the project-file choice (task 3K.1, SPEC UR45)."""

from __future__ import annotations

import json

import pytest
from aec_rag.project_scope import (
    ProjectPathError,
    add_to_project_index,
    clean_rel,
    read_project_index,
    remove_from_project_index,
)


@pytest.fixture
def vault(tmp_path):
    vault = tmp_path / "vault"
    (vault / ".aecpilot").mkdir(parents=True)
    (vault / "wiki" / "разделы").mkdir(parents=True)
    (vault / "workspace").mkdir()
    (vault / "wiki" / "index.md").write_text("# Индекс", encoding="utf-8")
    (vault / "wiki" / "разделы" / "КР.md").write_text("# КР", encoding="utf-8")
    (vault / "workspace" / "черновик.txt").write_text("черновик", encoding="utf-8")
    (vault / ".aecpilot" / "project.json").write_text(
        json.dumps(
            {
                "schema_version": 1,
                "name": "тест",
                "sources": [],
                "graph_scope": {"entries": [{"path": "x/y", "kind": "folder", "added_at": "t"}]},
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    return vault, vault / ".aecpilot" / "project.json"


def paths(project_json):
    return [entry.path for entry in read_project_index(project_json)]


def test_a_folder_is_the_files_it_holds_now(vault):
    root, project_json = vault

    added = add_to_project_index(project_json, ["wiki"])
    (root / "wiki" / "новая.md").write_text("# Новая", encoding="utf-8")

    assert added == ["wiki/index.md", "wiki/разделы/КР.md"]
    # The file that appeared after the click is not marked (owner, 2026-10-09).
    assert paths(project_json) == ["wiki/index.md", "wiki/разделы/КР.md"]


def test_a_second_click_marks_nothing_new(vault):
    _root, project_json = vault
    add_to_project_index(project_json, ["workspace/черновик.txt"])

    assert add_to_project_index(project_json, ["workspace", "workspace/черновик.txt"]) == []
    assert paths(project_json) == ["workspace/черновик.txt"]


def test_other_fields_of_project_json_survive(vault):
    _root, project_json = vault

    add_to_project_index(project_json, ["wiki/index.md"])

    data = json.loads(project_json.read_text(encoding="utf-8"))
    assert data["graph_scope"]["entries"][0]["path"] == "x/y"
    assert data["name"] == "тест"


def test_removing_a_folder_unmarks_every_file_under_it(vault):
    _root, project_json = vault
    add_to_project_index(project_json, ["wiki", "workspace"])

    removed = remove_from_project_index(project_json, ["wiki/"])

    assert removed == ["wiki/index.md", "wiki/разделы/КР.md"]
    assert paths(project_json) == ["workspace/черновик.txt"]


def test_a_deleted_file_can_still_be_unmarked(vault):
    root, project_json = vault
    add_to_project_index(project_json, ["workspace/черновик.txt"])
    (root / "workspace" / "черновик.txt").unlink()

    assert remove_from_project_index(project_json, ["workspace/черновик.txt"]) == [
        "workspace/черновик.txt"
    ]


@pytest.mark.parametrize("bad", ["", "../чужое", "wiki/../../x", ".aecpilot/index.db", "C:/x"])
def test_paths_outside_the_vault_and_the_service_folder_are_refused(bad):
    with pytest.raises(ProjectPathError):
        clean_rel(bad)


def test_backslashes_and_ends_are_normalised():
    assert clean_rel("\\wiki\\разделы\\КР.md/") == "wiki/разделы/КР.md"


def test_a_missing_path_is_an_answer_not_a_crash(vault):
    _root, project_json = vault
    with pytest.raises(ProjectPathError):
        add_to_project_index(project_json, ["нет такого"])
    assert paths(project_json) == []


def test_the_service_folder_is_never_expanded_into(vault):
    root, project_json = vault
    (root / "workspace" / ".aecpilot").mkdir()
    (root / "workspace" / ".aecpilot" / "x.md").write_text("x", encoding="utf-8")

    # Only the top-level service folder is reserved; a same-named folder deeper
    # is the person's own.
    assert "workspace/.aecpilot/x.md" in add_to_project_index(project_json, ["workspace"])
    with pytest.raises(ProjectPathError):
        add_to_project_index(project_json, [".aecpilot"])
