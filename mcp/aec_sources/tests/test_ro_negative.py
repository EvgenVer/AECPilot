"""Negative read-only tests (task 1.17): the RO guarantee itself (no
write/delete tools exist, ever) plus the rejected-attempts journal
(docs/history/specs/workspace-sources.md: "logs/ — журнал операций и отклонённых
попыток записи"; BDD "Гарантия read-only").
"""

from __future__ import annotations

import inspect
import json
from datetime import datetime

import pytest
from aec_sources import audit
from aec_sources import fs as fs_module
from aec_sources import server as server_module
from aec_sources.config import SourceRoot
from aec_sources.server import build_server
from mcp_harness import connected_session

JOURNAL_FILENAME = "sources-rejected.jsonl"

# Verb fragments a future write/delete/move tool name would contain. Tool
# names must never match any of these — a plain substring check, on purpose,
# so it also flags near-misses like "sources_update".
WRITE_LIKE_SUBSTRINGS = ("write", "delete", "move", "put", "create", "remove", "rename", "mkdir")


def make_source_root(tmp_path):
    root = tmp_path / "source-root"
    root.mkdir()
    (root / "top.txt").write_text("top-level", encoding="utf-8")
    return root


def read_journal_lines(logs_dir) -> list[dict]:
    path = logs_dir / JOURNAL_FILENAME
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]


async def call(client, name, arguments):
    return await client.call_tool(name, arguments)


def error_text(result):
    return "\n".join(block.text for block in result.content if hasattr(block, "text"))


# --- 1. tools/list: exactly the 4 contract tools, no write-like name --------


@pytest.mark.anyio
async def test_tools_list_is_exactly_four_read_only_tools():
    server = build_server()

    async with connected_session(server) as client:
        result = await client.list_tools()

    names = {tool.name for tool in result.tools}
    assert len(result.tools) == 4
    for name in names:
        lowered = name.lower()
        assert not any(bad in lowered for bad in WRITE_LIKE_SUBSTRINGS), name


# --- 2. calling a nonexistent write-like tool name is rejected + journaled -


@pytest.mark.anyio
@pytest.mark.parametrize("tool_name", ["sources_write", "sources_delete", "sources_put"])
async def test_unknown_write_like_tool_call_is_error_and_journaled(tmp_path, tool_name):
    logs_dir = tmp_path / "logs"
    server = build_server([], logs_dir=logs_dir)

    async with connected_session(server) as client:
        result = await call(client, tool_name, {"path": "x"})

    assert result.is_error is True

    lines = read_journal_lines(logs_dir)
    assert len(lines) == 1
    entry = lines[0]
    assert entry["event"] == "unknown_tool"
    assert entry["tool"] == tool_name
    datetime.fromisoformat(entry["ts"])


# --- 3. a traversal attempt is rejected + journaled with tool/source/path --


@pytest.mark.anyio
async def test_traversal_attempt_is_error_and_journaled(tmp_path):
    root = make_source_root(tmp_path)
    logs_dir = tmp_path / "logs"
    server = build_server([SourceRoot(id="src", root_path=str(root))], logs_dir=logs_dir)

    async with connected_session(server) as client:
        result = await call(client, "sources_read", {"source_id": "src", "path": "../x"})

    assert result.is_error is True

    lines = read_journal_lines(logs_dir)
    assert len(lines) == 1
    entry = lines[0]
    assert entry["event"] == "path_outside_source"
    assert entry["tool"] == "sources_read"
    assert entry["source_id"] == "src"
    assert entry["path"] == "../x"
    assert entry["reason"]
    datetime.fromisoformat(entry["ts"])


# --- 4. several rejections in a row are additive, nothing overwritten ------


@pytest.mark.anyio
async def test_journal_is_additive_across_several_rejections(tmp_path):
    root = make_source_root(tmp_path)
    logs_dir = tmp_path / "logs"
    logs_dir.mkdir()
    preexisting = logs_dir / JOURNAL_FILENAME
    preexisting.write_text(json.dumps({"ts": "2020-01-01T00:00:00+00:00", "event": "seed"}) + "\n")

    server = build_server([SourceRoot(id="src", root_path=str(root))], logs_dir=logs_dir)

    async with connected_session(server) as client:
        for _ in range(3):
            await call(client, "sources_read", {"source_id": "src", "path": "../x"})

    lines = read_journal_lines(logs_dir)
    assert len(lines) == 4  # 1 preexisting + 3 new rejections
    assert lines[0]["event"] == "seed"
    assert all(entry["event"] == "path_outside_source" for entry in lines[1:])


