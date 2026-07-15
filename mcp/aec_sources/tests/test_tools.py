"""Tests for sources_list / sources_tree / sources_stat (task 1.10) and the
shared anti-traversal helper resolve_in_root.
"""

from __future__ import annotations

import os
from datetime import datetime

import pytest
from aec_sources.config import SourceRoot
from aec_sources.fs import read_file_range
from aec_sources.paths import PathOutsideSourceError, resolve_in_root
from aec_sources.server import build_server
from mcp.shared.memory import create_connected_server_and_client_session

windows_only = pytest.mark.skipif(os.name != "nt", reason="Windows path semantics")


def make_fixture_root(tmp_path):
    """Build a source root with >=2 nesting levels, Cyrillic/space names, and
    an empty subdirectory.
    """
    root = tmp_path / "source-root"
    root.mkdir()
    (root / "top.txt").write_text("top-level", encoding="utf-8")
    (root / "empty_dir").mkdir()
    docs = root / "Документы с пробелом"
    docs.mkdir()
    (docs / "файл.txt").write_text("hello", encoding="utf-8")
    nested = docs / "вложенная папка"
    nested.mkdir()
    (nested / "deep.txt").write_text("deep content", encoding="utf-8")
    return root


async def call(client, name, arguments):
    return await client.call_tool(name, arguments)


def error_text(result):
    return "\n".join(block.text for block in result.content if hasattr(block, "text"))


@pytest.mark.anyio
async def test_sources_list_reports_ok_and_unavailable(tmp_path):
    root = make_fixture_root(tmp_path)
    missing = tmp_path / "does-not-exist"
    server = build_server(
        [
            SourceRoot(id="ok-src", root_path=str(root)),
            SourceRoot(id="missing-src", root_path=str(missing)),
        ]
    )

    async with create_connected_server_and_client_session(server) as client:
        result = await call(client, "sources_list", {})

    assert result.isError is False
    entries = {entry["id"]: entry for entry in result.structuredContent["result"]}
    assert entries["ok-src"]["status"] == "ok"
    assert entries["ok-src"]["root_path"] == str(root)
    assert entries["missing-src"]["status"] == "unavailable"


@pytest.mark.anyio
async def test_sources_tree_root_lists_dirs_first_then_files(tmp_path):
    root = make_fixture_root(tmp_path)
    server = build_server([SourceRoot(id="src", root_path=str(root))])

    async with create_connected_server_and_client_session(server) as client:
        result = await call(client, "sources_tree", {"source_id": "src"})

    assert result.isError is False
    entries = result.structuredContent["result"]
    names = {entry["name"] for entry in entries}
    assert names == {"top.txt", "empty_dir", "Документы с пробелом"}

    # dirs-first: every dir entry sorts before every file entry
    types = [entry["type"] for entry in entries]
    first_file_index = types.index("file")
    assert all(t == "dir" for t in types[:first_file_index])
    assert all(t == "file" for t in types[first_file_index:])

    top_file = next(e for e in entries if e["name"] == "top.txt")
    assert top_file["size"] == len(b"top-level")
    datetime.fromisoformat(top_file["mtime"])

    empty_dir = next(e for e in entries if e["name"] == "empty_dir")
    assert empty_dir["type"] == "dir"
    assert empty_dir["size"] is None
    datetime.fromisoformat(empty_dir["mtime"])


@pytest.mark.anyio
async def test_sources_tree_subdirectory_with_cyrillic_and_spaces(tmp_path):
    root = make_fixture_root(tmp_path)
    server = build_server([SourceRoot(id="src", root_path=str(root))])

    async with create_connected_server_and_client_session(server) as client:
        result = await call(
            client, "sources_tree", {"source_id": "src", "path": "Документы с пробелом"}
        )

    assert result.isError is False
    entries = result.structuredContent["result"]
    names = {entry["name"] for entry in entries}
    assert names == {"файл.txt", "вложенная папка"}

    nested_file = next(e for e in entries if e["name"] == "файл.txt")
    assert nested_file["type"] == "file"
    assert nested_file["size"] == len(b"hello")


@pytest.mark.anyio
async def test_sources_tree_empty_subdirectory_is_empty_list(tmp_path):
    root = make_fixture_root(tmp_path)
    server = build_server([SourceRoot(id="src", root_path=str(root))])

    async with create_connected_server_and_client_session(server) as client:
        result = await call(client, "sources_tree", {"source_id": "src", "path": "empty_dir"})

    assert result.isError is False
    assert result.structuredContent["result"] == []


