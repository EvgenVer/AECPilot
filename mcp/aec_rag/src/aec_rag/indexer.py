"""Filesystem walker + sha256-based change detection feeding ``index.db``.

See specs/workspace-sources.md (Data schemas, Edge cases) for the contract:
size limit and locked-file skips are recorded (not fatal), and symlink/
junction cycles are guarded against via a visited-real-path set.
"""

from __future__ import annotations

import hashlib
import os
import sqlite3
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path

# Default cap (bytes) above which a file is skipped rather than hashed, per
# specs/workspace-sources.md (Edge cases: "Файл больше лимита ... default 200 МБ").
DEFAULT_MAX_SIZE = 200 * 1024 * 1024

_HASH_CHUNK_SIZE = 1024 * 1024


def sha256_file(path: Path) -> str:
    """Stream-hash ``path`` in fixed-size chunks (never loads it fully into memory)."""
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(_HASH_CHUNK_SIZE), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _iso_now() -> str:
    return datetime.now(UTC).isoformat()


def walk_files(root: Path | str) -> Iterator[Path]:
    """Iteratively walk ``root``, yielding regular files as ``Path`` objects.

    Uses an explicit stack (no recursion) and ``os.scandir`` with
    ``follow_symlinks=False``. Directories (including junctions, which
    ``os.scandir`` reports as plain directories on Windows) are tracked by
    ``os.path.realpath`` in a visited set, so a symlink/junction cycle is
    never re-entered. Symlinked files are skipped outright (not yielded).
    """
    root = Path(root)
    visited = {os.path.realpath(root)}
    stack = [root]
    while stack:
        current = stack.pop()
        try:
            with os.scandir(current) as it:
                entries = list(it)
        except OSError:
            continue
        for entry in entries:
            try:
                is_dir = entry.is_dir(follow_symlinks=False)
            except OSError:
                continue
            if is_dir:
                real = os.path.realpath(entry.path)
                if real in visited:
                    continue
                visited.add(real)
                stack.append(Path(entry.path))
            elif not entry.is_symlink():
                yield Path(entry.path)


def _hash_or_skip(path: Path, size: int, max_size: int) -> tuple[str | None, str | None]:
    """Return ``(sha256, skip_reason)``; exactly one of them is ``None``."""
    if size > max_size:
        return None, "too_large"
    try:
        return sha256_file(path), None
    except OSError:
        return None, "unreadable"


def _upsert(
    conn: sqlite3.Connection,
    source_id: str,
    rel_path: str,
    size: int | None,
    mtime: float | None,
    sha256: str | None,
    status: str,
    skip_reason: str | None,
) -> None:
    conn.execute(
        """
        INSERT INTO files
            (source_id, rel_path, size, mtime, sha256, status, skip_reason, indexed_at)
        VALUES
            (:source_id, :rel_path, :size, :mtime, :sha256, :status, :skip_reason, :indexed_at)
        ON CONFLICT (source_id, rel_path) DO UPDATE SET
            size = excluded.size,
            mtime = excluded.mtime,
            sha256 = excluded.sha256,
            status = excluded.status,
            skip_reason = excluded.skip_reason,
            indexed_at = excluded.indexed_at
        """,
        {
            "source_id": source_id,
            "rel_path": rel_path,
            "size": size,
            "mtime": mtime,
            "sha256": sha256,
            "status": status,
            "skip_reason": skip_reason,
            "indexed_at": _iso_now(),
        },
    )


def _root_is_unavailable(root: Path) -> bool:
    """Probe whether ``root`` can be reconciled against right now.

    Checks both existence (``is_dir``) and actual listability (a real
    ``os.scandir`` call): a root can exist but still be unreachable (a
    dropped network share, a permissions error), which must not be
    mistaken for "every file underneath it was deleted".
    """
    if not root.is_dir():
        return True
    try:
        with os.scandir(root) as it:
            next(it, None)
    except OSError:
        return True
    return False


