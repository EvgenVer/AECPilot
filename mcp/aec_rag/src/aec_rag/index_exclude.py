"""Source files a person took out of the index (task 3L.3, SPEC UR46).

A connected source is indexed whole. «Убрать из индекса» on one of its files
removes what the index holds of it — fragments, vectors, its graph document,
its inventory rows — and writes the file down in ``project.json``
(``index_exclude``), so the next scan does not bring it back. «Индексировать»
on it later takes it off the list again.

A place is written as the rest of the app names it: ``<source>/<rel path>``.
A folder covers everything under it. The project's own files are not taken
here — they are indexed only when marked, and unmarking is ``project-exclude``.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any

from aec_rag.graph_scope import _read_project, _write_project, clean_path
from aec_rag.project_scope import PROJECT_SOURCE_ID, ProjectPathError

if TYPE_CHECKING:
    import sqlite3
    from collections.abc import Sequence


@dataclass(frozen=True)
class ExcludedFile:
    source_id: str
    path: str
    added_at: str

    @property
    def place(self) -> str:
        return f"{self.source_id}/{self.path}"

    def as_dict(self) -> dict[str, str]:
        return {"source_id": self.source_id, "path": self.path, "added_at": self.added_at}


def split_place(place: str, source_ids: Sequence[str]) -> tuple[str, str]:
    """``<source>/<rel path>`` → the source and the path inside it.

    A bare source id, a path with ``..`` and the project's own files are
    refused: the first would take a whole source out, which is «Отключить»,
    and the last is ``project-exclude``.
    """
    source_id, _, rel = clean_path(str(place).replace("\\", "/")).partition("/")
    if source_id == PROJECT_SOURCE_ID:
        raise ProjectPathError(f"файл проекта убирается из индекса снятием отметки: {place}")
    if source_id not in source_ids:
        raise ProjectPathError(f"путь вне подключённых источников: {place}")
    parts = [part for part in rel.split("/") if part not in ("", ".")]
    if not parts or ".." in parts:
        raise ProjectPathError(f"нет файла внутри источника: {place}")
    return source_id, "/".join(parts)


def read_index_exclude(project_json: Path | str) -> list[ExcludedFile]:
    """Excluded places, oldest first. Malformed entries are skipped."""
    entries = _read_project(Path(project_json)).get("index_exclude")
    result: list[ExcludedFile] = []
    seen: set[tuple[str, str]] = set()
    for entry in entries if isinstance(entries, list) else []:
        if not isinstance(entry, dict):
            continue
        source_id = str(entry.get("source_id") or "")
        path = clean_path(str(entry.get("path") or ""))
        if not source_id or not path or (source_id, path) in seen:
            continue
        seen.add((source_id, path))
        result.append(ExcludedFile(source_id, path, str(entry.get("added_at") or "")))
    return result


def excluded_paths(project_json: Path | str, source_id: str) -> list[str]:
    """The paths excluded in one source — what its scan skips."""
    return [
        entry.path for entry in read_index_exclude(project_json) if entry.source_id == source_id
    ]


def is_excluded(rel_path: str, excluded: Sequence[str]) -> bool:
    """Is ``rel_path`` one of ``excluded`` or under one of them? On path
    segments, so excluding ``КР`` does not take ``КР-2`` along."""
    return any(rel_path == path or rel_path.startswith(f"{path}/") for path in excluded)


def add_index_exclude(project_json: Path | str, places: list[tuple[str, str]]) -> list[str]:
    """Write ``places`` down; returns the ones newly excluded, as places."""
    project_json = Path(project_json)
    data = _read_project(project_json)
    current = read_index_exclude(project_json)
    known = {(entry.source_id, entry.path) for entry in current}
    now = datetime.now(UTC).isoformat()
    added: list[str] = []
    for source_id, path in places:
        if (source_id, path) in known:
            continue
        known.add((source_id, path))
        entry = ExcludedFile(source_id, path, now)
        current.append(entry)
        added.append(entry.place)
    _store(project_json, data, current)
    return added


def remove_index_exclude(project_json: Path | str, places: list[tuple[str, str]]) -> list[str]:
    """Take ``places`` off the list — each entry equal to or under one of them.
    Returns the places removed."""
    project_json = Path(project_json)
    data = _read_project(project_json)
    current = read_index_exclude(project_json)

    def named(entry: ExcludedFile) -> bool:
        return any(
            entry.source_id == source_id and is_excluded(entry.path, [path])
            for source_id, path in places
        )

    _store(project_json, data, [entry for entry in current if not named(entry)])
    return [entry.place for entry in current if named(entry)]


def indexed_under(conn: sqlite3.Connection, source_id: str, path: str) -> list[str]:
    """Every file of the source the index knows at ``path`` or under it."""
    rows = conn.execute(
        "SELECT rel_path FROM files WHERE source_id = ? "
        "UNION SELECT rel_path FROM ingested_files WHERE source_id = ? "
        "UNION SELECT rel_path FROM graph_documents WHERE source_id = ?",
        (source_id, source_id, source_id),
    ).fetchall()
    return sorted(rel for (rel,) in rows if is_excluded(rel, [path]))


def _store(project_json: Path, data: dict[str, Any], entries: list[ExcludedFile]) -> None:
    data["index_exclude"] = [entry.as_dict() for entry in entries]
    _write_project(project_json, data)
