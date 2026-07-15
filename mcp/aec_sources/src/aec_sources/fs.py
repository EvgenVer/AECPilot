"""Read-only filesystem helpers backing sources_list/sources_tree/sources_stat.

Pure functions over ``pathlib``/``os.scandir`` with no MCP concerns; the
``server`` module translates failures here into ``ToolError``.
"""

from __future__ import annotations

import os
from datetime import UTC, datetime
from pathlib import Path

from aec_sources.config import SourceRoot


def _iso_mtime(epoch_seconds: float) -> str:
    return datetime.fromtimestamp(epoch_seconds, tz=UTC).isoformat()


def list_roots_status(roots: list[SourceRoot]) -> list[dict]:
    """Return ``{id, root_path, status}`` for every root; never raises.

    ``status`` is ``"ok"`` if ``root_path`` exists and is a directory,
    otherwise ``"unavailable"``.
    """
    return [
        {
            "id": root.id,
            "root_path": root.root_path,
            "status": "ok" if Path(root.root_path).is_dir() else "unavailable",
        }
        for root in roots
    ]


def list_directory(target: Path) -> list[dict]:
    """List ``target``'s direct children: directories first, then by name.

    Entries whose ``stat()`` fails (permissions, file lock, ...) are still
    included, with ``size``/``mtime`` set to ``None``, rather than failing
    the whole listing.
    """
    entries = []
    with os.scandir(target) as it:
        for entry in it:
            is_dir = entry.is_dir(follow_symlinks=False)
            size: int | None = None
            mtime: str | None = None
            try:
                stat_result = entry.stat(follow_symlinks=False)
            except OSError:
                stat_result = None
            if stat_result is not None:
                mtime = _iso_mtime(stat_result.st_mtime)
                if not is_dir:
                    size = stat_result.st_size
            entries.append(
                {
                    "name": entry.name,
                    "type": "dir" if is_dir else "file",
                    "size": size,
                    "mtime": mtime,
                }
            )
    entries.sort(key=lambda entry: (entry["type"] != "dir", entry["name"]))
    return entries


def stat_path(target: Path) -> dict:
    """Return ``{size, mtime}`` for the file or directory at ``target``.

    ``size`` is ``None`` for directories. sha256 is not computed here (see
    task 1.13, the indexer) and is therefore omitted, matching the contract
    (specs/workspace-sources.md: ``{size, mtime, sha256?}``).
    """
    stat_result = target.stat()
    is_dir = target.is_dir()
    return {
        "size": None if is_dir else stat_result.st_size,
        "mtime": _iso_mtime(stat_result.st_mtime),
    }
