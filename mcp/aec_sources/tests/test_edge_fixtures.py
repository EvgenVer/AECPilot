"""Edge-case fixtures for aec-sources (task 1.18): UNC roots, long paths
(>260 chars), a genuinely locked file (real OS-level exclusive lock via
ctypes, plus a monkeypatch fallback for sources_read).

See docs/history/specs/workspace-sources.md (Edge cases). Cyrillic-name and space-in-path
fixtures, plus symlink-escape and junction/symlink-cycle guards, are already
covered by test_tools.py (make_fixture_root/make_read_fixture) and
aec_rag's test_indexer.py; this file only adds what the task 1.18 coverage
audit found missing.
"""

from __future__ import annotations

import ctypes
import os
from pathlib import Path

import pytest
from aec_sources.config import SourceRoot
from aec_sources.server import build_server
from mcp_harness import connected_session

windows_only = pytest.mark.skipif(os.name != "nt", reason="Windows path/lock semantics")

# A hostname that cannot resolve on any network (RFC 2606-style throwaway
# label), used to emulate an unreachable UNC source without touching a real
# share or an admin share like \\localhost\c$.
UNC_NONEXISTENT_ROOT = r"\\aecpilot-nonexistent-host-xyz123\share"


async def call(client, name, arguments):
    return await client.call_tool(name, arguments)


def error_text(result):
    return "\n".join(block.text for block in result.content if hasattr(block, "text"))


# --- long paths (>260 chars) -------------------------------------------------


def make_long_path_fixture(tmp_path: Path, min_length: int = 280) -> tuple[Path, Path, Path, bool]:
    """Build a source root with a file nested deep enough that its full path
    exceeds the classic Windows MAX_PATH (260 chars).

    Capability probe: tries a plain ``mkdir()`` for each component first; if
    the OS refuses (no LongPathsEnabled / no long-path-aware manifest),
    falls back to creating it via the extended-length ``\\?\\`` prefix
    (always available, no registry change needed). Returns ``(root,
    deep_dir, deep_file, extended_prefix_used)``: when
    ``extended_prefix_used`` is True, the directory/file exist on disk but
    *plain*-path access to them (what the tool under test actually uses) is
    expected to fail with a clean error rather than succeed -- that failure
    is itself the "long-path поддержка либо понятная ошибка" contract
    (docs/history/specs/workspace-sources.md, Edge cases).

    Raises ``OSError`` if even the ``\\?\\`` form can't create the path
    (caller should ``pytest.skip``).
    """
    root = tmp_path / "long-root"
    root.mkdir()
    current = root
    component = "d" * 50
    i = 0
    extended_prefix_used = False
    while len(str(current)) < min_length:
        candidate = current / f"{component}{i}"
        if extended_prefix_used:
            os.makedirs("\\\\?\\" + str(candidate))
        else:
            try:
                candidate.mkdir()
            except OSError:
                os.makedirs("\\\\?\\" + str(candidate))
                extended_prefix_used = True
        current = candidate
        i += 1
    deep_file = current / "deep.txt"
    write_target = Path("\\\\?\\" + str(deep_file)) if extended_prefix_used else deep_file
    write_target.write_text("deep content", encoding="utf-8")
    assert len(str(deep_file)) > 260
    return root, current, deep_file, extended_prefix_used


@windows_only
@pytest.mark.anyio
async def test_sources_read_long_path_over_260_chars(tmp_path):
    """Capability-probed (task 1.18 fix-iteration #1): whichever branch this
    environment selects -- long-path-transparent (plain mkdir succeeded:
    the tool must actually succeed) or not (``\\?\\`` fallback was needed to
    build the fixture: the tool -- which never uses ``\\?\\`` itself -- must
    fail with a clean ToolError, never a raw traceback).
    """
    try:
        root, _deep_dir, deep_file, extended = make_long_path_fixture(tmp_path)
    except OSError as exc:
        pytest.skip(f"could not create a >260-char path in this environment: {exc}")

    rel_path = deep_file.relative_to(root).as_posix()
    server = build_server([SourceRoot(id="src", root_path=str(root))])

    async with connected_session(server) as client:
        result = await call(client, "sources_read", {"source_id": "src", "path": rel_path})

    if extended:
        assert result.is_error is True
        assert "Traceback" not in error_text(result)
    else:
        assert result.is_error is False
        assert result.structured_content["result"] == "deep content"


@windows_only
@pytest.mark.anyio
async def test_sources_stat_long_path_over_260_chars(tmp_path):
    try:
        root, _deep_dir, deep_file, extended = make_long_path_fixture(tmp_path)
    except OSError as exc:
        pytest.skip(f"could not create a >260-char path in this environment: {exc}")

    rel_path = deep_file.relative_to(root).as_posix()
    server = build_server([SourceRoot(id="src", root_path=str(root))])

    async with connected_session(server) as client:
        result = await call(client, "sources_stat", {"source_id": "src", "path": rel_path})

    if extended:
        assert result.is_error is True
        assert "Traceback" not in error_text(result)
    else:
        assert result.is_error is False
        assert result.structured_content["size"] == len(b"deep content")


