"""Project files a person chose to index (task 3K.1, SPEC UR45).

The vault is not a source: a source may not live inside it, and nothing of it
is ever indexed on its own. A person marks files — a wiki page, a draft in
``workspace/`` — and only those are scanned, under the reserved source id
:data:`PROJECT_SOURCE_ID`.

The choice is a list of FILES in ``project.json`` (``project_index``). Marking
a folder writes down the files it holds right now (owner's decision
2026-10-09): a file that appears in it later is not indexed until it is marked
itself.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path, PurePosixPath
from typing import TYPE_CHECKING, Any

from aec_rag.graph_scope import _read_project, _write_project

if TYPE_CHECKING:
    import sqlite3

#: The source id the project's own files are indexed under. Ids of connected
#: sources are UUIDs, so this one cannot collide with them.
PROJECT_SOURCE_ID = "project"
#: Never indexed, whatever is marked: the index, memory and config live here.
SERVICE_DIR = ".aecpilot"


class ProjectPathError(ValueError):
    """A path that is not a place inside the vault."""


@dataclass(frozen=True)
class ProjectFile:
    path: str
    added_at: str

    def as_dict(self) -> dict[str, str]:
        return {"path": self.path, "added_at": self.added_at}


def vault_of(project_json: Path | str) -> Path:
    """``<vault>/.aecpilot/project.json`` → ``<vault>``."""
    return Path(project_json).parent.parent


def clean_rel(path: str) -> str:
    """A vault-relative path as it is written down: ``/``, no ends, no ``..``.

    The service folder is refused here, so nothing below has to remember it.
    """
    text = str(path).replace("\\", "/").strip().strip("/")
    parts = [part for part in text.split("/") if part not in ("", ".")]
    if not parts:
        raise ProjectPathError("пустой путь")
    if ".." in parts or PurePosixPath(text).is_absolute() or ":" in parts[0]:
        raise ProjectPathError(f"путь вне проекта: {path}")
    if parts[0].lower() == SERVICE_DIR:
        raise ProjectPathError(f"служебная папка не индексируется: {path}")
    return "/".join(parts)


def all_roots(project_json: Path | str) -> dict[str, str]:
    """Every root a ``<source>/<rel path>`` can name: the connected sources and
    the vault itself under :data:`PROJECT_SOURCE_ID` (task 3K.2)."""
    from aec_rag.project_config import parse_project_config

    roots = {root.id: root.root_path for root in parse_project_config(Path(project_json))}
    roots[PROJECT_SOURCE_ID] = str(vault_of(project_json))
    return roots


def read_project_index(project_json: Path | str) -> list[ProjectFile]:
    """Marked files, oldest first. Absent or malformed entries are skipped."""
    data = _read_project(Path(project_json))
    entries = data.get("project_index")
    result: list[ProjectFile] = []
    seen: set[str] = set()
    for entry in entries if isinstance(entries, list) else []:
        if not isinstance(entry, dict):
            continue
        try:
            path = clean_rel(str(entry.get("path") or ""))
        except ProjectPathError:
            continue
        if path in seen:
            continue
        seen.add(path)
        result.append(ProjectFile(path=path, added_at=str(entry.get("added_at") or "")))
    return result


def expand(vault: Path, rel: str) -> list[str]:
    """The files ``rel`` names right now: itself, or every file under it.

    Links are not followed and the service folder is skipped — the same rules
    the project tree shows the vault by.
    """
    target = vault / rel
    if target.is_symlink():
        return []
    if target.is_file():
        return [rel]
    if not target.is_dir():
        raise ProjectPathError(f"нет такого файла или папки в проекте: {rel}")
    found: list[str] = []
    stack = [target]
    while stack:
        folder = stack.pop()
        for child in sorted(folder.iterdir(), key=lambda p: p.name):
            if child.is_symlink():
                continue
            child_rel = child.relative_to(vault).as_posix()
            if child_rel.split("/")[0].lower() == SERVICE_DIR:
                continue
            if child.is_dir():
                stack.append(child)
            elif child.is_file():
                found.append(child_rel)
    return sorted(found)


def add_to_project_index(project_json: Path | str, paths: list[str]) -> list[str]:
    """Mark ``paths`` (files or folders); returns the files newly marked.

    A file already marked is not marked twice — the answer to the second click
    is «it already is», as with the graph.
    """
    project_json = Path(project_json)
    vault = vault_of(project_json)
    data = _read_project(project_json)
    current = read_project_index(project_json)
    known = {entry.path for entry in current}
    now = datetime.now(UTC).isoformat()

    added: list[str] = []
    for path in paths:
        for rel in expand(vault, clean_rel(path)):
            if rel in known:
                continue
            known.add(rel)
            added.append(rel)
            current.append(ProjectFile(path=rel, added_at=now))

    _store(project_json, data, current)
    return added


def marked_under(project_json: Path | str, paths: list[str]) -> list[str]:
    """The marked files ``paths`` name: a file itself, a folder every marked
    file under it — whether or not the file is still on disk."""
    targets = [clean_rel(path) for path in paths]
    return [
        entry.path
        for entry in read_project_index(project_json)
        if any(entry.path == target or entry.path.startswith(f"{target}/") for target in targets)
    ]


def remove_from_project_index(project_json: Path | str, paths: list[str]) -> list[str]:
    """Unmark ``paths`` (see :func:`marked_under`). Returns the files unmarked."""
    project_json = Path(project_json)
    data = _read_project(project_json)
    removed = set(marked_under(project_json, paths))
    current = read_project_index(project_json)
    _store(project_json, data, [entry for entry in current if entry.path not in removed])
    return [entry.path for entry in current if entry.path in removed]


def vector_documents(
    conn: sqlite3.Connection, rels: list[str], source_id: str = PROJECT_SOURCE_ID
) -> list[str]:
    """Vector-store document ids these files may have (task 3K.3): the file's
    own, which also carries its graph, and one per recognised PDF page. A
    source file taken out of the index (task 3L.3) is asked about the same way.

    Only files the index ever consumed or the graph holds are asked about — a
    file that was merely scanned has nothing there, and opening the vector store
    for it would need a provider for nothing."""
    from aec_rag.ingest import _page_doc_rel_path
    from aec_rag.lightrag_bridge import document_id
    from aec_rag.store import recognized_page_numbers

    ids: list[str] = []
    for rel in rels:
        held = conn.execute(
            "SELECT 1 FROM ingested_files WHERE source_id = ? AND rel_path = ? "
            "UNION SELECT 1 FROM graph_documents WHERE source_id = ? AND rel_path = ?",
            (source_id, rel, source_id, rel),
        ).fetchone()
        if held is None:
            continue
        ids.append(document_id(source_id, rel))
        ids.extend(
            document_id(source_id, _page_doc_rel_path(rel, page))
            for page in recognized_page_numbers(conn, source_id, rel)
        )
    return ids


def forget_files(
    conn: sqlite3.Connection, rels: list[str], source_id: str = PROJECT_SOURCE_ID
) -> None:
    """Every ``index.db`` row of these files: scan state, chunks, the ingest
    and graph marks, recognised pages, recorded failures. The file on disk is
    not touched — unmarking is not deleting."""
    from aec_rag.store import drop_file_chunks

    with conn:
        for rel in rels:
            drop_file_chunks(conn, source_id, rel)
            for table in (
                "ingested_files",
                "graph_documents",
                "pdf_pages",
                "file_errors",
                "files",
            ):
                conn.execute(
                    f"DELETE FROM {table} WHERE source_id = ? AND rel_path = ?",
                    (source_id, rel),
                )


def _store(project_json: Path, data: dict[str, Any], entries: list[ProjectFile]) -> None:
    data["project_index"] = [entry.as_dict() for entry in entries]
    _write_project(project_json, data)