@pytest.mark.anyio
async def test_sources_tree_unknown_source_id_is_error(tmp_path):
    root = make_fixture_root(tmp_path)
    server = build_server([SourceRoot(id="src", root_path=str(root))])

    async with create_connected_server_and_client_session(server) as client:
        result = await call(client, "sources_tree", {"source_id": "no-such-source"})

    assert result.isError is True


@pytest.mark.anyio
async def test_sources_tree_nonexistent_path_is_error(tmp_path):
    root = make_fixture_root(tmp_path)
    server = build_server([SourceRoot(id="src", root_path=str(root))])

    async with create_connected_server_and_client_session(server) as client:
        result = await call(client, "sources_tree", {"source_id": "src", "path": "no-such-dir"})

    assert result.isError is True


@pytest.mark.anyio
async def test_sources_tree_parent_traversal_is_error(tmp_path):
    root = make_fixture_root(tmp_path)
    server = build_server([SourceRoot(id="src", root_path=str(root))])

    async with create_connected_server_and_client_session(server) as client:
        result = await call(client, "sources_tree", {"source_id": "src", "path": "../x"})

    assert result.isError is True


@pytest.mark.anyio
async def test_sources_tree_absolute_path_is_error(tmp_path):
    root = make_fixture_root(tmp_path)
    server = build_server([SourceRoot(id="src", root_path=str(root))])

    async with create_connected_server_and_client_session(server) as client:
        result = await call(
            client, "sources_tree", {"source_id": "src", "path": "C:/Windows/System32"}
        )

    assert result.isError is True


@pytest.mark.anyio
async def test_sources_tree_unavailable_root_is_error(tmp_path):
    missing = tmp_path / "does-not-exist"
    server = build_server([SourceRoot(id="src", root_path=str(missing))])

    async with create_connected_server_and_client_session(server) as client:
        result = await call(client, "sources_tree", {"source_id": "src"})

    assert result.isError is True


@pytest.mark.anyio
async def test_sources_tree_null_byte_in_path_is_error_not_traceback(tmp_path):
    root = make_fixture_root(tmp_path)
    server = build_server([SourceRoot(id="src", root_path=str(root))])

    async with create_connected_server_and_client_session(server) as client:
        result = await call(client, "sources_tree", {"source_id": "src", "path": "a\x00b"})

    assert result.isError is True
    message = error_text(result)
    assert "Traceback" not in message
    assert str(root) not in message


@pytest.mark.anyio
async def test_sources_stat_file(tmp_path):
    root = make_fixture_root(tmp_path)
    server = build_server([SourceRoot(id="src", root_path=str(root))])

    async with create_connected_server_and_client_session(server) as client:
        result = await call(client, "sources_stat", {"source_id": "src", "path": "top.txt"})

    assert result.isError is False
    stat = result.structuredContent
    assert stat["size"] == len(b"top-level")
    assert "sha256" not in stat
    assert "type" not in stat
    datetime.fromisoformat(stat["mtime"])


@pytest.mark.anyio
async def test_sources_stat_directory_size_is_null(tmp_path):
    root = make_fixture_root(tmp_path)
    server = build_server([SourceRoot(id="src", root_path=str(root))])

    async with create_connected_server_and_client_session(server) as client:
        result = await call(client, "sources_stat", {"source_id": "src", "path": "empty_dir"})

    assert result.isError is False
    stat = result.structuredContent
    assert stat["size"] is None
    assert "type" not in stat
    datetime.fromisoformat(stat["mtime"])


@pytest.mark.anyio
async def test_sources_stat_nonexistent_path_is_error(tmp_path):
    root = make_fixture_root(tmp_path)
    server = build_server([SourceRoot(id="src", root_path=str(root))])

    async with create_connected_server_and_client_session(server) as client:
        result = await call(client, "sources_stat", {"source_id": "src", "path": "no-such.txt"})

    assert result.isError is True


@pytest.mark.anyio
async def test_sources_stat_parent_traversal_is_error(tmp_path):
    root = make_fixture_root(tmp_path)
    server = build_server([SourceRoot(id="src", root_path=str(root))])

    async with create_connected_server_and_client_session(server) as client:
        result = await call(client, "sources_stat", {"source_id": "src", "path": "../secret.txt"})

    assert result.isError is True