def scan_source(
    conn: sqlite3.Connection,
    source_id: str,
    root_path: Path | str,
    *,
    max_size: int = DEFAULT_MAX_SIZE,
) -> dict:
    """Scan ``root_path`` and reconcile ``files`` rows for ``source_id``.

    Returns ``{added: [rel_path, ...], changed: [...], deleted: [...],
    unchanged: n, root_unavailable: bool}``. Change detection is by
    ``(size, mtime)``: sha256 is only (re)computed when one of them differs
    from the stored row, so an untouched file costs no hashing on repeat
    scans — unless the stored ``sha256`` is ``NULL`` (a previously
    too-large/unreadable file), in which case a rehash is always attempted
    so a since-unlocked file gets picked up even with unchanged stat info.

    A file whose size exceeds ``max_size`` (default 200 MiB) or that
    raises ``OSError`` while being hashed (e.g. locked) is still recorded,
    with ``sha256=NULL`` and ``skip_reason`` set to
    ``"too_large"``/``"unreadable"``; the scan itself never fails because
    of it. If a file that had a known ``sha256`` becomes unreadable while
    otherwise changed (size/mtime differ), that last-known sha256 is kept
    as a baseline rather than blanked to ``NULL`` — only ``skip_reason`` is
    recorded, so the index doesn't lose the last content fingerprint it
    actually observed. If ``os.stat`` itself fails for a file encountered
    mid-walk (e.g. it vanished or got locked between listing and stat), the
    scan does not fail: a brand-new such file is recorded with
    ``sha256=NULL``, ``skip_reason="unreadable"`` (reported under
    ``added``); an already-tracked one is left untouched (counted under
    ``unchanged``) rather than risk marking it "deleted" over a transient
    error.

    A file missing from disk but present in the DB (status other than
    ``"deleted"``/``"detached"``) is marked ``"deleted"`` — the row is
    kept, not removed. A file that reappears after being marked
    ``"deleted"`` is always rehashed and reported under ``added``, with its
    status resolved to ``"ok"`` or ``"changed"`` depending on whether the
    new sha256 matches the one last recorded for it. A row already marked
    ``"changed"`` stays ``"changed"`` even if a later scan finds it
    stable/reverted (only its size/mtime are refreshed) — clearing
    ``"changed"`` is re-ingest's job (Phase 2), not the scanner's.

    Rows with ``status = "detached"`` are left completely alone: not
    updated even if a matching file exists on disk, and never fed into the
    deleted-file reconciliation below. Reattaching them is task 1.16.

    If ``root_path`` itself is not currently reachable (missing or
    unlistable — e.g. a dropped network share), this returns immediately
    with ``root_unavailable: True`` and every list/count at its default
    (empty/zero); no row is read as "deleted" just because the whole
    source is temporarily unreachable (specs/workspace-sources.md, edge
    case "источник недоступен": the index is preserved).
    """
    root = Path(root_path)
    if _root_is_unavailable(root):
        return {
            "added": [],
            "changed": [],
            "deleted": [],
            "unchanged": 0,
            "root_unavailable": True,
        }

    rows = conn.execute(
        "SELECT rel_path, size, mtime, sha256, status FROM files WHERE source_id = ?",
        (source_id,),
    ).fetchall()
    existing = {
        rel_path: {"size": size, "mtime": mtime, "sha256": sha256, "status": status}
        for rel_path, size, mtime, sha256, status in rows
    }

    added: list[str] = []
    changed: list[str] = []
    deleted: list[str] = []
    unchanged = 0
    seen: set[str] = set()

    for file_path in walk_files(root):
        rel_path = file_path.relative_to(root).as_posix()
        seen.add(rel_path)
        prior = existing.get(rel_path)

        if prior is not None and prior["status"] == "detached":
            continue

        try:
            stat_result = file_path.stat()
        except OSError:
            if prior is None:
                _upsert(conn, source_id, rel_path, None, None, None, "ok", "unreadable")
                added.append(rel_path)
            else:
                unchanged += 1
            continue

        size = stat_result.st_size
        mtime = stat_result.st_mtime

        if (
            prior is not None
            and prior["status"] != "deleted"
            and prior["sha256"] is not None
            and prior["size"] == size
            and prior["mtime"] == mtime
        ):
            unchanged += 1
            continue

        sha, skip_reason = _hash_or_skip(file_path, size, max_size)

        if prior is None:
            _upsert(conn, source_id, rel_path, size, mtime, sha, "ok", skip_reason)
            added.append(rel_path)
        elif prior["status"] == "deleted":
            status = "ok" if sha is not None and sha == prior["sha256"] else "changed"
            _upsert(conn, source_id, rel_path, size, mtime, sha, status, skip_reason)
            added.append(rel_path)
        elif sha is not None and sha == prior["sha256"]:
            status = "changed" if prior["status"] == "changed" else "ok"
            _upsert(conn, source_id, rel_path, size, mtime, sha, status, skip_reason)
            unchanged += 1
        else:
            baseline_sha = prior["sha256"] if sha is None and skip_reason == "unreadable" else sha
            _upsert(conn, source_id, rel_path, size, mtime, baseline_sha, "changed", skip_reason)
            changed.append(rel_path)

    for rel_path, info in existing.items():
        if rel_path not in seen and info["status"] not in ("deleted", "detached"):
            conn.execute(
                "UPDATE files SET status = 'deleted', indexed_at = ? "
                "WHERE source_id = ? AND rel_path = ?",
                (_iso_now(), source_id, rel_path),
            )
            deleted.append(rel_path)

    conn.commit()
    return {
        "added": added,
        "changed": changed,
        "deleted": deleted,
        "unchanged": unchanged,
        "root_unavailable": False,
    }
