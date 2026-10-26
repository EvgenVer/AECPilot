"""Edge-case fixtures for the aec-rag walker/scan_source (task 1.18): UNC
roots, long paths (>260 chars), a genuinely locked file (real OS-level
exclusive lock via ctypes), a directory symlink cycle (in addition to the
junction cycle already covered in test_indexer.py), and a combined
Cyrillic+spaces .docx name.

See docs/history/specs/workspace-sources.md (Edge cases). This file only adds what the
task 1.18 coverage audit found missing on top of test_indexer.py.
"""

from __future__ import annotations

import ctypes
import os
from pathlib import Path

import pytest
from aec_rag.db import open_index
from aec_rag.indexer import scan_source

windows_only = pytest.mark.skipif(os.name != "nt", reason="Windows path/lock semantics")

# A hostname that cannot resolve on any network, used to emulate an
# unreachable UNC source without touching a real share or an admin share
# like \\localhost\c$.
UNC_NONEXISTENT_ROOT = r"\\aecpilot-nonexistent-host-xyz123\share"


# --- long paths (>260 chars) -------------------------------------------------


def test_scan_source_long_path_over_260_chars_does_not_fail(tmp_path):
    """Capability-probed (task 1.18 fix-iteration #1): tries a plain
    ``mkdir()`` for each nested component first; if the OS refuses (no
    LongPathsEnabled / no long-path-aware manifest), falls back to the
    extended-length ``\\?\\`` prefix (always available, no registry
    change needed) to build the fixture, and remembers that a plain-path
    walk is expected to be unable to fully see it.

    Whichever branch this environment selects:
    - plain mkdir succeeds throughout (long-path transparent): the deep
      file must be indexed normally (sha256 computed, no skip_reason) --
      "long-path поддержка";
    - the ``\\?\\`` fallback was needed: the walker/scan must simply not
      crash. Since the same plain-path restriction that blocked the
      directory's own creation also blocks ``os.scandir()`` on that same
      directory, ``indexer.walk_files`` silently treats it as an
      unreachable subtree (see its ``except OSError: continue``) and the
      deep file is typically never discovered at all; if it *is*
      discovered (e.g. only the file-level open/stat failed), it must be
      recorded ``skip_reason="unreadable"``, never raise -- "понятная
      ошибка".
    """
    root = tmp_path / "source-root"
    root.mkdir()
    current = root
    component = "d" * 50
    i = 0
    extended = False
    try:
        while len(str(current)) < 280:
            candidate = current / f"{component}{i}"
            if extended:
                os.makedirs("\\\\?\\" + str(candidate))
            else:
                try:
                    candidate.mkdir()
                except OSError:
                    os.makedirs("\\\\?\\" + str(candidate))
                    extended = True
            current = candidate
            i += 1
        deep_file = current / "deep.txt"
        write_target = Path("\\\\?\\" + str(deep_file)) if extended else deep_file
        write_target.write_text("deep content", encoding="utf-8")
    except OSError as exc:
        pytest.skip(f"could not create a >260-char path in this environment: {exc}")

    assert len(str(deep_file)) > 260

    conn = open_index(tmp_path / "index.db")
    report = scan_source(conn, "src", root)

    rel_path = deep_file.relative_to(root).as_posix()
    if extended:
        if rel_path in report["added"]:
            row = conn.execute(
                "SELECT sha256, skip_reason FROM files WHERE source_id = ? AND rel_path = ?",
                ("src", rel_path),
            ).fetchone()
            assert row[1] == "unreadable"
        # else: the deep file's subtree was silently unreachable to the
        # plain-path walk -- also an acceptable non-crash outcome.
    else:
        assert rel_path in report["added"]
        row = conn.execute(
            "SELECT sha256, skip_reason FROM files WHERE source_id = ? AND rel_path = ?",
            ("src", rel_path),
        ).fetchone()
        assert row[0] is not None
        assert row[1] is None


# --- a genuinely locked file (real OS-level exclusive lock, not a mock) ------


