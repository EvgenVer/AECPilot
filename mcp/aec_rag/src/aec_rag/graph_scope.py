"""What the knowledge graph covers, and who decided it (task 2.10b).

SPECIFICATION UR24: the graph is **one per project**, **empty by default**, and
grows only by explicit choice — a folder or a single file. The reason is money:
building it costs an LLM call per chunk (R6, measured in
`eval/graph-cost-report.md`).

Two pieces of state, kept apart because they answer different questions:

* **the choice** — which folders and files the person marked — lives in
  ``project.json``, next to the sources it refers to. It is project
  configuration: it survives re-indexing, and it is what the interface shows
  when it says «what is in the graph».
* **the fact** — which documents are actually in the graph, and at which
  content hash — lives in ``index.db``. It is index state: it dies with the
  index and is rebuilt with it.

The difference between them is precisely the answer to «what appeared in a
marked folder and is not in the graph yet» — the list a person is asked to
confirm rather than being billed for silently.
"""

from __future__ import annotations

import json
import os
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from aec_rag.parse import SUPPORTED_SUFFIXES
from aec_rag.project_config import ProjectConfigError
from aec_rag.store import PendingFile, live_files


@dataclass(frozen=True)
class ScopeEntry:
    """One thing a person marked as belonging in the graph."""

    path: str
    kind: str
    added_at: str

    def as_dict(self) -> dict[str, str]:
        return {"path": self.path, "kind": self.kind, "added_at": self.added_at}


def _now() -> str:
    return datetime.now(UTC).isoformat()


def file_path(source_id: str, rel_path: str) -> str:
    """The one string that names a place across sources: ``<source>/<rel path>``."""
    return f"{source_id}/{rel_path}"


def covers(entry: ScopeEntry, source_id: str, rel_path: str) -> bool:
    """Does ``entry`` include this file?

    A folder entry covers everything under it; a file entry covers exactly
    itself. The comparison is on path segments, so marking ``tasks/ЭОМ`` does
    not silently pull in ``tasks/ЭОМ-2``.
    """
    target = file_path(source_id, rel_path)
    if entry.kind == "file":
        return target == entry.path
    marker = entry.path.rstrip("/")
    return target == marker or target.startswith(f"{marker}/")


# --- the choice: project.json -------------------------------------------------


def read_scope(project_json: Path | str) -> list[ScopeEntry]:
    """Marked folders and files, oldest first. Absent means «graph is empty»."""
    data = _read_project(Path(project_json))
    scope = data.get("graph_scope") if isinstance(data, dict) else None
    entries = (scope or {}).get("entries") if isinstance(scope, dict) else None
    result: list[ScopeEntry] = []
    for entry in entries or []:
        if not isinstance(entry, dict):
            continue
        path = str(entry.get("path") or "").strip()
        kind = str(entry.get("kind") or "").strip()
        if not path or kind not in ("folder", "file"):
            continue
        result.append(ScopeEntry(path=path, kind=kind, added_at=str(entry.get("added_at") or "")))
    return result


def add_to_scope(
    project_json: Path | str, paths: list[str], kinds: dict[str, str]
) -> list[ScopeEntry]:
    """Mark ``paths`` as belonging in the graph; returns the whole scope after.

    Re-marking something already marked is a no-op rather than an error: the
    interface offers «add to graph» on a folder whether or not it is already
    there, and the honest answer to the second click is «it already is».
    """
    project_json = Path(project_json)
    data = _read_project(project_json)
    existing = read_scope(project_json)
    known = {entry.path for entry in existing}

    for path in paths:
        cleaned = str(path).strip().strip("/")
        if not cleaned or cleaned in known:
            continue
        kind = kinds.get(path, kinds.get(cleaned, "folder"))
        existing.append(ScopeEntry(path=cleaned, kind=kind, added_at=_now()))
        known.add(cleaned)

    data["graph_scope"] = {"entries": [entry.as_dict() for entry in existing]}
    _write_project(project_json, data)
    return existing


def remove_from_scope(project_json: Path | str, paths: list[str]) -> list[ScopeEntry]:
    project_json = Path(project_json)
    data = _read_project(project_json)
    dropped = {str(path).strip().strip("/") for path in paths}
    kept = [entry for entry in read_scope(project_json) if entry.path not in dropped]
    data["graph_scope"] = {"entries": [entry.as_dict() for entry in kept]}
    _write_project(project_json, data)
    return kept


