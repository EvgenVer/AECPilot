"""Schema for ``index.db`` (lives at ``<vault>/.aecpilot/index.db``).

See specs/workspace-sources.md (Data schemas) for the contract: a ``files``
table tracking every scanned file per source, plus a ``files_fts`` virtual
table — a stub in this task, populated with extracted text in task 2.9.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

_SCHEMA = """
CREATE TABLE IF NOT EXISTS files (
    source_id TEXT NOT NULL,
    rel_path TEXT NOT NULL,
    size INTEGER,
    mtime REAL,
    sha256 TEXT,
    status TEXT NOT NULL CHECK (status IN ('ok', 'changed', 'deleted', 'detached')),
    skip_reason TEXT,
    indexed_at TEXT NOT NULL,
    UNIQUE (source_id, rel_path)
);

CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(content);

-- One row per chunk produced by aec_rag.chunk (task 2.9). `id` is deliberately
-- the rowid: `files_fts` is keyed by it, so the full-text row and the chunk it
-- belongs to are joined without a second key and without changing the FTS
-- table's declared shape.
CREATE TABLE IF NOT EXISTS chunks (
    id INTEGER PRIMARY KEY,
    chunk_id TEXT NOT NULL UNIQUE,
    source_id TEXT NOT NULL,
    rel_path TEXT NOT NULL,
    ordinal INTEGER NOT NULL,
    locator TEXT NOT NULL,
    is_table INTEGER NOT NULL,
    text TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS chunks_by_file ON chunks (source_id, rel_path);

-- What ingest has actually consumed, kept apart from `files` on purpose: that
-- table is the scanner's view of the disk, this one is the index's view of
-- itself, and the difference between the two sha256 values is exactly the
-- answer to "what still needs re-ingesting".
CREATE TABLE IF NOT EXISTS ingested_files (
    source_id TEXT NOT NULL,
    rel_path TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    chunk_count INTEGER NOT NULL,
    ingested_at TEXT NOT NULL,
    UNIQUE (source_id, rel_path)
);

-- Which documents are in the knowledge graph, at which content (task 2.10b).
-- Index state, not project configuration: the *choice* of folders and files
-- lives in project.json and survives re-indexing, this table dies with the
-- index. The difference between the two is what «new files appeared in a
-- marked folder» means — see aec_rag.graph_scope.
CREATE TABLE IF NOT EXISTS graph_documents (
    source_id TEXT NOT NULL,
    rel_path TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    chunk_count INTEGER NOT NULL,
    added_at TEXT NOT NULL,
    UNIQUE (source_id, rel_path)
);
"""


def open_index(path: Path | str) -> sqlite3.Connection:
    """Open (creating if needed) the index.db at ``path``, ensuring its schema.

    Idempotent: safe to call repeatedly against the same path, including
    across separate connections (``CREATE TABLE/VIRTUAL TABLE IF NOT
    EXISTS``).
    """
    # `check_same_thread=False` because mcp 2.0 runs a SYNC tool body on a worker
    # thread while an ASYNC one stays on the event loop (measured, task 3.B0б:
    # sync -> a pool thread, async -> the loop thread). The same connection is
    # therefore touched from more than one thread, and sqlite3's default would
    # refuse the second one. Safe here because of what the two kinds do: every
    # writer of this database lives in an async tool body (`rag_ingest`,
    # `rag_graph_add`, and `ingest`/`add_documents_to_graph` under them), so
    # writes stay serialized by the single-threaded loop; the sync bodies only
    # read. On mcp 1.x every body ran on the loop and this never came up.
    conn = sqlite3.connect(str(path), check_same_thread=False)
    conn.executescript(_SCHEMA)
    conn.commit()
    return conn
