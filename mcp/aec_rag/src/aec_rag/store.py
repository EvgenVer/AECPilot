"""Chunk storage in ``index.db``: what has been ingested and what still needs it
(task 2.9).

Incrementality rests on one comparison. ``files.sha256`` is what the scanner
last saw on disk; ``ingested_files.sha256`` is what ingest last consumed. A file
needs work exactly when the two differ — no timestamps, no guessing, and a run
interrupted halfway simply picks up where it stopped, because a file is only
marked ingested after its chunks are committed.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime

from aec_rag.chunk import Chunk

# Statuses whose files are index material. `deleted` and `detached` are not:
# their chunks are removed instead (see `prune_removed`).
_LIVE_STATUSES = ("ok", "changed")


@dataclass(frozen=True)
class PendingFile:
    source_id: str
    rel_path: str
    sha256: str


@dataclass(frozen=True)
class StoredChunk:
    chunk_id: str
    source_id: str
    rel_path: str
    locator: dict[str, int | str]
    is_table: bool
    text: str


def chunk_id(source_id: str, rel_path: str, ordinal: int, text: str) -> str:
    """A chunk's identity: where it came from plus what it says.

    Content is part of it on purpose — an edited paragraph becomes a different
    chunk rather than the same chunk with new contents, which is what keeps the
    vector store and this table from disagreeing about what a given id means.
    """
    digest = hashlib.sha256(
        f"{source_id}\x00{rel_path}\x00{ordinal}\x00{text}".encode()
    ).hexdigest()
    return f"chunk-{digest[:32]}"


def _iso_now() -> str:
    return datetime.now(UTC).isoformat()


def pending_files(conn: sqlite3.Connection) -> list[PendingFile]:
    """Files the scanner has seen whose current content is not in the index yet."""
    placeholders = ",".join("?" for _ in _LIVE_STATUSES)
    rows = conn.execute(
        f"""
        SELECT f.source_id, f.rel_path, f.sha256
        FROM files AS f
        LEFT JOIN ingested_files AS i
            ON i.source_id = f.source_id AND i.rel_path = f.rel_path
        WHERE f.status IN ({placeholders})
          AND f.sha256 IS NOT NULL
          AND (i.sha256 IS NULL OR i.sha256 != f.sha256)
        ORDER BY f.source_id, f.rel_path
        """,
        _LIVE_STATUSES,
    ).fetchall()
    return [PendingFile(source_id, rel_path, sha256) for source_id, rel_path, sha256 in rows]


def drop_file_chunks(conn: sqlite3.Connection, source_id: str, rel_path: str) -> int:
    """Remove a file's chunks and their full-text rows. Returns how many went."""
    ids = [
        row[0]
        for row in conn.execute(
            "SELECT id FROM chunks WHERE source_id = ? AND rel_path = ?", (source_id, rel_path)
        )
    ]
    if ids:
        placeholders = ",".join("?" for _ in ids)
        conn.execute(f"DELETE FROM files_fts WHERE rowid IN ({placeholders})", ids)
        conn.execute(f"DELETE FROM chunks WHERE id IN ({placeholders})", ids)
    return len(ids)