@windows_only
@pytest.mark.anyio
async def test_sources_tree_long_path_over_260_chars(tmp_path):
    try:
        root, deep_dir, _deep_file, extended = make_long_path_fixture(tmp_path)
    except OSError as exc:
        pytest.skip(f"could not create a >260-char path in this environment: {exc}")

    rel_path = deep_dir.relative_to(root).as_posix()
    server = build_server([SourceRoot(id="src", root_path=str(root))])

    async with connected_session(server) as client:
        result = await call(client, "sources_tree", {"source_id": "src", "path": rel_path})

    if extended:
        assert result.is_error is True
        assert "Traceback" not in error_text(result)
    else:
        assert result.is_error is False
        names = {entry["name"] for entry in result.structured_content["result"]}
        assert names == {"deep.txt"}


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
@pytest.mark.anyio
async def test_sources_read_real_locked_file_is_error_not_traceback(tmp_path):
    root = tmp_path / "lock-root"
    root.mkdir()
    locked = root / "locked.docx"
    locked.write_text("word content", encoding="utf-8")

    try:
        handle = _acquire_exclusive_lock(locked)
    except OSError as exc:
        pytest.skip(f"could not acquire a real exclusive lock in this environment: {exc}")

    try:
        server = build_server([SourceRoot(id="src", root_path=str(root))])
        async with connected_session(server) as client:
            result = await call(client, "sources_read", {"source_id": "src", "path": "locked.docx"})
    finally:
        _release_lock(handle)

    assert result.is_error is True
    message = error_text(result)
    assert "Traceback" not in message


@windows_only
@pytest.mark.anyio
async def test_sources_tree_of_directory_with_real_locked_file_does_not_fail(tmp_path):
    root = tmp_path / "lock-root"
    root.mkdir()
    locked = root / "locked.docx"
    locked.write_text("word content", encoding="utf-8")

    try:
        handle = _acquire_exclusive_lock(locked)
    except OSError as exc:
        pytest.skip(f"could not acquire a real exclusive lock in this environment: {exc}")

    try:
        server = build_server([SourceRoot(id="src", root_path=str(root))])
        async with connected_session(server) as client:
            result = await call(client, "sources_tree", {"source_id": "src"})
    finally:
        _release_lock(handle)

    # A locked entry must still show up in the listing (size/mtime null is
    # allowed by the brief, but empirically stat() succeeds even under a
    # dwShareMode=0 lock, so size is populated here) -- above all, the
    # listing itself must not fail.
    assert result.is_error is False
    names = {entry["name"] for entry in result.structured_content["result"]}
    assert names == {"locked.docx"}


@pytest.mark.anyio
async def test_sources_read_locked_file_monkeypatch_is_error_not_traceback(tmp_path, monkeypatch):
    """Monkeypatch-equivalent of the real-lock test above (portable, no
    ctypes/Windows dependency) so the locked-file path for sources_read
    stays covered even where the real lock can't be acquired.
    """
    root = tmp_path / "lock-root"
    root.mkdir()
    locked = root / "locked.docx"
    locked.write_text("word content", encoding="utf-8")

    original_open = Path.open

    def flaky_open(self, *args, **kwargs):
        if self.name == "locked.docx":
            raise PermissionError(
                13, "The process cannot access the file because it is being used by another process"
            )
        return original_open(self, *args, **kwargs)

    monkeypatch.setattr(Path, "open", flaky_open)

    server = build_server([SourceRoot(id="src", root_path=str(root))])
    async with connected_session(server) as client:
        result = await call(client, "sources_read", {"source_id": "src", "path": "locked.docx"})

    assert result.is_error is True
    message = error_text(result)
    assert "Traceback" not in message


# --- UNC-mocked root: no live share, but a nonexistent UNC host is enough ---
# to exercise "unavailable"/isError (verified in the task 1.18 report:
# is_dir()/scandir() on this host both returned in well under a second on
# this machine -- fix-iteration #1: no numeric elapsed-time threshold is
# asserted here, since a slow/flaky network condition is real and outside
# this test's control; only the resulting status/isError contract is
# checked). ------------------------------------------------------------


@windows_only
@pytest.mark.anyio
async def test_sources_list_unc_root_is_unavailable():
    server = build_server([SourceRoot(id="unc-src", root_path=UNC_NONEXISTENT_ROOT)])

    async with connected_session(server) as client:
        result = await call(client, "sources_list", {})

    assert result.is_error is False
    entries = {entry["id"]: entry for entry in result.structured_content["result"]}
    assert entries["unc-src"]["status"] == "unavailable"
    assert entries["unc-src"]["root_path"] == UNC_NONEXISTENT_ROOT


@windows_only
@pytest.mark.anyio
async def test_sources_tree_unc_root_unavailable_is_error():
    server = build_server([SourceRoot(id="unc-src", root_path=UNC_NONEXISTENT_ROOT)])

    async with connected_session(server) as client:
        result = await call(client, "sources_tree", {"source_id": "unc-src"})

    assert result.is_error is True


@windows_only
@pytest.mark.anyio
async def test_sources_stat_unc_root_unavailable_is_error():
    server = build_server([SourceRoot(id="unc-src", root_path=UNC_NONEXISTENT_ROOT)])

    async with connected_session(server) as client:
        result = await call(client, "sources_stat", {"source_id": "unc-src", "path": "x"})

    assert result.is_error is True


@windows_only
@pytest.mark.anyio
async def test_sources_read_unc_root_unavailable_is_error():
    server = build_server([SourceRoot(id="unc-src", root_path=UNC_NONEXISTENT_ROOT)])

    async with connected_session(server) as client:
        result = await call(client, "sources_read", {"source_id": "unc-src", "path": "any.txt"})

    assert result.is_error is True