@pytest.mark.anyio
async def test_sources_stat_null_byte_in_path_is_error_not_traceback(tmp_path):
    root = make_fixture_root(tmp_path)
    server = build_server([SourceRoot(id="src", root_path=str(root))])

    async with create_connected_server_and_client_session(server) as client:
        result = await call(client, "sources_stat", {"source_id": "src", "path": "a\x00b"})

    assert result.isError is True
    message = error_text(result)
    assert "Traceback" not in message
    assert str(root) not in message


# --- sources_read tests (task 1.11) ----------------------------------------------


def make_read_fixture(tmp_path):
    """A dedicated source root for sources_read: ascii digits for byte-precise
    range assertions, a Cyrillic-named file with Cyrillic content for the
    whole-file read test, and an empty subdirectory to exercise the
    directory-is-not-a-file error.
    """
    root = tmp_path / "read-root"
    root.mkdir()
    (root / "digits.txt").write_text("0123456789", encoding="utf-8")
    cyr_dir = root / "Кириллица"
    cyr_dir.mkdir()
    (cyr_dir / "документ.txt").write_text("Привет, мир!", encoding="utf-8")
    (root / "sub").mkdir()
    return root


@pytest.mark.anyio
async def test_sources_read_whole_file_cyrillic_name_and_content(tmp_path):
    root = make_read_fixture(tmp_path)
    server = build_server([SourceRoot(id="src", root_path=str(root))])

    async with create_connected_server_and_client_session(server) as client:
        result = await call(
            client, "sources_read", {"source_id": "src", "path": "Кириллица/документ.txt"}
        )

    assert result.isError is False
    assert result.structuredContent["result"] == "Привет, мир!"


@pytest.mark.anyio
async def test_sources_read_range_prefix(tmp_path):
    root = make_read_fixture(tmp_path)
    server = build_server([SourceRoot(id="src", root_path=str(root))])

    async with create_connected_server_and_client_session(server) as client:
        result = await call(
            client, "sources_read", {"source_id": "src", "path": "digits.txt", "range": [0, 5]}
        )

    assert result.isError is False
    assert result.structuredContent["result"] == "01234"


@pytest.mark.anyio
async def test_sources_read_range_middle(tmp_path):
    root = make_read_fixture(tmp_path)
    server = build_server([SourceRoot(id="src", root_path=str(root))])

    async with create_connected_server_and_client_session(server) as client:
        result = await call(
            client, "sources_read", {"source_id": "src", "path": "digits.txt", "range": [3, 4]}
        )

    assert result.isError is False
    assert result.structuredContent["result"] == "3456"


@pytest.mark.anyio
async def test_sources_read_range_offset_past_eof_is_empty_not_error(tmp_path):
    root = make_read_fixture(tmp_path)
    server = build_server([SourceRoot(id="src", root_path=str(root))])

    async with create_connected_server_and_client_session(server) as client:
        result = await call(
            client, "sources_read", {"source_id": "src", "path": "digits.txt", "range": [100, 5]}
        )

    assert result.isError is False
    assert result.structuredContent["result"] == ""


@pytest.mark.anyio
async def test_sources_read_range_length_past_eof_is_truncated_not_error(tmp_path):
    root = make_read_fixture(tmp_path)
    server = build_server([SourceRoot(id="src", root_path=str(root))])

    async with create_connected_server_and_client_session(server) as client:
        result = await call(
            client, "sources_read", {"source_id": "src", "path": "digits.txt", "range": [8, 100]}
        )

    assert result.isError is False
    assert result.structuredContent["result"] == "89"


@pytest.mark.anyio
async def test_sources_read_parent_traversal_is_error(tmp_path):
    root = make_read_fixture(tmp_path)
    server = build_server([SourceRoot(id="src", root_path=str(root))])

    async with create_connected_server_and_client_session(server) as client:
        result = await call(client, "sources_read", {"source_id": "src", "path": "../secret.txt"})

    assert result.isError is True


@pytest.mark.anyio
async def test_sources_read_absolute_path_is_error(tmp_path):
    root = make_read_fixture(tmp_path)
    server = build_server([SourceRoot(id="src", root_path=str(root))])

    async with create_connected_server_and_client_session(server) as client:
        result = await call(
            client,
            "sources_read",
            {"source_id": "src", "path": "C:/Windows/System32/notepad.exe"},
        )

    assert result.isError is True