def store_chunks(
    conn: sqlite3.Connection,
    source_id: str,
    rel_path: str,
    sha256: str,
    chunks: Sequence[Chunk],
) -> list[str]:
    """Replace a file's chunks with ``chunks`` and mark the file ingested.

    Replace, not append: re-ingesting an edited file must not leave the old
    paragraphs behind to be retrieved and cited as if they were still in the
    document. The whole thing is one transaction, so an interrupted run leaves
    the file looking un-ingested rather than half-ingested.
    """
    with conn:
        drop_file_chunks(conn, source_id, rel_path)
        ids: list[str] = []
        for ordinal, chunk in enumerate(chunks):
            identifier = chunk_id(source_id, rel_path, ordinal, chunk.text)
            cursor = conn.execute(
                """
                INSERT INTO chunks
                    (chunk_id, source_id, rel_path, ordinal, locator, is_table, text)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    identifier,
                    source_id,
                    rel_path,
                    ordinal,
                    json.dumps(chunk.locator, ensure_ascii=False),
                    int(chunk.is_table),
                    chunk.text,
                ),
            )
            conn.execute(
                "INSERT INTO files_fts (rowid, content) VALUES (?, ?)",
                (cursor.lastrowid, chunk.text),
            )
            ids.append(identifier)

        conn.execute(
            """
            INSERT INTO ingested_files (source_id, rel_path, sha256, chunk_count, ingested_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (source_id, rel_path) DO UPDATE SET
                sha256 = excluded.sha256,
                chunk_count = excluded.chunk_count,
                ingested_at = excluded.ingested_at
            """,
            (source_id, rel_path, sha256, len(chunks), _iso_now()),
        )
    return ids


def prune_removed(conn: sqlite3.Connection) -> int:
    """Drop chunks of files that are gone — deleted, detached, or no longer
    tracked at all. A deleted document must stop being quotable immediately;
    leaving its chunks in would have the agent cite a file the user cannot open.
    """
    rows = conn.execute(
        """
        SELECT DISTINCT c.source_id, c.rel_path
        FROM chunks AS c
        LEFT JOIN files AS f
            ON f.source_id = c.source_id AND f.rel_path = c.rel_path
        WHERE f.rel_path IS NULL OR f.status IN ('deleted', 'detached')
        """
    ).fetchall()
    removed = 0
    with conn:
        for source_id, rel_path in rows:
            removed += drop_file_chunks(conn, source_id, rel_path)
            conn.execute(
                "DELETE FROM ingested_files WHERE source_id = ? AND rel_path = ?",
                (source_id, rel_path),
            )
    return removed


def _row_to_chunk(row: Iterable) -> StoredChunk:
    chunk_identifier, source_id, rel_path, locator, is_table, text = row
    return StoredChunk(
        chunk_id=chunk_identifier,
        source_id=source_id,
        rel_path=rel_path,
        locator=json.loads(locator),
        is_table=bool(is_table),
        text=text,
    )


def get_chunks(conn: sqlite3.Connection, chunk_ids: Sequence[str]) -> dict[str, StoredChunk]:
    """Look chunks up by id — the join that puts a locator back on a search hit."""
    if not chunk_ids:
        return {}
    placeholders = ",".join("?" for _ in chunk_ids)
    rows = conn.execute(
        f"SELECT chunk_id, source_id, rel_path, locator, is_table, text "
        f"FROM chunks WHERE chunk_id IN ({placeholders})",
        list(chunk_ids),
    ).fetchall()
    return {row[0]: _row_to_chunk(row) for row in rows}


def search_text(conn: sqlite3.Connection, query: str, *, limit: int = 20) -> list[StoredChunk]:
    """Full-text search over the ingested chunks.

    FTS5's default tokenizer has no Russian stemming, so this finds the word as
    written — «нагрузка» does not match «нагрузки». That is the division of
    labour: exact wording, part numbers and designations come from here, meaning
    comes from the vector search.
    """
    rows = conn.execute(
        """
        SELECT c.chunk_id, c.source_id, c.rel_path, c.locator, c.is_table, c.text
        FROM files_fts
        JOIN chunks AS c ON c.id = files_fts.rowid
        WHERE files_fts MATCH ?
        ORDER BY bm25(files_fts)
        LIMIT ?
        """,
        (query, limit),
    ).fetchall()
    return [_row_to_chunk(row) for row in rows]


def index_stats(conn: sqlite3.Connection) -> dict[str, int]:
    """Counts behind `rag_status` (task 2.11) and the UI's index indicator."""
    placeholders = ",".join("?" for _ in _LIVE_STATUSES)
    files_total = conn.execute(
        f"SELECT count(*) FROM files WHERE status IN ({placeholders})", _LIVE_STATUSES
    ).fetchone()[0]
    files_indexed = conn.execute("SELECT count(*) FROM ingested_files").fetchone()[0]
    chunks_total = conn.execute("SELECT count(*) FROM chunks").fetchone()[0]
    return {
        "files_total": files_total,
        "files_indexed": files_indexed,
        "chunks_total": chunks_total,
        "stale_count": len(pending_files(conn)),
    }
