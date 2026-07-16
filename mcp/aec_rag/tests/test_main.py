"""Tests for the aec-rag CLI (task 1.14): `aec-rag scan --project <path>`."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from aec_rag.__main__ import main


def make_vault(tmp_path: Path, sources: list[dict]) -> Path:
    vault = tmp_path / "vault"
    project_json = vault / ".aecpilot" / "project.json"
    project_json.parent.mkdir(parents=True)
    project_json.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "name": "Object-X",
                "created_at": "2026-07-14T00:00:00Z",
                "sources": sources,
                "settings": {"wiki_lang": "auto", "scan_interval_s": 300, "embedding_model": ""},
            }
        ),
        encoding="utf-8",
    )
    return vault


def test_scan_reports_added_files_and_writes_index_db(tmp_path, capsys):
    source_dir = tmp_path / "source"
    source_dir.mkdir()
    (source_dir / "a.txt").write_text("hello", encoding="utf-8")
    vault = make_vault(tmp_path, [{"id": "src-1", "root_path": str(source_dir), "added_at": "x"}])

    code = main(["scan", "--project", str(vault)])

    assert code == 0
    report = json.loads(capsys.readouterr().out)
    assert report["sources"]["src-1"]["added"] == ["a.txt"]
    assert report["sources"]["src-1"]["root_unavailable"] is False

    index_db = vault / ".aecpilot" / "index.db"
    assert index_db.is_file()
    conn = sqlite3.connect(str(index_db))
    rows = conn.execute("SELECT rel_path FROM files WHERE source_id = ?", ("src-1",)).fetchall()
    assert rows == [("a.txt",)]


def test_scan_accepts_project_json_path_directly(tmp_path, capsys):
    source_dir = tmp_path / "source"
    source_dir.mkdir()
    (source_dir / "a.txt").write_text("hello", encoding="utf-8")
    vault = make_vault(tmp_path, [{"id": "src-1", "root_path": str(source_dir), "added_at": "x"}])
    project_json = vault / ".aecpilot" / "project.json"

    code = main(["scan", "--project", str(project_json)])

    assert code == 0
    report = json.loads(capsys.readouterr().out)
    assert report["sources"]["src-1"]["added"] == ["a.txt"]
    assert (vault / ".aecpilot" / "index.db").is_file()


def test_scan_second_run_reports_unchanged(tmp_path, capsys):
    source_dir = tmp_path / "source"
    source_dir.mkdir()
    (source_dir / "a.txt").write_text("hello", encoding="utf-8")
    vault = make_vault(tmp_path, [{"id": "src-1", "root_path": str(source_dir), "added_at": "x"}])

    main(["scan", "--project", str(vault)])
    capsys.readouterr()  # discard first run's stdout
    code = main(["scan", "--project", str(vault)])

    assert code == 0
    report = json.loads(capsys.readouterr().out)
    assert report["sources"]["src-1"]["added"] == []
    assert report["sources"]["src-1"]["unchanged"] == 1


def test_scan_missing_vault_exits_1_with_stderr(tmp_path, capsys):
    missing_vault = tmp_path / "no-such-vault"

    code = main(["scan", "--project", str(missing_vault)])

    assert code == 1
    captured = capsys.readouterr()
    assert captured.out == ""
    assert "aec-rag:" in captured.err


def test_scan_invalid_json_exits_1_with_stderr(tmp_path, capsys):
    vault = tmp_path / "vault"
    project_json = vault / ".aecpilot" / "project.json"
    project_json.parent.mkdir(parents=True)
    project_json.write_text("{not valid json", encoding="utf-8")

    code = main(["scan", "--project", str(vault)])

    assert code == 1
    captured = capsys.readouterr()
    assert captured.out == ""
    assert "aec-rag:" in captured.err


def test_scan_unavailable_source_does_not_block_others(tmp_path, capsys):
    ok_source = tmp_path / "ok-source"
    ok_source.mkdir()
    (ok_source / "a.txt").write_text("hello", encoding="utf-8")
    missing_source = tmp_path / "does-not-exist"
    vault = make_vault(
        tmp_path,
        [
            {"id": "ok", "root_path": str(ok_source), "added_at": "x"},
            {"id": "missing", "root_path": str(missing_source), "added_at": "x"},
        ],
    )

    code = main(["scan", "--project", str(vault)])

    assert code == 0
    report = json.loads(capsys.readouterr().out)
    assert report["sources"]["ok"]["added"] == ["a.txt"]
    assert report["sources"]["ok"]["root_unavailable"] is False
    assert report["sources"]["missing"]["root_unavailable"] is True
