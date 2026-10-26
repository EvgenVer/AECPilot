"""Filesystem walker + sha256-based change detection feeding ``index.db``.

See docs/history/specs/workspace-sources.md (Data schemas, Edge cases) for the contract:
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
from typing import TYPE_CHECKING

from aec_rag.index_exclude import is_excluded

if TYPE_CHECKING:
    from collections.abc import Sequence

# Default cap (bytes) above which a file is skipped rather than hashed, per
# docs/history/specs/workspace-sources.md (Edge cases: "Файл больше лимита ... default 200 МБ").
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


# Как часто файл перехешируется, даже если размер и mtime не двигались
# (находка D-54). Сутки: достаточно редко, чтобы обычный скан по-прежнему
# стоил один stat на файл, и достаточно часто, чтобы правка «в тот же
# размер и тот же тик mtime» не жила в индексе вечно.
DEFAULT_REHASH_AFTER_S = 24 * 60 * 60


def _hash_is_stale(indexed_at: str | None, now: datetime, rehash_after_s: float) -> bool:
    """Пора ли перехешировать файл, у которого stat не изменился.

    Пропуск по (size, mtime) — стандартный размен, тот же, что держит git в
    своём stat-кэше, и спека нигде не обещает «хешировать каждый файл при
    каждом скане». Но у размена есть слепое пятно: правка, попавшая и в тот же
    размер, и в тот же тик mtime, не будет замечена НИКОГДА. Отсюда потолок по
    времени — не «сверять всё каждый раз», а «не доверять stat дольше суток».

    Отметка берётся из `indexed_at`, который и означает «когда мы последний раз
    этот файл действительно читали»: ветка «не изменился» его не трогает.
    Отдельного поля и миграции схемы для этого не нужно.

    Нечитаемая или отсутствующая отметка — повод перехешировать, а не повод
    промолчать: неизвестный возраст хуже старого.
    """
    if rehash_after_s <= 0 or not indexed_at:
        return True
    try:
        stamp = datetime.fromisoformat(indexed_at)
    except ValueError:
        return True
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=UTC)

    return (now - stamp).total_seconds() >= rehash_after_s


def walk_files(root: Path | str, unreadable: list[str] | None = None) -> Iterator[Path]:
    """Iteratively walk ``root``, yielding regular files as ``Path`` objects.

    Uses an explicit stack (no recursion) and ``os.scandir`` with
    ``follow_symlinks=False``. Directories (including junctions, which
    ``os.scandir`` reports as plain directories on Windows) are tracked by
    ``os.path.realpath`` in a visited set, so a symlink/junction cycle is
    never re-entered. Symlinked files are skipped outright (not yielded).

    NOT a containment check, and deliberately so. ``realpath`` goes into the
    visited set; it is never compared against the root, so a junction leading
    OUT of the source is walked and its files are indexed. That was put to the
    owner with the measurement and accepted on 2026-08-26 (finding D-52): a
    junction inside a folder somebody connected counts as part of that folder.
    Do not "fix" it here — the accepted risk and what it admits are written up
    in ``docs/THREAT_MODEL.md`` §Accepted risks and in docs/history/specs/workspace-sources.md;
    changing it is a requirements decision, not a bugfix.

    ``unreadable``, when given, collects the root-relative paths the walk could
    not look inside — or could not even classify. Находка D-46: молчаливый
    ``continue`` наружу ничего не отдавал, файлы под недоступным каталогом
    просто не попадали в обход, а сверка в ``scan_source`` не отличает «не смогли
    посмотреть» от «удалено», и вычёркивает из индекса всё поддерево. Хватает
    отказа в правах, файла-заглушки OneDrive или антивируса, подержавшего
    каталог секунду: противник для этого не нужен, а человек узнаёт о пропаже
    по исчезнувшим цитатам. Список отдаётся наружу, чтобы сверка могла
    сказать «не знаю» вместо «удалено».
    """
    root = Path(root)
    visited = {os.path.realpath(root)}
    stack = [root]

    def note_unreadable(path: Path | str) -> None:
        if unreadable is None:
            return
        try:
            unreadable.append(Path(path).relative_to(root).as_posix())
        except ValueError:
            # Вне корня оказаться неоткуда, но пусть отчёт лучше будет с
            # абсолютным путём, чем обход упадёт при попытке о нём сообщить.
            unreadable.append(str(path))

    while stack:
        current = stack.pop()
        try:
            with os.scandir(current) as it:
                entries = list(it)
        except OSError:
            note_unreadable(current)
            continue
        for entry in entries:
            try:
                is_dir = entry.is_dir(follow_symlinks=False)
            except OSError:
                # Даже тип неизвестен: это может быть файл, который иначе
                # молча уехал бы в «удалённые».
                note_unreadable(entry.path)
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
    rehash_after_s: float = DEFAULT_REHASH_AFTER_S,
    only: Sequence[str] | None = None,
    exclude: Sequence[str] = (),
) -> dict:
    """Scan ``root_path`` and reconcile ``files`` rows for ``source_id``.

    ``only`` (task 3K.2) replaces the walk with exactly these root-relative
    files: the project's own files are scanned only where a person marked them
    (SPEC UR45), never by walking the vault. A listed file that is gone is
    reconciled as deleted, like any other.

    ``exclude`` (task 3L.3) — places a person took out of the index: files
    there are not read, and not reconciled as deleted either — they are on
    disk; the index simply holds nothing of them.

    Returns ``{added: [rel_path, ...], changed: [...], deleted: [...],
    unchanged: n, unreadable_dirs: [...], root_unavailable: bool}``.
    ``unreadable_dirs`` пусто у полного скана; непустое означает, что скан
    деградировал — эти поддеревья обойти не удалось, и всё, что под ними, из
    сверки на удаление исключено (находка D-46). Change detection is by
    ``(size, mtime)``: sha256 is only (re)computed when one of them differs
    from the stored row, so an untouched file costs no hashing on repeat
    scans — unless the stored ``sha256`` is ``NULL`` (a previously
    too-large/unreadable file), in which case a rehash is always attempted
    so a since-unlocked file gets picked up even with unchanged stat info.

    ``rehash_after_s`` ставит ПОТОЛОК доверия к stat (находка D-54): файл,
    который мы не читали дольше этого срока, перехешируется, даже если размер
    и mtime не двигались. Без потолка правка, попавшая и в тот же размер, и в
    тот же тик mtime, не была бы замечена никогда. Ноль (или отрицательное)
    означает «сверять хеш всегда» — полная сверка по требованию.

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

    Note: a source can be removed from ``project.json`` while a scan of it
    (or a racing ``aec-rag detach``) is still in flight against the same
    ``index.db`` — the SQLite write lock this function holds means a racing
    ``detach`` can lose or be delayed. If that scan resurrects/keeps rows
    ``"ok"``/``"changed"`` for a source that's already gone from
    ``project.json`` by the time it finishes, this function does not itself
    detect or correct that — ``aec_rag.__main__.run_scan``'s orphan sweep
    (run right after every scan cycle) does: it detaches any ``source_id``
    present in ``index.db`` but absent from the just-read ``project.json``,
    converging the index within one scan cycle regardless of what a prior
    scan/detach race left behind.

    If ``root_path`` itself is not currently reachable (missing or
    unlistable — e.g. a dropped network share), this returns immediately
    with ``root_unavailable: True`` and every list/count at its default
    (empty/zero); no row is read as "deleted" just because the whole
    source is temporarily unreachable (docs/history/specs/workspace-sources.md, edge
    case "источник недоступен": the index is preserved).
    """
    root = Path(root_path)
    if _root_is_unavailable(root):
        return {
            "added": [],
            "changed": [],
            "deleted": [],
            "unchanged": 0,
            "unreadable_dirs": [],
            "root_unavailable": True,
        }

    rows = conn.execute(
        # `indexed_at` читается ради потолка доверия к stat (находка D-54): он и
        # означает «когда мы последний раз этот файл действительно читали».
        "SELECT rel_path, size, mtime, sha256, status, indexed_at FROM files WHERE source_id = ?",
        (source_id,),
    ).fetchall()
    existing = {
        rel_path: {
            "size": size,
            "mtime": mtime,
            "sha256": sha256,
            "status": status,
            "indexed_at": indexed_at,
        }
        for rel_path, size, mtime, sha256, status, indexed_at in rows
    }

    added: list[str] = []
    changed: list[str] = []
    deleted: list[str] = []
    unchanged = 0
    now = datetime.now(UTC)
    seen: set[str] = set()

    unreadable_dirs: list[str] = []
    files = (
        walk_files(root, unreadable_dirs)
        if only is None
        else (
            root / rel for rel in only if (root / rel).is_file() and not (root / rel).is_symlink()
        )
    )
    for file_path in files:
        rel_path = file_path.relative_to(root).as_posix()
        seen.add(rel_path)
        if exclude and is_excluded(rel_path, exclude):
            continue
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
            and not _hash_is_stale(prior["indexed_at"], now, rehash_after_s)
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

    # Находка D-46: «не смогли посмотреть» — не «удалено». Всё, что лежит под
    # каталогом, в который обход не попал, из сверки на удаление исключается:
    # иначе один отказ в правах вычеркнул бы из индекса целое поддерево, и
    # человек узнал бы об этом по пропавшим цитатам. Строки остаются как были —
    # следующий скан, когда каталог снова читается, разберётся сам.
    prefixes = tuple(f"{prefix}/" for prefix in unreadable_dirs)

    def under_unreadable(rel_path: str) -> bool:
        return rel_path in unreadable_dirs or rel_path.startswith(prefixes)

    for rel_path, info in existing.items():
        if rel_path in seen or info["status"] in ("deleted", "detached"):
            continue
        if under_unreadable(rel_path):
            # Ни в один счётчик: «unchanged» значило бы «посмотрели, то же
            # самое», а мы как раз не посмотрели. Утверждение делает
            # ``unreadable_dirs``, и только оно.
            continue
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
        # Пусто — скан полный. Непусто — скан деградировал, и об этом надо
        # сказать словами, а не молча отдать «удалено: 0».
        "unreadable_dirs": unreadable_dirs,
        "root_unavailable": False,
    }


def detach_source(conn: sqlite3.Connection, source_id: str) -> int:
    """Marks every ``files`` row belonging to ``source_id`` as ``detached``
    (task 1.16, docs/history/specs/workspace-sources.md's "Отключение источника"): rows are
    never removed, only their status changes — including rows already
    ``"ok"``/``"changed"``/``"deleted"``, since disconnecting the source
    disconnects it entirely, not just its currently-missing files.

    Idempotent: a row already ``"detached"`` is left untouched (not
    re-stamped with a new ``indexed_at``), so calling this twice for the same
    source reports 0 newly-affected rows the second time. Rows belonging to
    *other* source ids are never touched. Reattaching a detached source is
    out of scope here (see `scan_source`'s doc comment: detached rows are
    left completely alone by the scanner).

    Returns the number of rows whose status actually changed.
    """
    cursor = conn.execute(
        "UPDATE files SET status = 'detached', indexed_at = ? "
        "WHERE source_id = ? AND status != 'detached'",
        (_iso_now(), source_id),
    )
    conn.commit()
    return cursor.rowcount