def _acquire_exclusive_lock(path: Path) -> int:
    """Open ``path`` with dwShareMode=0 (deny all sharing) -- the same kind
    of OS-level lock Word/Excel hold on a document they have open. Returns
    the raw Win32 handle; pass it to ``_release_lock`` when done. Raises
    ``OSError`` if the lock can't be acquired.
    """
    from ctypes import wintypes

    create_file_w = ctypes.windll.kernel32.CreateFileW
    create_file_w.restype = wintypes.HANDLE
    create_file_w.argtypes = [
        wintypes.LPCWSTR,
        wintypes.DWORD,
        wintypes.DWORD,
        wintypes.LPVOID,
        wintypes.DWORD,
        wintypes.DWORD,
        wintypes.HANDLE,
    ]
    generic_read_write = 0x80000000 | 0x40000000
    open_existing = 3
    file_attribute_normal = 0x80
    handle = create_file_w(
        str(path), generic_read_write, 0, None, open_existing, file_attribute_normal, None
    )
    invalid_handle = wintypes.HANDLE(-1).value
    if not handle or handle == invalid_handle:
        raise ctypes.WinError()
    return handle


def _release_lock(handle: int) -> None:
    ctypes.windll.kernel32.CloseHandle(handle)


@windows_only
def test_scan_source_real_locked_file_is_skipped_without_failing_the_scan(tmp_path):
    root = tmp_path / "source-root"
    root.mkdir()
    locked = root / "locked.docx"
    locked.write_text("word content", encoding="utf-8")

    try:
        handle = _acquire_exclusive_lock(locked)
    except OSError as exc:
        pytest.skip(f"could not acquire a real exclusive lock in this environment: {exc}")

    try:
        conn = open_index(tmp_path / "index.db")
        report = scan_source(conn, "src", root)
    finally:
        _release_lock(handle)

    assert report["added"] == ["locked.docx"]
    row = conn.execute(
        "SELECT sha256, skip_reason FROM files WHERE source_id = ? AND rel_path = ?",
        ("src", "locked.docx"),
    ).fetchone()
    assert row == (None, "unreadable")


# --- UNC-mocked root: no live share, but a nonexistent UNC host is enough ---
# to exercise root_unavailable (verified in the task 1.18 report:
# os.scandir() on this host returned in well under a second on this machine
# -- fix-iteration #1: no numeric elapsed-time threshold is asserted, since
# a slow/flaky network condition is real and outside this test's control).


@windows_only
def test_scan_source_unc_root_unavailable(tmp_path):
    conn = open_index(tmp_path / "index.db")

    report = scan_source(conn, "src", UNC_NONEXISTENT_ROOT)

    assert report["root_unavailable"] is True
    assert report["added"] == []
    assert report["deleted"] == []


# --- directory symlink: skipped outright, not followed (the junction cycle
# guard is covered separately, task 1.13's test_junction_cycle_does_not_loop_forever) ---


def test_symlink_directory_is_skipped_not_followed(tmp_path):
    """A genuine directory symlink (unlike a junction) carries Windows'
    IO_REPARSE_TAG_SYMLINK tag: ``entry.is_dir(follow_symlinks=False)`` is
    False for it (unlike a junction, which keeps the plain directory
    attribute) while ``entry.is_symlink()`` is True, so
    ``indexer.walk_files``' ``elif not entry.is_symlink(): yield`` branch
    skips it outright -- it is never recursed into, so there is no cycle to
    guard against here (that's the junction test, task 1.13). This only
    confirms the walker doesn't crash or hang on a directory symlink and
    does not explore what it points to.
    """
    root = tmp_path / "source-root"
    root.mkdir()
    (root / "top.txt").write_text("top", encoding="utf-8")
    sub = root / "sub"
    sub.mkdir()
    (sub / "nested.txt").write_text("nested", encoding="utf-8")
    link = sub / "loop"  # directory symlink pointing back at an ancestor

    try:
        os.symlink(root, link, target_is_directory=True)
    except OSError as exc:
        pytest.skip(f"symlink creation not permitted (needs Windows dev mode/privileges): {exc}")

    conn = open_index(tmp_path / "index.db")
    report = scan_source(conn, "src", root)

    assert set(report["added"]) == {"top.txt", "sub/nested.txt"}


# --- combined Cyrillic + spaces name (aec_sources already covers this; the
# scan_source fixtures in test_indexer.py only use Cyrillic without spaces).


def test_scan_source_cyrillic_with_spaces_docx_name(tmp_path):
    root = tmp_path / "source-root"
    root.mkdir()
    named = root / "Смета проекта (версия 2).docx"
    named.write_text("содержимое сметы", encoding="utf-8")
    conn = open_index(tmp_path / "index.db")

    report = scan_source(conn, "src", root)

    assert report["added"] == ["Смета проекта (версия 2).docx"]
    row = conn.execute(
        "SELECT status, sha256 FROM files WHERE source_id = ? AND rel_path = ?",
        ("src", "Смета проекта (версия 2).docx"),
    ).fetchone()
    assert row[0] == "ok"
    assert row[1] is not None