def _read_project(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise ProjectConfigError(f"project.json not found: {path}")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ProjectConfigError(f"project.json is not valid JSON: {path} ({exc})") from exc
    if not isinstance(data, dict):
        raise ProjectConfigError(f"project.json must be an object: {path}")
    return data


def _write_project(path: Path, data: dict[str, Any]) -> None:
    """Rewrite project.json whole, preserving every key we do not own.

    Written to a temporary file and renamed: the desktop app reads this file on
    every project operation, and a half-written config would take the project
    down rather than just the graph scope.
    """
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


# --- the fact: index.db -------------------------------------------------------


def mark_in_graph(
    conn: sqlite3.Connection, source_id: str, rel_path: str, sha256: str, chunk_count: int
) -> None:
    with conn:
        conn.execute(
            """
            INSERT INTO graph_documents (source_id, rel_path, sha256, chunk_count, added_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (source_id, rel_path) DO UPDATE SET
                sha256 = excluded.sha256,
                chunk_count = excluded.chunk_count,
                added_at = excluded.added_at
            """,
            (source_id, rel_path, sha256, chunk_count, _now()),
        )


def unmark_in_graph(conn: sqlite3.Connection, source_id: str, rel_path: str) -> None:
    with conn:
        conn.execute(
            "DELETE FROM graph_documents WHERE source_id = ? AND rel_path = ?",
            (source_id, rel_path),
        )


def documents_in_graph(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT source_id, rel_path, sha256, chunk_count, added_at FROM graph_documents "
        "ORDER BY source_id, rel_path"
    ).fetchall()
    return [
        {
            "source_id": source_id,
            "rel_path": rel_path,
            "sha256": sha256,
            "chunks": chunk_count,
            "added_at": added_at,
        }
        for source_id, rel_path, sha256, chunk_count, added_at in rows
    ]


def indexable_files(conn: sqlite3.Connection) -> list[PendingFile]:
    """Live files whose format we can actually read — the graph's possible extent."""
    return [
        file
        for file in live_files(conn)
        if Path(file.rel_path).suffix.lower() in SUPPORTED_SUFFIXES
    ]


def graph_stats(conn: sqlite3.Connection) -> dict[str, Any]:
    """What the graph covers, including whether that is the whole project.

    ``covers_whole_project`` is answered honestly and pessimistically: an empty
    project is not «covered», it is empty, and an overview of half a project
    presented as an overview of the project misleads worse than a refusal
    (specs/qa-over-sources.md).
    """
    documents = conn.execute("SELECT count(*), coalesce(sum(chunk_count), 0) FROM graph_documents")
    count, chunks = documents.fetchone()
    indexable = indexable_files(conn)
    in_graph = {(row["source_id"], row["rel_path"]) for row in documents_in_graph(conn)}
    outside = [file for file in indexable if (file.source_id, file.rel_path) not in in_graph]
    return {
        "documents": count,
        "chunks": chunks,
        "documents_outside": len(outside),
        "covers_whole_project": bool(indexable) and not outside,
    }


def pending_for_scope(conn: sqlite3.Connection, entries: list[ScopeEntry]) -> list[PendingFile]:
    """Files inside a marked folder that the graph does not hold at this content.

    This is the list SPECIFICATION UR24 requires be shown and confirmed rather
    than acted on: new documents in a folder someone marked months ago are new
    spending, and spending is not something to discover afterwards.
    """
    if not entries:
        return []
    in_graph = {
        (row["source_id"], row["rel_path"]): row["sha256"] for row in documents_in_graph(conn)
    }
    pending: list[PendingFile] = []
    for file in indexable_files(conn):
        if not any(covers(entry, file.source_id, file.rel_path) for entry in entries):
            continue
        if in_graph.get((file.source_id, file.rel_path)) == file.sha256:
            continue
        pending.append(file)
    return pending


async def add_documents_to_graph(
    conn: sqlite3.Connection,
    rag,
    files: list[PendingFile],
    *,
    on_progress=None,
) -> dict[str, Any]:
    """Tier 2: extract entities and relations from documents already indexed.

    The text is not re-read from disk. The chunks are the ones tier 1 already
    produced and stored, so the graph is built over exactly the text a citation
    can point back at — and a document whose chunks are missing is reported as
    such rather than quietly skipped, because «added to the graph» must never be
    said about something that was not.
    """
    from aec_rag.lightrag_bridge import IndexedChunk, insert_document
    from aec_rag.store import get_file_chunks

    added = 0
    chunks_total = 0
    errors: list[dict[str, str]] = []

    for done, file in enumerate(files, start=1):
        stored = get_file_chunks(conn, file.source_id, file.rel_path)
        if not stored:
            errors.append(
                {
                    "source_id": file.source_id,
                    "rel_path": file.rel_path,
                    "error": "документ ещё не проиндексирован — сначала ingest",
                }
            )
            continue
        try:
            await insert_document(
                rag,
                source_id=file.source_id,
                rel_path=file.rel_path,
                chunks=[IndexedChunk(chunk_id=c.chunk_id, text=c.text) for c in stored],
                build_graph=True,
            )
        except Exception as exc:  # noqa: BLE001 — one document must not stop the rest
            errors.append(
                {"source_id": file.source_id, "rel_path": file.rel_path, "error": str(exc)}
            )
            continue

        mark_in_graph(conn, file.source_id, file.rel_path, file.sha256, len(stored))
        added += 1
        chunks_total += len(stored)
        if on_progress is not None:
            on_progress(done, len(files), file, len(stored))

    return {
        "documents_added": added,
        "chunks": chunks_total,
        "failed": len(errors),
        "errors": errors,
    }


def estimate(conn: sqlite3.Connection, files: list[PendingFile]) -> dict[str, int]:
    """How much work adding ``files`` to the graph would be, before doing it.

    Chunk counts come from ``ingested_files`` — the file is already indexed at
    tier one, so this is a count, not a guess. A file that is not indexed yet
    contributes ``0`` and the caller sees the difference between «documents»
    and what the chunk number covers.
    """
    if not files:
        return {"documents": 0, "chunks_estimate": 0, "not_indexed": 0}
    total = 0
    not_indexed = 0
    for file in files:
        row = conn.execute(
            "SELECT chunk_count FROM ingested_files WHERE source_id = ? AND rel_path = ?",
            (file.source_id, file.rel_path),
        ).fetchone()
        if row is None:
            not_indexed += 1
        else:
            total += row[0]
    return {"documents": len(files), "chunks_estimate": total, "not_indexed": not_indexed}
