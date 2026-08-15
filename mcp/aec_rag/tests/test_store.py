"""Tests for chunk storage and incremental ingest bookkeeping (task 2.9)."""

from __future__ import annotations

from aec_rag.chunk import Chunk
from aec_rag.db import open_index
from aec_rag.store import (
    drop_file_chunks,
    get_chunks,
    index_stats,
    pending_files,
    prune_removed,
    search_text,
    store_chunks,
)


def make_index(tmp_path):
    return open_index(tmp_path / "index.db")


def add_file(conn, source_id="src", rel_path="задание.pdf", sha256="aaa", status="ok"):
    conn.execute(
        "INSERT INTO files (source_id, rel_path, size, mtime, sha256, status, indexed_at) "
        "VALUES (?, ?, 1, 1.0, ?, ?, '2026-08-14T00:00:00Z')",
        (source_id, rel_path, sha256, status),
    )
    conn.commit()


CHUNKS = [
    Chunk(text="Установленная мощность 125 кВт.", locator={"page": 12}),
    Chunk(text="| Кабель | Сечение |\n| ВВГнг | 3х50 |", locator={"page": 13}, is_table=True),
]


def test_a_scanned_file_is_pending_until_it_is_ingested(tmp_path):
    conn = make_index(tmp_path)
    add_file(conn)

    assert [(p.rel_path, p.sha256) for p in pending_files(conn)] == [("задание.pdf", "aaa")]

    store_chunks(conn, "src", "задание.pdf", "aaa", CHUNKS)

    assert pending_files(conn) == []


def test_re_ingesting_unchanged_content_does_not_duplicate_chunks(tmp_path):
    conn = make_index(tmp_path)
    add_file(conn)

    first = store_chunks(conn, "src", "задание.pdf", "aaa", CHUNKS)
    second = store_chunks(conn, "src", "задание.pdf", "aaa", CHUNKS)

    assert first == second
    assert conn.execute("SELECT count(*) FROM chunks").fetchone()[0] == 2
    assert conn.execute("SELECT count(*) FROM files_fts").fetchone()[0] == 2


def test_changed_content_replaces_the_old_chunks_rather_than_adding_to_them(tmp_path):
    """An edited document must stop being quotable in its old wording — a left
    behind paragraph would be retrieved and cited as if it still existed.
    """
    conn = make_index(tmp_path)
    add_file(conn)
    store_chunks(conn, "src", "задание.pdf", "aaa", CHUNKS)

    conn.execute("UPDATE files SET sha256 = 'bbb', status = 'changed'")
    conn.commit()
    assert [p.sha256 for p in pending_files(conn)] == ["bbb"]

    store_chunks(
        conn,
        "src",
        "задание.pdf",
        "bbb",
        [Chunk(text="Установленная мощность 160 кВт.", locator={"page": 12})],
    )

    assert conn.execute("SELECT count(*) FROM chunks").fetchone()[0] == 1
    assert search_text(conn, "125") == []
    assert [c.text for c in search_text(conn, "160")] == ["Установленная мощность 160 кВт."]


def test_full_text_search_finds_a_russian_phrase_with_its_locator(tmp_path):
    conn = make_index(tmp_path)
    add_file(conn)
    store_chunks(conn, "src", "задание.pdf", "aaa", CHUNKS)

    hits = search_text(conn, "мощность")

    assert len(hits) == 1
    assert hits[0].locator == {"page": 12}
    assert hits[0].is_table is False


def test_a_table_chunk_keeps_its_flag_and_locator(tmp_path):
    conn = make_index(tmp_path)
    add_file(conn)
    ids = store_chunks(conn, "src", "задание.pdf", "aaa", CHUNKS)

    stored = get_chunks(conn, ids)

    assert stored[ids[1]].is_table is True
    assert stored[ids[1]].locator == {"page": 13}


def test_chunks_of_a_deleted_file_stop_being_findable(tmp_path):
    conn = make_index(tmp_path)
    add_file(conn)
    store_chunks(conn, "src", "задание.pdf", "aaa", CHUNKS)

    conn.execute("UPDATE files SET status = 'deleted'")
    conn.commit()
    removed = prune_removed(conn)

    assert removed == 2
    assert search_text(conn, "мощность") == []
    assert pending_files(conn) == []


def test_chunks_of_a_detached_source_stop_being_findable(tmp_path):
    conn = make_index(tmp_path)
    add_file(conn)
    store_chunks(conn, "src", "задание.pdf", "aaa", CHUNKS)

    conn.execute("UPDATE files SET status = 'detached'")
    conn.commit()
    prune_removed(conn)

    assert search_text(conn, "мощность") == []


def test_dropping_one_file_leaves_the_others_alone(tmp_path):
    conn = make_index(tmp_path)
    add_file(conn, rel_path="a.pdf")
    add_file(conn, rel_path="b.pdf")
    store_chunks(conn, "src", "a.pdf", "aaa", CHUNKS)
    store_chunks(conn, "src", "b.pdf", "aaa", CHUNKS)

    drop_file_chunks(conn, "src", "a.pdf")
    conn.commit()

    assert {c.rel_path for c in search_text(conn, "мощность")} == {"b.pdf"}


def test_stats_report_what_is_indexed_and_what_is_stale(tmp_path):
    conn = make_index(tmp_path)
    add_file(conn, rel_path="a.pdf")
    add_file(conn, rel_path="b.pdf")
    store_chunks(conn, "src", "a.pdf", "aaa", CHUNKS)

    stats = index_stats(conn)

    assert stats["files_total"] == 2
    assert stats["files_indexed"] == 1
    assert stats["chunks_total"] == 2
    assert stats["stale_count"] == 1