@pytest.mark.anyio
async def test_sources_read_unknown_source_id_is_error(tmp_path):
    root = make_read_fixture(tmp_path)
    server = build_server([SourceRoot(id="src", root_path=str(root))])

    async with create_connected_server_and_client_session(server) as client:
        result = await call(
            client, "sources_read", {"source_id": "no-such-source", "path": "digits.txt"}
        )

    assert result.isError is True


@pytest.mark.anyio
async def test_sources_read_directory_is_error(tmp_path):
    root = make_read_fixture(tmp_path)
    server = build_server([SourceRoot(id="src", root_path=str(root))])

    async with create_connected_server_and_client_session(server) as client:
        result = await call(client, "sources_read", {"source_id": "src", "path": "sub"})

    assert result.isError is True


@pytest.mark.anyio
async def test_sources_read_nonexistent_path_is_error(tmp_path):
    root = make_read_fixture(tmp_path)
    server = build_server([SourceRoot(id="src", root_path=str(root))])

    async with create_connected_server_and_client_session(server) as client:
        result = await call(client, "sources_read", {"source_id": "src", "path": "no-such.txt"})

    assert result.isError is True


@pytest.mark.anyio
@pytest.mark.parametrize(
    "bad_range",
    [[0], [0, 1, 2], [-1, 5], [0, 0]],
    ids=["one-element", "three-elements", "negative-offset", "zero-length"],
)
async def test_sources_read_malformed_range_is_error(tmp_path, bad_range):
    root = make_read_fixture(tmp_path)
    server = build_server([SourceRoot(id="src", root_path=str(root))])

    async with create_connected_server_and_client_session(server) as client:
        result = await call(
            client,
            "sources_read",
            {"source_id": "src", "path": "digits.txt", "range": bad_range},
        )

    assert result.isError is True
    message = error_text(result)
    assert message  # a human-readable explanation, not a bare failure


@pytest.mark.anyio
async def test_sources_read_null_byte_in_path_is_error_not_traceback(tmp_path):
    root = make_read_fixture(tmp_path)
    server = build_server([SourceRoot(id="src", root_path=str(root))])

    async with create_connected_server_and_client_session(server) as client:
        result = await call(client, "sources_read", {"source_id": "src", "path": "a\x00b"})

    assert result.isError is True
    message = error_text(result)
    assert "Traceback" not in message
    assert str(root) not in message


@pytest.mark.anyio
async def test_sources_read_symlink_escaping_root_is_error(tmp_path):
    """A symlink *inside* the root pointing *outside* it is the main
    exfiltration vector for sources_read: resolve_in_root's containment
    check (which resolves symlinks) must still catch it.
    """
    root = make_read_fixture(tmp_path)
    outside_target = tmp_path / "outside-secret.txt"
    outside_target.write_text("outside content", encoding="utf-8")
    link = root / "escape-link.txt"
    try:
        os.symlink(outside_target, link)
    except OSError:
        pytest.skip("symlink creation not permitted (needs Windows dev mode/privileges)")

    server = build_server([SourceRoot(id="src", root_path=str(root))])

    async with create_connected_server_and_client_session(server) as client:
        result = await call(client, "sources_read", {"source_id": "src", "path": "escape-link.txt"})

    assert result.isError is True


# --- read_file_range unit tests: the 10 MiB default limit is exercised via a
# small max_bytes override on the pure helper, rather than by creating a real
# multi-megabyte fixture file. -----------------------------------------------


def test_read_file_range_whole_file_over_limit_is_error(tmp_path):
    target = tmp_path / "big.txt"
    target.write_text("0123456789", encoding="utf-8")

    with pytest.raises(ValueError, match="too large"):
        read_file_range(target, None, max_bytes=5)


def test_read_file_range_whole_file_at_limit_is_ok(tmp_path):
    target = tmp_path / "exact.txt"
    target.write_text("01234", encoding="utf-8")

    assert read_file_range(target, None, max_bytes=5) == "01234"


def test_read_file_range_length_over_limit_is_error(tmp_path):
    target = tmp_path / "small.txt"
    target.write_text("0123456789", encoding="utf-8")

    with pytest.raises(ValueError, match="limit"):
        read_file_range(target, [0, 10], max_bytes=5)


