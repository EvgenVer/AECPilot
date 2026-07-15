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
"""


def open_index(path: Path | str) -> sqlite3.Connection:
    """Open (creating if needed) the index.db at ``path``, ensuring its schema.

    Idempotent: safe to call repeatedly against the same path, including
    across separate connections (``CREATE TABLE/VIRTUAL TABLE IF NOT
    EXISTS``).
    """
    conn = sqlite3.connect(str(path))
    conn.executescript(_SCHEMA)
    conn.commit()
    return conn
