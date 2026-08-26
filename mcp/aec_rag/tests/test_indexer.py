"""Tests for the walker + scan_source change detection (task 1.13)."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

import pytest
from aec_rag import indexer
from aec_rag.db import open_index
from aec_rag.indexer import detach_source, scan_source

windows_only = pytest.mark.skipif(os.name != "nt", reason="junctions are a Windows/NTFS concept")


def make_fixture_root(tmp_path):
    """Build a source root with >=2 nesting levels and a Cyrillic dir/file name."""
    root = tmp_path / "source-root"
    root.mkdir()
    (root / "top.txt").write_text("top-level", encoding="utf-8")
    sub = root / "sub"
    sub.mkdir()
    (sub / "nested.txt").write_text("nested content", encoding="utf-8")
    docs = root / "Документы"
    docs.mkdir()
    (docs / "файл.txt").write_text("привет", encoding="utf-8")
    return root


def test_first_scan_reports_all_added_with_sha_and_posix_paths(tmp_path):
    root = make_fixture_root(tmp_path)
    conn = open_index(tmp_path / "index.db")

    report = scan_source(conn, "src", root)

    assert set(report["added"]) == {"top.txt", "sub/nested.txt", "Документы/файл.txt"}
    assert report["changed"] == []
    assert report["deleted"] == []
    assert report["unchanged"] == 0

    rows = conn.execute(
        "SELECT rel_path, status, sha256 FROM files WHERE source_id = ?", ("src",)
    ).fetchall()
    assert len(rows) == 3
    for _rel_path, status, sha256 in rows:
        assert status == "ok"
        assert sha256 is not None


def test_second_scan_without_changes_is_unchanged_and_skips_hashing(tmp_path, monkeypatch):
    root = make_fixture_root(tmp_path)
    conn = open_index(tmp_path / "index.db")
    scan_source(conn, "src", root)

    def boom(_path):
        raise AssertionError("sha256_file must not be called for unchanged files")

    monkeypatch.setattr(indexer, "sha256_file", boom)

    report = scan_source(conn, "src", root)

    assert report == {
        "added": [],
        "changed": [],
        "deleted": [],
        "unchanged": 3,
        "unreadable_dirs": [],
        "root_unavailable": False,
    }


def test_modified_file_content_is_reported_changed_with_new_sha(tmp_path):
    root = make_fixture_root(tmp_path)
    conn = open_index(tmp_path / "index.db")
    scan_source(conn, "src", root)

    target = root / "top.txt"
    old_sha = conn.execute(
        "SELECT sha256 FROM files WHERE source_id = ? AND rel_path = ?", ("src", "top.txt")
    ).fetchone()[0]

    target.write_text("top-level, but different now", encoding="utf-8")
    bumped = target.stat().st_mtime + 5  # guard against same-tick mtime collisions
    os.utime(target, (bumped, bumped))

    report = scan_source(conn, "src", root)

    assert report["changed"] == ["top.txt"]
    assert report["added"] == []
    assert report["deleted"] == []

    row = conn.execute(
        "SELECT status, sha256 FROM files WHERE source_id = ? AND rel_path = ?", ("src", "top.txt")
    ).fetchone()
    assert row[0] == "changed"
    assert row[1] != old_sha


def test_deleted_file_marks_status_deleted_but_keeps_the_row(tmp_path):
    root = make_fixture_root(tmp_path)
    conn = open_index(tmp_path / "index.db")
    scan_source(conn, "src", root)

    (root / "top.txt").unlink()

    report = scan_source(conn, "src", root)

    assert report["deleted"] == ["top.txt"]
    row = conn.execute(
        "SELECT status FROM files WHERE source_id = ? AND rel_path = ?", ("src", "top.txt")
    ).fetchone()
    assert row is not None
    assert row[0] == "deleted"


def test_new_file_on_second_scan_is_added(tmp_path):
    root = make_fixture_root(tmp_path)
    conn = open_index(tmp_path / "index.db")
    scan_source(conn, "src", root)

    (root / "new.txt").write_text("brand new", encoding="utf-8")

    report = scan_source(conn, "src", root)

    assert report["added"] == ["new.txt"]


def test_file_over_size_limit_is_skipped_with_reason(tmp_path):
    root = tmp_path / "source-root"
    root.mkdir()
    (root / "big.txt").write_text("this content is longer than ten bytes", encoding="utf-8")
    conn = open_index(tmp_path / "index.db")

    report = scan_source(conn, "src", root, max_size=10)

    assert report["added"] == ["big.txt"]
    row = conn.execute(
        "SELECT sha256, skip_reason FROM files WHERE source_id = ? AND rel_path = ?",
        ("src", "big.txt"),
    ).fetchone()
    assert row == (None, "too_large")


def test_unreadable_file_is_skipped_without_failing_the_scan(tmp_path, monkeypatch):
    root = tmp_path / "source-root"
    root.mkdir()
    (root / "locked.txt").write_text("content", encoding="utf-8")
    conn = open_index(tmp_path / "index.db")

    def boom(_path):
        raise OSError("locked")

    monkeypatch.setattr(indexer, "sha256_file", boom)

    report = scan_source(conn, "src", root)

    assert report["added"] == ["locked.txt"]
    row = conn.execute(
        "SELECT sha256, skip_reason FROM files WHERE source_id = ? AND rel_path = ?",
        ("src", "locked.txt"),
    ).fetchone()
    assert row == (None, "unreadable")


def test_changed_status_persists_when_content_is_stable_again(tmp_path):
    """Fix-iteration #1 major finding #1: clearing 'changed' is re-ingest's
    job (Phase 2), not the scanner's -- a stable/reverted file must keep its
    'changed' status, only refreshing size/mtime.
    """
    root = make_fixture_root(tmp_path)
    conn = open_index(tmp_path / "index.db")
    scan_source(conn, "src", root)

    target = root / "top.txt"
    target.write_text("top-level, modified", encoding="utf-8")
    bumped = target.stat().st_mtime + 5
    os.utime(target, (bumped, bumped))

    report = scan_source(conn, "src", root)
    assert report["changed"] == ["top.txt"]

    # Touch mtime again without altering content: status must stay 'changed'.
    bumped_again = target.stat().st_mtime + 5
    os.utime(target, (bumped_again, bumped_again))

    report2 = scan_source(conn, "src", root)

    assert report2["added"] == []
    assert report2["changed"] == []
    row = conn.execute(
        "SELECT status FROM files WHERE source_id = ? AND rel_path = ?", ("src", "top.txt")
    ).fetchone()
    assert row[0] == "changed"


def test_scan_with_unavailable_root_leaves_index_untouched(tmp_path):
    """Fix-iteration #1 major finding #2: an unreachable root is not 'every
    file deleted' -- the index must be preserved as-is.
    """
    root = make_fixture_root(tmp_path)
    conn = open_index(tmp_path / "index.db")
    scan_source(conn, "src", root)

    rows_before = conn.execute(
        "SELECT rel_path, status FROM files WHERE source_id = ? ORDER BY rel_path", ("src",)
    ).fetchall()

    missing_root = tmp_path / "does-not-exist"
    report = scan_source(conn, "src", missing_root)

    assert report == {
        "added": [],
        "changed": [],
        "deleted": [],
        "unchanged": 0,
        "unreadable_dirs": [],
        "root_unavailable": True,
    }

    rows_after = conn.execute(
        "SELECT rel_path, status FROM files WHERE source_id = ? ORDER BY rel_path", ("src",)
    ).fetchall()
    assert rows_after == rows_before


def test_stat_failure_mid_scan_does_not_fail_scan_or_touch_existing_row(tmp_path, monkeypatch):
    """Fix-iteration #1 major finding #3: os.stat() itself can raise
    (transient lock/vanish between listing and stat); an already-tracked
    file must be left untouched (not marked 'deleted') rather than fail
    the scan.
    """
    root = make_fixture_root(tmp_path)
    conn = open_index(tmp_path / "index.db")
    scan_source(conn, "src", root)

    original_stat = Path.stat

    def flaky_stat(self, *args, **kwargs):
        if self.name == "top.txt":
            raise OSError("simulated stat failure")
        return original_stat(self, *args, **kwargs)

    monkeypatch.setattr(Path, "stat", flaky_stat)

    prior_row = conn.execute(
        "SELECT size, mtime, sha256, status FROM files WHERE source_id = ? AND rel_path = ?",
        ("src", "top.txt"),
    ).fetchone()

    report = scan_source(conn, "src", root)

    assert report["root_unavailable"] is False
    assert "top.txt" not in report["added"]
    assert "top.txt" not in report["changed"]
    assert "top.txt" not in report["deleted"]
    assert report["unchanged"] == 3

    row_after = conn.execute(
        "SELECT size, mtime, sha256, status FROM files WHERE source_id = ? AND rel_path = ?",
        ("src", "top.txt"),
    ).fetchone()
    assert row_after == prior_row


def test_new_file_whose_stat_fails_is_recorded_unreadable(tmp_path, monkeypatch):
    """Same finding as above, for a file with no prior row: it must still
    be recorded (sha256=NULL, skip_reason='unreadable'), under 'added'.
    """
    root = tmp_path / "source-root"
    root.mkdir()
    (root / "flaky.txt").write_text("content", encoding="utf-8")
    conn = open_index(tmp_path / "index.db")

    original_stat = Path.stat

    def flaky_stat(self, *args, **kwargs):
        if self.name == "flaky.txt":
            raise OSError("simulated stat failure")
        return original_stat(self, *args, **kwargs)

    monkeypatch.setattr(Path, "stat", flaky_stat)

    report = scan_source(conn, "src", root)

    assert report["added"] == ["flaky.txt"]
    row = conn.execute(
        "SELECT size, mtime, sha256, skip_reason FROM files WHERE source_id = ? AND rel_path = ?",
        ("src", "flaky.txt"),
    ).fetchone()
    assert row == (None, None, None, "unreadable")


def test_previously_unreadable_file_is_rehashed_once_readable_again(tmp_path, monkeypatch):
    """Fix-iteration #1 minor finding #4: the (size, mtime)-equal fast path
    must not apply to a row with sha256 IS NULL, so an unlocked file is
    rehashed even though its stat info never changed.
    """
    root = tmp_path / "source-root"
    root.mkdir()
    (root / "locked.txt").write_text("content", encoding="utf-8")
    conn = open_index(tmp_path / "index.db")

    def boom(_path):
        raise OSError("locked")

    monkeypatch.setattr(indexer, "sha256_file", boom)
    report = scan_source(conn, "src", root)
    assert report["added"] == ["locked.txt"]

    monkeypatch.undo()  # restore sha256_file: file is "unlocked" now
    scan_source(conn, "src", root)

    row = conn.execute(
        "SELECT sha256, skip_reason FROM files WHERE source_id = ? AND rel_path = ?",
        ("src", "locked.txt"),
    ).fetchone()
    assert row[0] is not None
    assert row[1] is None


def test_reappeared_after_deleted_is_added_with_status_resolved_by_sha(tmp_path):
    """Fix-iteration #1 minor finding #7b: pin down the documented behavior
    for a file reappearing after being marked 'deleted'.
    """
    root = make_fixture_root(tmp_path)
    conn = open_index(tmp_path / "index.db")
    scan_source(conn, "src", root)

    target = root / "top.txt"
    original_bytes = target.read_bytes()
    target.unlink()
    scan_source(conn, "src", root)
    row = conn.execute(
        "SELECT status FROM files WHERE source_id = ? AND rel_path = ?", ("src", "top.txt")
    ).fetchone()
    assert row[0] == "deleted"

    # Same content reappears -> status resolves to 'ok'.
    target.write_bytes(original_bytes)
    report = scan_source(conn, "src", root)
    assert report["added"] == ["top.txt"]
    row = conn.execute(
        "SELECT status FROM files WHERE source_id = ? AND rel_path = ?", ("src", "top.txt")
    ).fetchone()
    assert row[0] == "ok"

    # Deleted again, then different content reappears -> status resolves to 'changed'.
    target.unlink()
    scan_source(conn, "src", root)
    target.write_text("totally different content now", encoding="utf-8")
    report2 = scan_source(conn, "src", root)
    assert report2["added"] == ["top.txt"]
    row = conn.execute(
        "SELECT status FROM files WHERE source_id = ? AND rel_path = ?", ("src", "top.txt")
    ).fetchone()
    assert row[0] == "changed"


def test_detached_row_is_ignored_by_scan(tmp_path):
    """Fix-iteration #1 minor finding #8: reattach logic is task 1.16;
    scan_source must leave a 'detached' row completely alone.
    """
    root = make_fixture_root(tmp_path)
    conn = open_index(tmp_path / "index.db")
    scan_source(conn, "src", root)

    conn.execute(
        "UPDATE files SET status = 'detached' WHERE source_id = ? AND rel_path = ?",
        ("src", "top.txt"),
    )
    conn.commit()

    row_before = conn.execute(
        "SELECT size, mtime, sha256, status, skip_reason, indexed_at FROM files "
        "WHERE source_id = ? AND rel_path = ?",
        ("src", "top.txt"),
    ).fetchone()

    report = scan_source(conn, "src", root)

    assert "top.txt" not in report["added"]
    assert "top.txt" not in report["changed"]
    assert "top.txt" not in report["deleted"]

    row_after = conn.execute(
        "SELECT size, mtime, sha256, status, skip_reason, indexed_at FROM files "
        "WHERE source_id = ? AND rel_path = ?",
        ("src", "top.txt"),
    ).fetchone()
    assert row_after == row_before


@windows_only
def test_junction_cycle_does_not_loop_forever(tmp_path):
    root = tmp_path / "source-root"
    root.mkdir()
    (root / "top.txt").write_text("top", encoding="utf-8")
    sub = root / "sub"
    sub.mkdir()
    (sub / "nested.txt").write_text("nested", encoding="utf-8")
    loop = sub / "loop"  # junction pointing back at an ancestor -> would cycle forever

    result = subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-Command",
            f'New-Item -ItemType Junction -Path "{loop}" -Target "{root}"',
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        pytest.skip(f"could not create junction in this environment: {result.stderr.strip()}")

    conn = open_index(tmp_path / "index.db")

    report = scan_source(conn, "src", root)

    assert set(report["added"]) == {"top.txt", "sub/nested.txt"}


def test_detach_source_marks_all_rows_detached_regardless_of_prior_status(tmp_path):
    """Task 1.16: disconnecting a source detaches it entirely -- 'ok',
    'changed', and 'deleted' rows all become 'detached'.
    """
    root = make_fixture_root(tmp_path)
    conn = open_index(tmp_path / "index.db")
    scan_source(conn, "src", root)
    (root / "top.txt").write_text("changed content", encoding="utf-8")
    (root / "sub" / "nested.txt").unlink()
    scan_source(conn, "src", root)

    rows_before = conn.execute(
        "SELECT rel_path, status FROM files WHERE source_id = ? ORDER BY rel_path", ("src",)
    ).fetchall()
    assert {status for _rel_path, status in rows_before} == {"changed", "deleted", "ok"}

    detached_count = detach_source(conn, "src")

    assert detached_count == 3
    rows_after = conn.execute(
        "SELECT rel_path, status FROM files WHERE source_id = ? ORDER BY rel_path", ("src",)
    ).fetchall()
    assert all(status == "detached" for _rel_path, status in rows_after)
    assert [rel_path for rel_path, _status in rows_after] == [
        rel_path for rel_path, _status in rows_before
    ]


def test_detach_source_is_idempotent(tmp_path):
    root = make_fixture_root(tmp_path)
    conn = open_index(tmp_path / "index.db")
    scan_source(conn, "src", root)

    first = detach_source(conn, "src")
    assert first == 3

    second = detach_source(conn, "src")
    assert second == 0


def test_detach_source_leaves_other_sources_untouched(tmp_path):
    root = tmp_path / "source-root"
    root.mkdir()
    (root / "a.txt").write_text("a", encoding="utf-8")
    conn = open_index(tmp_path / "index.db")
    scan_source(conn, "src-1", root)
    scan_source(conn, "src-2", root)

    detach_source(conn, "src-1")

    row_1 = conn.execute(
        "SELECT status FROM files WHERE source_id = ? AND rel_path = ?", ("src-1", "a.txt")
    ).fetchone()
    row_2 = conn.execute(
        "SELECT status FROM files WHERE source_id = ? AND rel_path = ?", ("src-2", "a.txt")
    ).fetchone()
    assert row_1[0] == "detached"
    assert row_2[0] == "ok"


# --- Находка D-46: недоступный каталог не равен удалённому ------------------
#
# Каталог, в который обход не смог заглянуть, раньше просто не давал файлов, а
# сверка внизу `scan_source` не отличала «не смотрели» от «нет» и штамповала
# всему поддереву `deleted`. Противник для этого не нужен — хватает отказа в
# правах или файла-заглушки OneDrive.
#
# Недоступность подделывается подменой `os.scandir`, а не правами на диске:
# на Windows chmod каталогу ничего не значит, а icacls требует прав и делает
# тест зависимым от машины. Подмена бьёт ровно в ту ветку, ради которой тест
# написан.


def _scandir_failing_on(target: Path):
    """`os.scandir`, падающий на `target` и обычный на всём остальном."""
    real = os.scandir

    def fake(path):
        if Path(path) == target:
            raise PermissionError(13, "Отказано в доступе", str(target))
        return real(path)

    return fake


def test_unreadable_subdir_does_not_delete_what_is_under_it(tmp_path, monkeypatch):
    root = tmp_path / "source-root"
    (root / "закрытая").mkdir(parents=True)
    (root / "видимый.txt").write_text("виден", encoding="utf-8")
    (root / "закрытая" / "внутри.txt").write_text("внутри", encoding="utf-8")
    conn = open_index(tmp_path / "index.db")

    first = scan_source(conn, "src", root)
    assert set(first["added"]) == {"видимый.txt", "закрытая/внутри.txt"}
    assert first["unreadable_dirs"] == []

    monkeypatch.setattr(os, "scandir", _scandir_failing_on(root / "закрытая"))
    report = scan_source(conn, "src", root)

    # Главное: строка уцелела. До правки она уезжала в `deleted`, а за ней —
    # и куски документа из индекса.
    assert report["deleted"] == []
    assert report["unreadable_dirs"] == ["закрытая"]
    status = conn.execute(
        "SELECT status FROM files WHERE source_id = 'src' AND rel_path = 'закрытая/внутри.txt'"
    ).fetchone()[0]
    assert status == "ok"


def test_a_real_deletion_is_still_reported_while_another_dir_is_unreadable(tmp_path, monkeypatch):
    """Правка не должна превратиться в «никогда ничего не удалять»."""
    root = tmp_path / "source-root"
    (root / "закрытая").mkdir(parents=True)
    (root / "закрытая" / "внутри.txt").write_text("внутри", encoding="utf-8")
    (root / "пропадёт.txt").write_text("пока здесь", encoding="utf-8")
    conn = open_index(tmp_path / "index.db")
    scan_source(conn, "src", root)

    (root / "пропадёт.txt").unlink()
    monkeypatch.setattr(os, "scandir", _scandir_failing_on(root / "закрытая"))
    report = scan_source(conn, "src", root)

    assert report["deleted"] == ["пропадёт.txt"]
    assert report["unreadable_dirs"] == ["закрытая"]


def test_unreadable_dir_is_not_counted_as_unchanged(tmp_path, monkeypatch):
    """«unchanged» значит «посмотрели, то же самое». Мы не смотрели."""
    root = tmp_path / "source-root"
    (root / "закрытая").mkdir(parents=True)
    (root / "закрытая" / "внутри.txt").write_text("внутри", encoding="utf-8")
    conn = open_index(tmp_path / "index.db")
    scan_source(conn, "src", root)

    monkeypatch.setattr(os, "scandir", _scandir_failing_on(root / "закрытая"))
    report = scan_source(conn, "src", root)

    assert report["unchanged"] == 0


def test_walk_files_reports_the_unreadable_prefix(tmp_path, monkeypatch):
    root = tmp_path / "source-root"
    (root / "а" / "б").mkdir(parents=True)
    (root / "а" / "б" / "файл.txt").write_text("x", encoding="utf-8")
    (root / "рядом.txt").write_text("y", encoding="utf-8")

    monkeypatch.setattr(os, "scandir", _scandir_failing_on(root / "а" / "б"))
    unreadable: list[str] = []
    files = sorted(p.name for p in indexer.walk_files(root, unreadable))

    assert files == ["рядом.txt"]
    assert unreadable == ["а/б"]
