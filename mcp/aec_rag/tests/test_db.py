"""Tests for the index.db schema (task 1.13)."""

from __future__ import annotations

from aec_rag.db import open_index


def test_open_index_is_idempotent(tmp_path):
    path = tmp_path / "index.db"
    open_index(path)
    conn = open_index(path)  # second open against the same file must not raise

    assert conn.execute("SELECT count(*) FROM files").fetchone()[0] == 0


def test_files_fts_virtual_table_is_queryable(tmp_path):
    """FTS5 guard: fails loudly now if this SQLite build lacks FTS5, rather
    than surfacing only in task 2.9 when files_fts starts being populated.
    """
    conn = open_index(tmp_path / "index.db")

    conn.execute("INSERT INTO files_fts (rowid, content) VALUES (1, 'hello world')")
    row = conn.execute("SELECT rowid FROM files_fts WHERE files_fts MATCH 'hello'").fetchone()

    assert row == (1,)
