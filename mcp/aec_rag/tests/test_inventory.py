"""Tests for the index inventory (task 3J.8).

The database is filled by hand: the states are defined by the rows, and
building them through a real ingest would test ingest a second time.
"""

from __future__ import annotations

import json

from aec_rag.__main__ import main
from aec_rag.db import open_index
from aec_rag.graph_scope import ScopeEntry
from aec_rag.inventory import inventory


def add_file(conn, rel_path, sha="new", status="ok", skip_reason=None, source="s"):
    conn.execute(
        "INSERT INTO files (source_id, rel_path, size, mtime, sha256, status, skip_reason, "
        "indexed_at) VALUES (?, ?, 10, 1.0, ?, ?, ?, 't')",
        (source, rel_path, sha, status, skip_reason),
    )


def ingested(conn, rel_path, sha):
    conn.execute("INSERT INTO ingested_files VALUES ('s', ?, ?, 1, '2026-10-09')", (rel_path, sha))


def in_graph(conn, rel_path, sha):
    conn.execute("INSERT INTO graph_documents VALUES ('s', ?, ?, 1, '2026-10-09')", (rel_path, sha))


def error(conn, rel_path, sha, stage, code):
    conn.execute(
        "INSERT INTO file_errors VALUES ('s', ?, ?, ?, ?, 'деталь', 't')",
        (rel_path, sha, stage, code),
    )


def page(conn, rel_path, sha, number, state, err=None):
    conn.execute(
        "INSERT INTO pdf_pages VALUES ('s', ?, ?, ?, ?, NULL, ?)",
        (rel_path, sha, number, state, err),
    )


def by_path(result):
    return {file["rel_path"]: file for file in result["files"]}


def test_every_index_state(tmp_path):
    conn = open_index(tmp_path / "index.db")
    add_file(conn, "готов.pdf")
    ingested(conn, "готов.pdf", "new")
    add_file(conn, "изменён.pdf")
    ingested(conn, "изменён.pdf", "old")
    add_file(conn, "новый.pdf")
    add_file(conn, "сбой.pdf")
    error(conn, "сбой.pdf", "new", "index", "provider_key")
    add_file(conn, "заметки.txt")
    add_file(conn, "огромный.pdf", sha=None, skip_reason="too_large")
    add_file(conn, "удалён.pdf", status="deleted")
    add_file(conn, "отключён.pdf", source="gone")

    files = by_path(inventory(conn, [], ["s"]))

    assert {path: file["index"] for path, file in files.items()} == {
        "готов.pdf": "indexed",
        "изменён.pdf": "stale",
        "новый.pdf": "missing",
        "сбой.pdf": "failed",
        "заметки.txt": "skipped",
        "огромный.pdf": "skipped",
    }
    assert files["заметки.txt"]["reason"] == "unsupported"
    assert files["огромный.pdf"]["reason"] == "too_large"
    assert files["сбой.pdf"]["errors"] == [
        {"stage": "index", "code": "provider_key", "detail": "деталь", "at": "t"}
    ]


def test_an_error_of_an_older_content_is_not_shown(tmp_path):
    conn = open_index(tmp_path / "index.db")
    add_file(conn, "файл.pdf")
    error(conn, "файл.pdf", "old", "index", "parse_failed")

    file = by_path(inventory(conn, [], ["s"]))["файл.pdf"]

    assert file["index"] == "missing"
    assert file["errors"] == []


def test_scans_count_their_pages(tmp_path):
    conn = open_index(tmp_path / "index.db")
    add_file(conn, "скан.pdf")
    page(conn, "скан.pdf", "new", 1, "done")
    page(conn, "скан.pdf", "new", 2, "failed", "rapidocr упал")
    page(conn, "скан.pdf", "new", 3, "pending")
    page(conn, "скан.pdf", "old", 4, "failed", "прежняя версия")

    result = inventory(conn, [], ["s"])

    assert by_path(result)["скан.pdf"]["scans"] == {
        "done": 1,
        "total": 3,
        "failed": 1,
        "error": "rapidocr упал",
    }
    assert result["summary"]["scans"] == {
        "files": 1,
        "pages_done": 1,
        "pages_total": 3,
        "pages_failed": 1,
    }
    assert result["summary"]["with_errors"] == 1


def test_every_graph_state(tmp_path):
    conn = open_index(tmp_path / "index.db")
    for name in ("в графе.pdf", "устарел.pdf", "отмечен/а.pdf", "вне.pdf", "отмечен/план.dwg"):
        add_file(conn, name)
    in_graph(conn, "в графе.pdf", "new")
    in_graph(conn, "устарел.pdf", "old")
    error(conn, "отмечен/а.pdf", "new", "graph", "provider_limit")
    scope = [ScopeEntry(kind="folder", path="s/отмечен", added_at="t")]

    files = by_path(inventory(conn, scope, ["s"]))

    assert {path: file["graph"] for path, file in files.items()} == {
        "в графе.pdf": "in",
        "устарел.pdf": "stale",
        "отмечен/а.pdf": "marked",
        "вне.pdf": "none",
        "отмечен/план.dwg": "none",
    }
    assert files["отмечен/а.pdf"]["errors"][0]["code"] == "provider_limit"


def test_the_summary_counts_states(tmp_path):
    conn = open_index(tmp_path / "index.db")
    add_file(conn, "а.pdf")
    ingested(conn, "а.pdf", "new")
    add_file(conn, "б.pdf")

    summary = inventory(conn, [], ["s"])["summary"]

    assert summary["files"] == 2
    assert summary["index"] == {
        "indexed": 1,
        "stale": 0,
        "missing": 1,
        "failed": 0,
        "skipped": 0,
    }
    assert summary["graph"]["none"] == 2


def make_vault(tmp_path):
    vault = tmp_path / "vault"
    (vault / ".aecpilot").mkdir(parents=True)
    (vault / ".aecpilot" / "project.json").write_text(
        json.dumps({"schema_version": 1, "sources": [{"id": "s", "root_path": str(tmp_path)}]}),
        encoding="utf-8",
    )
    return vault


def test_the_cli_answers_without_an_index(tmp_path, capsys):
    vault = make_vault(tmp_path)

    code = main(["inventory", "--project", str(vault)])

    result = json.loads(capsys.readouterr().out)
    assert code == 0
    assert result["index_exists"] is False
    assert result["files"] == []
    assert result["summary"]["files"] == 0
    assert not (vault / ".aecpilot" / "index.db").exists()


def test_the_cli_reads_the_index(tmp_path, capsys):
    vault = make_vault(tmp_path)
    conn = open_index(vault / ".aecpilot" / "index.db")
    add_file(conn, "а.pdf")
    conn.commit()
    conn.close()

    code = main(["inventory", "--project", str(vault)])

    result = json.loads(capsys.readouterr().out)
    assert code == 0
    assert [file["index"] for file in result["files"]] == ["missing"]