# --- 5. a journal write failure never breaks the tool's own response ------


@pytest.mark.anyio
async def test_journal_write_failure_does_not_break_tool_response(tmp_path, monkeypatch):
    root = make_source_root(tmp_path)
    logs_dir = tmp_path / "logs"
    server = build_server([SourceRoot(id="src", root_path=str(root))], logs_dir=logs_dir)

    from pathlib import Path

    original_open = Path.open

    def broken_open(self, *args, **kwargs):
        if self.name == JOURNAL_FILENAME:
            raise OSError("simulated disk failure")
        return original_open(self, *args, **kwargs)

    monkeypatch.setattr(Path, "open", broken_open)

    async with connected_session(server) as client:
        result = await call(client, "sources_read", {"source_id": "src", "path": "../x"})

    assert result.is_error is True
    assert not (logs_dir / JOURNAL_FILENAME).exists()
    # The response must still report the *actual* rejection reason (the
    # traversal attempt) — the journal write failure must not leak into or
    # replace it. Without audit.log_rejected's own `except OSError: pass`,
    # the simulated disk failure below would bubble up instead and this
    # assertion would fail (verified manually: task 1.17 fix-iteration #1).
    message = error_text(result)
    assert "PATH_OUTSIDE_SOURCE" in message
    assert "simulated disk failure" not in message


# --- 6. static guarantee: no public write-like functions in fs.py/server.py -


@pytest.mark.parametrize("module", [fs_module, server_module])
def test_module_exposes_no_public_write_like_functions(module):
    public_names = [name for name in dir(module) if not name.startswith("_")]
    functions = [name for name in public_names if inspect.isfunction(getattr(module, name))]
    assert functions, f"{module.__name__} should export at least one public function"
    for name in functions:
        lowered = name.lower()
        assert not any(bad in lowered for bad in WRITE_LIKE_SUBSTRINGS), name


# --- 7. the journal is bounded: it rolls over instead of growing forever ---


def test_journal_rolls_over_once_it_outgrows_the_limit(tmp_path):
    """A rejection log that grows without bound is a slow disk leak on the
    user's machine, and nobody reads its first million lines. Past the limit
    the file is moved aside and a fresh one starts; exactly one previous
    generation survives.
    """
    logs_dir = tmp_path / "logs"
    logs_dir.mkdir()
    journal = logs_dir / JOURNAL_FILENAME
    journal.write_text("x" * (audit.MAX_LOG_BYTES + 1), encoding="utf-8")

    audit.log_rejected(logs_dir, {"event": "after_rollover"})

    rotated = logs_dir / (JOURNAL_FILENAME + audit.ROTATED_SUFFIX)
    assert rotated.exists(), "прошлое поколение должно сохраниться"
    assert read_journal_lines(logs_dir) == [
        {"ts": read_journal_lines(logs_dir)[0]["ts"], "event": "after_rollover"}
    ]


def test_journal_keeps_only_one_previous_generation(tmp_path):
    """The second rollover overwrites the first one's backup rather than
    piling up `.1`, `.2`, `.3`: the bound must hold over time, not just once.
    """
    logs_dir = tmp_path / "logs"
    logs_dir.mkdir()
    journal = logs_dir / JOURNAL_FILENAME
    rotated = logs_dir / (JOURNAL_FILENAME + audit.ROTATED_SUFFIX)

    for marker in ("first", "second"):
        journal.write_text(marker + "x" * audit.MAX_LOG_BYTES, encoding="utf-8")
        audit.log_rejected(logs_dir, {"event": marker})

    assert rotated.read_text(encoding="utf-8").startswith("second")
    assert sorted(p.name for p in logs_dir.iterdir()) == [
        JOURNAL_FILENAME,
        JOURNAL_FILENAME + audit.ROTATED_SUFFIX,
    ]


def test_journal_below_the_limit_is_appended_to_not_rolled(tmp_path):
    """Mutation guard: rotating unconditionally would pass the two tests above
    while throwing away every previous line. Below the limit nothing moves.
    """
    logs_dir = tmp_path / "logs"

    audit.log_rejected(logs_dir, {"event": "first"})
    audit.log_rejected(logs_dir, {"event": "second"})

    assert not (logs_dir / (JOURNAL_FILENAME + audit.ROTATED_SUFFIX)).exists()
    assert [entry["event"] for entry in read_journal_lines(logs_dir)] == ["first", "second"]
