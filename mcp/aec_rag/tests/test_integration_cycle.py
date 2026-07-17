"""Integration test (task 1.19): the full cycle "подключить -> сканировать ->
изменить файл -> уведомление" (specs/workspace-sources.md, "Интеграционный
тест"), driven through the real CLI entry point (`aec-rag scan --project
<vault>`, same as apps/desktop's scan-runner would spawn), against a real
filesystem and a real index.db.

"Headless" here means no Electron/UI: the desktop app's toast (built by
apps/desktop/src/renderer/src/shell/scan-notification-pure.ts from the CLI's
JSON report) only appears when a scan report has a non-empty added/changed/
deleted list. So the headless equivalent of "no notification" is a report
that is unchanged-only, and the headless equivalent of "notification with
the list of changes" is a report whose added/changed/deleted match exactly
the files that were touched. This file focuses on that sequential, cross-scan
story and does not duplicate the CLI/unit coverage already in test_main.py,
test_indexer.py and test_edge_fixtures_rag.py.
"""

from __future__ import annotations

import json
import os
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


def _rows(index_db: Path, source_id: str) -> dict[str, tuple[str, str | None]]:
    conn = sqlite3.connect(str(index_db))
    try:
        rows = conn.execute(
            "SELECT rel_path, status, sha256 FROM files WHERE source_id = ?", (source_id,)
        ).fetchall()
    finally:
        conn.close()
    return {rel_path: (status, sha256) for rel_path, status, sha256 in rows}


def test_full_cycle_connect_scan_change_scan_notification(tmp_path, capsys):
    source_dir = tmp_path / "source"
    source_dir.mkdir()
    (source_dir / "a.txt").write_text("hello", encoding="utf-8")
    (source_dir / "b.txt").write_text("bye", encoding="utf-8")
    docs = source_dir / "Документы"
    docs.mkdir()
    (docs / "смета.txt").write_text("содержимое", encoding="utf-8")
    vault = make_vault(tmp_path, [{"id": "src-1", "root_path": str(source_dir), "added_at": "x"}])
    index_db = vault / ".aecpilot" / "index.db"

    # 1. connect a source + first scan: every file is reported added.
    code = main(["scan", "--project", str(vault)])
    report = json.loads(capsys.readouterr().out)

    assert code == 0
    src_report = report["sources"]["src-1"]
    assert set(src_report["added"]) == {"a.txt", "b.txt", "Документы/смета.txt"}
    assert src_report["changed"] == []
    assert src_report["deleted"] == []
    assert src_report["unchanged"] == 0
    assert src_report["root_unavailable"] is False

    rows = _rows(index_db, "src-1")
    assert set(rows) == {"a.txt", "b.txt", "Документы/смета.txt"}
    for status, sha256 in rows.values():
        assert status == "ok"
        assert sha256 is not None

    # 2. second scan, nothing changed: headless equivalent of "no toast".
    code = main(["scan", "--project", str(vault)])
    report = json.loads(capsys.readouterr().out)

    assert code == 0
    src_report = report["sources"]["src-1"]
    assert src_report["added"] == []
    assert src_report["changed"] == []
    assert src_report["deleted"] == []
    assert src_report["unchanged"] == 3

    # 3. change a.txt, add c.txt, delete b.txt.
    a_path = source_dir / "a.txt"
    a_path.write_text("hello world - modified", encoding="utf-8")
    future = a_path.stat().st_mtime + 5
    os.utime(a_path, (future, future))
    (source_dir / "c.txt").write_text("new file", encoding="utf-8")
    (source_dir / "b.txt").unlink()

    code = main(["scan", "--project", str(vault)])
    report = json.loads(capsys.readouterr().out)

    assert code == 0
    src_report = report["sources"]["src-1"]
    assert src_report["added"] == ["c.txt"]
    assert src_report["changed"] == ["a.txt"]
    assert src_report["deleted"] == ["b.txt"]
    # headless equivalent of "toast with the list of changes": exactly these
    # non-empty lists are what buildScanNotification (renderer) turns into a
    # toast, unlike the unchanged-only report from step 2.
    assert any([src_report["added"], src_report["changed"], src_report["deleted"]])

    rows = _rows(index_db, "src-1")
    assert rows["a.txt"][0] == "changed"
    assert rows["c.txt"][0] == "ok"
    assert rows["b.txt"][0] == "deleted"
    assert rows["Документы/смета.txt"][0] == "ok"


def test_source_root_disappearing_between_scans_marks_root_unavailable_and_preserves_index(
    tmp_path, capsys
):
    source_dir = tmp_path / "source"
    source_dir.mkdir()
    (source_dir / "a.txt").write_text("hello", encoding="utf-8")
    vault = make_vault(tmp_path, [{"id": "src-1", "root_path": str(source_dir), "added_at": "x"}])
    index_db = vault / ".aecpilot" / "index.db"

    code = main(["scan", "--project", str(vault)])
    report = json.loads(capsys.readouterr().out)
    assert code == 0
    assert report["sources"]["src-1"]["added"] == ["a.txt"]

    rows_before = _rows(index_db, "src-1")
    assert rows_before["a.txt"][0] == "ok"

    # The source root disappears (e.g. a dropped network share) before the
    # next scan.
    for entry in source_dir.iterdir():
        entry.unlink()
    source_dir.rmdir()

    code = main(["scan", "--project", str(vault)])
    report = json.loads(capsys.readouterr().out)

    assert code == 0
    src_report = report["sources"]["src-1"]
    assert src_report["root_unavailable"] is True
    assert src_report["added"] == []
    assert src_report["changed"] == []
    assert src_report["deleted"] == []

    rows_after = _rows(index_db, "src-1")
    # not marked deleted just because the whole root vanished temporarily.
    assert rows_after["a.txt"][0] == "ok"
