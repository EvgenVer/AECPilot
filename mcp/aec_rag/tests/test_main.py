"""Tests for the aec-rag CLI (task 1.14): `aec-rag scan --project <path>`."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import pytest
from aec_rag import __main__ as aec_rag_main
from aec_rag.__main__ import explain_operational_error, main
from aec_rag.db import open_index
from aec_rag.indexer import scan_source


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


def test_detach_marks_index_rows_detached(tmp_path, capsys):
    """Task 1.16: `aec-rag detach --project <...> --source <id>`."""
    source_dir = tmp_path / "source"
    source_dir.mkdir()
    (source_dir / "a.txt").write_text("hello", encoding="utf-8")
    vault = make_vault(tmp_path, [{"id": "src-1", "root_path": str(source_dir), "added_at": "x"}])
    main(["scan", "--project", str(vault)])
    capsys.readouterr()  # discard the scan's stdout

    code = main(["detach", "--project", str(vault), "--source", "src-1"])

    assert code == 0
    report = json.loads(capsys.readouterr().out)
    assert report == {"source_id": "src-1", "detached": 1}

    index_db = vault / ".aecpilot" / "index.db"
    conn = sqlite3.connect(str(index_db))
    row = conn.execute(
        "SELECT status FROM files WHERE source_id = ? AND rel_path = ?", ("src-1", "a.txt")
    ).fetchone()
    assert row == ("detached",)


def test_detach_is_idempotent(tmp_path, capsys):
    source_dir = tmp_path / "source"
    source_dir.mkdir()
    (source_dir / "a.txt").write_text("hello", encoding="utf-8")
    vault = make_vault(tmp_path, [{"id": "src-1", "root_path": str(source_dir), "added_at": "x"}])
    main(["scan", "--project", str(vault)])
    capsys.readouterr()

    main(["detach", "--project", str(vault), "--source", "src-1"])
    capsys.readouterr()
    code = main(["detach", "--project", str(vault), "--source", "src-1"])

    assert code == 0
    report = json.loads(capsys.readouterr().out)
    assert report == {"source_id": "src-1", "detached": 0}


def test_detach_without_index_db_is_not_fatal(tmp_path, capsys):
    """A source can be disconnected before it was ever scanned -- no
    index.db exists yet, and that must not be an error.
    """
    vault = make_vault(tmp_path, [])

    code = main(["detach", "--project", str(vault), "--source", "never-scanned"])

    assert code == 0
    report = json.loads(capsys.readouterr().out)
    assert report == {"source_id": "never-scanned", "detached": 0}
    assert not (vault / ".aecpilot" / "index.db").exists()


def test_detach_missing_vault_exits_1_with_stderr(tmp_path, capsys):
    missing_vault = tmp_path / "no-such-vault"

    code = main(["detach", "--project", str(missing_vault), "--source", "src-1"])

    assert code == 1
    captured = capsys.readouterr()
    assert captured.out == ""
    assert "aec-rag:" in captured.err


def test_detach_leaves_other_sources_untouched(tmp_path, capsys):
    source_dir = tmp_path / "source"
    source_dir.mkdir()
    (source_dir / "a.txt").write_text("hello", encoding="utf-8")
    other_dir = tmp_path / "other"
    other_dir.mkdir()
    (other_dir / "b.txt").write_text("hi", encoding="utf-8")
    vault = make_vault(
        tmp_path,
        [
            {"id": "src-1", "root_path": str(source_dir), "added_at": "x"},
            {"id": "src-2", "root_path": str(other_dir), "added_at": "x"},
        ],
    )
    main(["scan", "--project", str(vault)])
    capsys.readouterr()

    main(["detach", "--project", str(vault), "--source", "src-1"])
    capsys.readouterr()

    index_db = vault / ".aecpilot" / "index.db"
    conn = sqlite3.connect(str(index_db))
    row = conn.execute(
        "SELECT status FROM files WHERE source_id = ? AND rel_path = ?", ("src-2", "b.txt")
    ).fetchone()
    assert row == ("ok",)


def test_scan_sweeps_a_source_id_no_longer_in_project_json(tmp_path, capsys):
    """Task 1.16 fix-iteration (review major): a source removed from
    project.json while a scan/detach race left its rows un-detached must be
    cleaned up by the very next scan -- this is what makes the whole system
    converge even if a `detach` call is lost/fails.
    """
    configured_dir = tmp_path / "configured"
    configured_dir.mkdir()
    (configured_dir / "a.txt").write_text("hello", encoding="utf-8")
    vault = make_vault(
        tmp_path, [{"id": "configured", "root_path": str(configured_dir), "added_at": "x"}]
    )

    orphan_dir = tmp_path / "orphan"
    orphan_dir.mkdir()
    (orphan_dir / "b.txt").write_text("hi", encoding="utf-8")
    # Simulates a source that was scanned, then removed from project.json
    # while a racing detach lost/failed -- its rows are still "ok", but its
    # id is absent from this vault's project.json.
    index_db = vault / ".aecpilot" / "index.db"
    conn = open_index(index_db)
    scan_source(conn, "orphan", orphan_dir)
    conn.close()

    code = main(["scan", "--project", str(vault)])

    assert code == 0
    report = json.loads(capsys.readouterr().out)
    assert report["sources"]["configured"]["added"] == ["a.txt"]
    assert report["detached_orphans"] == {"orphan": 1}

    conn = sqlite3.connect(str(index_db))
    orphan_row = conn.execute(
        "SELECT status FROM files WHERE source_id = ? AND rel_path = ?", ("orphan", "b.txt")
    ).fetchone()
    configured_row = conn.execute(
        "SELECT status FROM files WHERE source_id = ? AND rel_path = ?", ("configured", "a.txt")
    ).fetchone()
    assert orphan_row == ("detached",)
    assert configured_row == ("ok",)


def test_scan_sweep_is_idempotent_second_scan_reports_no_orphans(tmp_path, capsys):
    orphan_dir = tmp_path / "orphan"
    orphan_dir.mkdir()
    (orphan_dir / "b.txt").write_text("hi", encoding="utf-8")
    vault = make_vault(tmp_path, [])
    index_db = vault / ".aecpilot" / "index.db"
    conn = open_index(index_db)
    scan_source(conn, "orphan", orphan_dir)
    conn.close()

    main(["scan", "--project", str(vault)])
    capsys.readouterr()
    code = main(["scan", "--project", str(vault)])

    assert code == 0
    report = json.loads(capsys.readouterr().out)
    assert "detached_orphans" not in report
    assert report["sources"] == {}


def test_scan_reports_no_detached_orphans_key_when_nothing_orphaned(tmp_path, capsys):
    source_dir = tmp_path / "source"
    source_dir.mkdir()
    (source_dir / "a.txt").write_text("hello", encoding="utf-8")
    vault = make_vault(tmp_path, [{"id": "src-1", "root_path": str(source_dir), "added_at": "x"}])

    code = main(["scan", "--project", str(vault)])

    assert code == 0
    report = json.loads(capsys.readouterr().out)
    assert "detached_orphans" not in report


def test_detach_locked_index_db_exits_1_with_friendly_message(tmp_path, capsys, monkeypatch):
    """Task 1.16 fix-iteration (review major, part b): a `detach` that loses
    a lock race against a concurrent scan must exit 1 with a clear,
    non-traceback message -- not crash raw. Locking the real database via a
    second live connection would make this flaky (depends on Python's
    default 5s busy_timeout), so the race is simulated directly.
    """
    source_dir = tmp_path / "source"
    source_dir.mkdir()
    (source_dir / "a.txt").write_text("hello", encoding="utf-8")
    vault = make_vault(tmp_path, [{"id": "src-1", "root_path": str(source_dir), "added_at": "x"}])
    main(["scan", "--project", str(vault)])
    capsys.readouterr()

    def boom(_conn, _source_id):
        raise sqlite3.OperationalError("database is locked")

    monkeypatch.setattr(aec_rag_main, "detach_source", boom)

    code = main(["detach", "--project", str(vault), "--source", "src-1"])

    assert code == 1
    captured = capsys.readouterr()
    assert captured.out == ""
    assert "aec-rag:" in captured.err
    # Задача 4D-9: обещание про следующий скан осталось (для detach оно верное —
    # осиротевший источник подхватит подметание в `run_scan`), но теперь рядом
    # сказано, КТО держит индекс и что можно сделать прямо сейчас.
    assert "Пометка будет доделана следующим сканом" in captured.err
    assert "приложением" in captured.err


# --- задача 4D-9: отказ по блокировке объясняет себя ------------------------


def test_a_lock_refusal_says_what_holds_the_index():
    """«database is locked» само по себе не говорит человеку ничего: ни кто
    держит, ни что делать. Отказ при этом законный — index.db принимает одного
    писателя, а скан держит запись весь проход, — поэтому чинится не поведение,
    а сообщение.
    """
    message = explain_operational_error(sqlite3.OperationalError("database is locked"), "scan")

    assert "приложением" in message
    assert "повторите команду" in message
    # А обещания «доделается само» тут нет: скан, который не прошёл, не пройдёт
    # сам по себе.
    assert "следующим сканом" not in message
    # И не остаётся сырой формулировки, ради которой всё затевалось.
    assert "database is locked" not in message


def test_another_operational_error_is_not_dressed_up_as_a_lock():
    """Мутационная страховка: подменять КАЖДУЮ OperationalError рассказом про
    занятый индекс значило бы врать про повреждённую схему или битый файл.
    """
    message = explain_operational_error(
        sqlite3.OperationalError("no such column: мощность"), "scan"
    )

    assert "no such column: мощность" in message
    assert "приложением" not in message


def test_graph_preview_without_an_index_says_so_and_creates_nothing(tmp_path, capsys):
    """Задача 5.15. Предпросмотр — это вопрос, а не действие: у него нет права
    ни создать index.db, ни отметить путь. Пустые числа без признака были бы
    уверенным нулём вместо ответа «индекса ещё нет»."""
    source_dir = tmp_path / "source"
    source_dir.mkdir()
    vault = make_vault(tmp_path, [{"id": "src-1", "root_path": str(source_dir), "added_at": "x"}])
    project_json = vault / ".aecpilot" / "project.json"
    before = project_json.read_bytes()

    code = main(["graph-preview", "--project", str(vault), "--path", "src-1/ЭОМ"])

    assert code == 0
    report = json.loads(capsys.readouterr().out)
    assert report["index_missing"] is True
    assert report["documents"] == 0
    assert not (vault / ".aecpilot" / "index.db").exists()
    assert project_json.read_bytes() == before


def test_graph_preview_on_an_empty_index_marks_nothing(tmp_path, capsys):
    source_dir = tmp_path / "source"
    source_dir.mkdir()
    # Формат из читаемых: `.txt` в граф не попадает вовсе, и тест мерил бы
    # тогда не предпросмотр, а список поддерживаемых расширений.
    (source_dir / "задание.csv").write_text("узел;мощность;250", encoding="utf-8")
    vault = make_vault(tmp_path, [{"id": "src-1", "root_path": str(source_dir), "added_at": "x"}])
    assert main(["scan", "--project", str(vault)]) == 0
    capsys.readouterr()
    project_json = vault / ".aecpilot" / "project.json"
    before = project_json.read_bytes()

    code = main(["graph-preview", "--project", str(vault), "--path", "src-1", "--kind", "folder"])

    assert code == 0
    report = json.loads(capsys.readouterr().out)
    assert report["index_missing"] is False
    # Файл просканирован, но не проиндексирован (tier 1 не запускался), поэтому
    # он в графе «ждёт» и стоит нуля фрагментов — и это видно отдельным числом.
    assert report["documents"] == 1
    assert report["not_indexed"] == 1
    assert [entry["path"] for entry in report["adds"]] == ["src-1"]
    assert project_json.read_bytes() == before


def test_ingest_path_names_a_source_and_a_place_inside_it():
    """`ingest --path` (task 3H.18) takes `<source>/<rel path>`, the shape the
    graph commands take — the tree's two menu items name a place alike."""
    from aec_rag.__main__ import _narrow

    roots = {"tasks": "D:/ИД", "kr": "D:/КР"}

    assert _narrow(roots, ["tasks/ИГИ/297-1.pdf", "kr"]) == (
        ["kr", "tasks"],
        ["ИГИ/297-1.pdf", ""],
    )


