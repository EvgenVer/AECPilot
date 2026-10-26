"""Read-only filesystem helpers backing sources_list/sources_tree/sources_stat/
sources_read.

Pure functions over ``pathlib``/``os.scandir`` with no MCP concerns; the
``server`` module translates failures here into ``ToolError``.
"""

from __future__ import annotations

import os
from datetime import UTC, datetime
from pathlib import Path

from aec_sources.config import SourceRoot

# Default cap on how many bytes sources_read will return in one call, to
# protect an agent's context window. Callers that need more must page
# through the file using range=[offset, length].
DEFAULT_MAX_READ_BYTES = 10 * 1024 * 1024


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
    (docs/history/specs/workspace-sources.md: ``{size, mtime, sha256?}``).
    """
    stat_result = target.stat()
    is_dir = target.is_dir()
    return {
        "size": None if is_dir else stat_result.st_size,
        "mtime": _iso_mtime(stat_result.st_mtime),
    }


def read_file_range(
    target: Path,
    range_: list[int] | None = None,
    max_bytes: int = DEFAULT_MAX_READ_BYTES,
) -> str:
    """Read ``target``'s content as text, optionally restricted to a byte range.

    ``range_`` is ``[offset, length]`` in bytes of the underlying file, or
    ``None`` to read the whole file. ``offset`` must be >= 0 and ``length``
    must be > 0; anything else raises ``ValueError`` with an explanation of
    the expected format. An ``offset`` past end-of-file yields an empty
    string (not an error); a ``length`` reaching past end-of-file is
    silently truncated to what remains.

    Bytes are decoded as UTF-8 with ``errors="replace"``: binary content is
    returned with replacement characters rather than raising, since this
    helper is meant for text/agent consumption (byte-exact access, e.g. for
    aec-rag's parsers, goes straight to the filesystem, not through this
    tool).

    Without ``range_``, the whole file is read, but rejected with
    ``ValueError`` if it is larger than ``max_bytes`` (default 10 MiB) —
    callers must page through such files with ``range_`` instead. With
    ``range_``, ``length`` itself must not exceed ``max_bytes``. The
    over-limit check reads ``max_bytes + 1`` bytes and rejects if that many
    came back, rather than ``stat()``-ing the size first: a size check
    followed by a separate read would be a TOCTOU race (the file could grow
    between the two calls).
    """
    if range_ is None:
        with target.open("rb") as handle:
            data = handle.read(max_bytes + 1)
        if len(data) > max_bytes:
            raise ValueError(f"file too large (> {max_bytes} bytes), pass range=[offset, length]")
        return data.decode("utf-8", errors="replace")

    if len(range_) != 2:
        raise ValueError(f"range must be [offset, length] (exactly two integers), got {range_!r}")
    offset, length = range_
    if offset < 0:
        raise ValueError(f"range offset must be >= 0, got {offset}")
    if length <= 0:
        raise ValueError(f"range length must be > 0, got {length}")
    if length > max_bytes:
        raise ValueError(f"range length {length} exceeds the {max_bytes}-byte limit")

    with target.open("rb") as handle:
        handle.seek(offset)
        data = handle.read(length)
    return data.decode("utf-8", errors="replace")