def test_read_file_range_binary_content_is_replaced_not_raised(tmp_path):
    target = tmp_path / "binary.bin"
    target.write_bytes(b"\xff\xfeabc")

    assert "abc" in read_file_range(target, None)


# --- resolve_in_root unit tests -------------------------------------------------


def test_resolve_in_root_no_path_returns_root(tmp_path):
    assert resolve_in_root(tmp_path, None) == tmp_path


def test_resolve_in_root_normal_relative_path(tmp_path):
    (tmp_path / "sub").mkdir()
    assert resolve_in_root(tmp_path, "sub") == (tmp_path / "sub").resolve()


def test_resolve_in_root_rejects_dotdot(tmp_path):
    with pytest.raises(PathOutsideSourceError):
        resolve_in_root(tmp_path, "..")


def test_resolve_in_root_rejects_dotdot_inside_path(tmp_path):
    with pytest.raises(PathOutsideSourceError):
        resolve_in_root(tmp_path, "a/../../b")


def test_resolve_in_root_rejects_absolute_path(tmp_path):
    with pytest.raises(PathOutsideSourceError):
        resolve_in_root(tmp_path, "C:/Windows")


@windows_only
def test_resolve_in_root_rejects_backslash_traversal(tmp_path):
    with pytest.raises(PathOutsideSourceError):
        resolve_in_root(tmp_path, r"a\..\..\b")


@windows_only
def test_resolve_in_root_accepts_mixed_separators_within_root(tmp_path):
    (tmp_path / "a" / "b").mkdir(parents=True)
    assert resolve_in_root(tmp_path, r"a\b") == (tmp_path / "a" / "b").resolve()


def test_resolve_in_root_rejects_rooted_path_without_drive(tmp_path):
    # On Windows, Path("/etc/passwd").is_absolute() is False (no drive letter),
    # so the containment check (not just is_absolute()) must catch this escape.
    with pytest.raises(PathOutsideSourceError):
        resolve_in_root(tmp_path, "/etc/passwd")


# --- adversarial-review fix iteration (task 1.10, fix #1): Windows-specific
# path forms that must be rejected outright, verified empirically against the
# actual resolver (see fix-iteration report) rather than assumed. ------------


@windows_only
def test_resolve_in_root_rejects_trailing_space_dotdot(tmp_path):
    # Empirically, Windows silently drops ".. " (trailing-space-trimmed by
    # the OS) rather than climbing a level, so pre-hardening this never
    # actually escaped root either — but it must be REJECTED outright (never
    # returned as a no-op path), so a caller can't rely on that undocumented
    # OS-specific quirk.
    with pytest.raises(PathOutsideSourceError):
        resolve_in_root(tmp_path, ".. ")


@windows_only
def test_resolve_in_root_rejects_all_dots(tmp_path):
    with pytest.raises(PathOutsideSourceError):
        resolve_in_root(tmp_path, "...")


@windows_only
def test_resolve_in_root_rejects_nested_trailing_space_dotdot(tmp_path):
    with pytest.raises(PathOutsideSourceError):
        resolve_in_root(tmp_path, "sub/.. ")


@windows_only
def test_resolve_in_root_rejects_drive_relative_path(tmp_path):
    with pytest.raises(PathOutsideSourceError):
        resolve_in_root(tmp_path, "C:foo")


@windows_only
def test_resolve_in_root_rejects_bare_drive(tmp_path):
    with pytest.raises(PathOutsideSourceError):
        resolve_in_root(tmp_path, "C:")


@windows_only
def test_resolve_in_root_rejects_unc_forward_slashes(tmp_path):
    with pytest.raises(PathOutsideSourceError):
        resolve_in_root(tmp_path, "//server/share")


@windows_only
def test_resolve_in_root_rejects_unc_backslashes(tmp_path):
    with pytest.raises(PathOutsideSourceError):
        resolve_in_root(tmp_path, r"\\server\share")


def test_resolve_in_root_rejects_symlink_escaping_root(tmp_path):
    outside_target = tmp_path / "outside-secret.txt"
    outside_target.write_text("outside content", encoding="utf-8")
    root = tmp_path / "root"
    root.mkdir()
    link = root / "escape-link.txt"
    try:
        os.symlink(outside_target, link)
    except OSError:
        pytest.skip("symlink creation not permitted (needs Windows dev mode/privileges)")

    with pytest.raises(PathOutsideSourceError):
        resolve_in_root(root, "escape-link.txt")
