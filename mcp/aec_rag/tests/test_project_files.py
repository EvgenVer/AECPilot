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