def test_ingest_path_outside_every_source_is_refused_by_name():
    from aec_rag.__main__ import _narrow

    with pytest.raises(ValueError, match="чужой/файл.pdf"):
        _narrow({"tasks": "D:/ИД"}, ["чужой/файл.pdf"])


# D-194: the desktop keeps stdin open as the «Остановить» channel. Listening on
# it must not hang the run: a thread blocked reading a Windows pipe stalled the
# first native import after it (numpy, from LightRAG) forever — the owner's
# indexing sat at zero, 2026-10-08. A fresh process, because numpy must not be
# loaded yet.
_STOP_CHILD = """
import time
from aec_rag.__main__ import _listen_for_stop
should_stop = _listen_for_stop()
import numpy
print("imported", flush=True)
for _ in range(200):
    if should_stop():
        print("stopped", flush=True)
        break
    time.sleep(0.05)
"""


def test_stop_channel_neither_hangs_native_imports_nor_misses_stop():
    import subprocess
    import sys
    import threading

    child = subprocess.Popen(
        [sys.executable, "-c", _STOP_CHILD],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        text=True,
    )
    watchdog = threading.Timer(60, child.kill)
    watchdog.start()
    try:
        assert child.stdout.readline().strip() == "imported"
        child.stdin.write("stop\n")
        child.stdin.flush()
        assert child.stdout.readline().strip() == "stopped"
    finally:
        watchdog.cancel()
        child.kill()
        child.wait()


def test_a_run_that_cannot_start_prints_its_reason_as_a_code(tmp_path, capsys, monkeypatch):
    """3J.7: a provider refusing the key before the first file used to end the
    run with a bare traceback; the app now gets one ``fatal`` line to word."""

    class AuthenticationError(Exception):
        status_code = 401

    def refuse(*args, **kwargs):
        raise AuthenticationError("Incorrect API key provided")

    monkeypatch.setattr(aec_rag_main, "run_ingest", refuse)
    code = main(["ingest", "--project", str(tmp_path)])

    out = capsys.readouterr()
    assert code == 1
    assert json.loads(out.out.strip().splitlines()[-1]) == {
        "fatal": {"code": "provider_key", "detail": "Incorrect API key provided"}
    }
    assert "AuthenticationError" in out.err
