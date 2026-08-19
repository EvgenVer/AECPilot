"""Tests for tier-1 ingest (task 2.10).

The parser is injected everywhere below: Docling's models take a dozen seconds
to load and this task is about the bookkeeping around parsing, not about
parsing. The parser itself is covered by test_parse.py on real fixtures.

The LLM function asserts on call. That is the assertion for «tier 1 never calls
a model» (SPECIFICATION UR24) — the one property that makes indexing everything
affordable.
"""

from __future__ import annotations

import hashlib

import numpy as np
import pytest
from aec_rag.db import open_index as open_db
from aec_rag.ingest import Progress, ingest, resolve_path
from aec_rag.parse import ParsedDocument, ParsedSegment, ParseError
from aec_rag.rag_index import RagSettings, open_index
from aec_rag.store import PendingFile, pending_files

DIM = 32


def _vector(text: str) -> np.ndarray:
    vector = np.zeros(DIM, dtype=np.float32)
    for word in text.lower().split():
        vector[hashlib.sha256(word.encode()).digest()[0] % DIM] += 1.0
    norm = float(np.linalg.norm(vector))
    return vector / norm if norm else vector


def word_embedding():
    from lightrag.utils import EmbeddingFunc

    async def embed(texts, **kwargs):
        return np.array([_vector(text) for text in texts], dtype=np.float32)

    return EmbeddingFunc(embedding_dim=DIM, max_token_size=8192, model_name="stub", func=embed)


async def forbidden_llm(prompt, system_prompt=None, **kwargs):
    raise AssertionError("уровень 1 не имеет права звать модель")


@pytest.fixture
def project(tmp_path):
    """A vault with one source directory and an index.db, ready to ingest."""
    import json

    vault = tmp_path / "vault"
    source = tmp_path / "источник"
    (vault / ".aecpilot").mkdir(parents=True)
    source.mkdir()
    (vault / ".aecpilot" / "project.json").write_text(
        json.dumps(
            {
                "schema_version": 1,
                "name": "тест",
                "sources": [{"id": "tasks", "root_path": str(source)}],
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    conn = open_db(vault / ".aecpilot" / "index.db")
    return vault, source, conn


async def open_stub_index(vault):
    settings = RagSettings(embedding_model="text-embedding-3-large", embedding_dim=DIM)
    return await open_index(
        vault, settings, embedding_func=word_embedding(), llm_func=forbidden_llm
    )


def add_scanned(conn, source, rel_path, text="Установленная мощность 250 кВт.", status="ok"):
    path = source / rel_path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    sha = hashlib.sha256(text.encode()).hexdigest()
    conn.execute(
        "INSERT INTO files (source_id, rel_path, size, mtime, sha256, status, indexed_at) "
        "VALUES ('tasks', ?, 1, 1.0, ?, ?, '2026-08-15T00:00:00Z') "
        "ON CONFLICT (source_id, rel_path) DO UPDATE SET sha256 = excluded.sha256, "
        "status = excluded.status",
        (rel_path, sha, status),
    )
    conn.commit()
    return sha


def fake_parser(path):
    """One segment per line, the page number being the line number."""
    lines = path.read_text(encoding="utf-8").splitlines()
    return ParsedDocument(
        doctype="pdf",
        markdown="\n\n".join(lines),
        segments=tuple(
            ParsedSegment(locator={"page": number}, markdown=line)
            for number, line in enumerate(lines, start=1)
        ),
    )


@pytest.mark.anyio
async def test_a_scanned_file_becomes_chunks_with_their_page(project):
    vault, source, conn = project
    add_scanned(conn, source, "ЭОМ/задание.pdf", "Мощность 250 кВт.\nКатегория вторая.")
    rag = await open_stub_index(vault)

    report = await ingest(conn, rag, {"tasks": str(source)}, parser=fake_parser)

    assert report.files_ingested == 1
    assert report.chunks == 2
    rows = conn.execute("SELECT locator FROM chunks ORDER BY ordinal").fetchall()
    assert [row[0] for row in rows] == ['{"page": 1}', '{"page": 2}']


@pytest.mark.anyio
async def test_a_second_run_has_nothing_to_do(project):
    vault, source, conn = project
    add_scanned(conn, source, "задание.pdf")
    rag = await open_stub_index(vault)

    first = await ingest(conn, rag, {"tasks": str(source)}, parser=fake_parser)
    second = await ingest(conn, rag, {"tasks": str(source)}, parser=fake_parser)

    assert first.files_ingested == 1
    assert second.files_total == 0
    assert pending_files(conn) == []


@pytest.mark.anyio
async def test_a_changed_file_is_re_read_and_the_old_text_is_gone(project):
    vault, source, conn = project
    add_scanned(conn, source, "задание.pdf", "Мощность 250 кВт.")
    rag = await open_stub_index(vault)
    await ingest(conn, rag, {"tasks": str(source)}, parser=fake_parser)

    add_scanned(conn, source, "задание.pdf", "Мощность 320 кВт.")
    report = await ingest(conn, rag, {"tasks": str(source)}, parser=fake_parser)

    texts = [row[0] for row in conn.execute("SELECT text FROM chunks")]
    assert report.files_ingested == 1
    assert texts == ["Мощность 320 кВт."]


@pytest.mark.anyio
async def test_full_mode_re_reads_files_that_did_not_change(project):
    vault, source, conn = project
    add_scanned(conn, source, "задание.pdf")
    rag = await open_stub_index(vault)
    await ingest(conn, rag, {"tasks": str(source)}, parser=fake_parser)

    report = await ingest(conn, rag, {"tasks": str(source)}, mode="full", parser=fake_parser)

    assert report.files_ingested == 1


@pytest.mark.anyio
async def test_one_broken_file_does_not_cost_the_others_their_index(project):
    """A folder of two hundred documents must not lose its index to one
    unreadable PDF — and the failure belongs in the report, not in a log.
    """
    vault, source, conn = project
    add_scanned(conn, source, "хорошее.pdf")
    add_scanned(conn, source, "битое.pdf")
    rag = await open_stub_index(vault)

    def parser(path):
        if path.name == "битое.pdf":
            raise ParseError("не удалось разобрать")
        return fake_parser(path)

    report = await ingest(conn, rag, {"tasks": str(source)}, parser=parser)

    assert report.files_ingested == 1
    assert report.files_failed == 1
    assert report.errors[0]["rel_path"] == "битое.pdf"


@pytest.mark.anyio
async def test_a_file_of_an_unindexable_format_is_skipped_not_failed(project):
    vault, source, conn = project
    add_scanned(conn, source, "план.dwg")
    rag = await open_stub_index(vault)

    report = await ingest(conn, rag, {"tasks": str(source)}, parser=fake_parser)

    assert report.files_skipped == 1
    assert report.files_failed == 0


@pytest.mark.anyio
async def test_a_deleted_file_loses_its_chunks(project):
    """A deleted document must stop being quotable at once: citing a file the
    person cannot open is worse than one fewer answer.
    """
    vault, source, conn = project
    add_scanned(conn, source, "задание.pdf")
    rag = await open_stub_index(vault)
    await ingest(conn, rag, {"tasks": str(source)}, parser=fake_parser)

    conn.execute("UPDATE files SET status = 'deleted' WHERE rel_path = 'задание.pdf'")
    conn.commit()
    report = await ingest(conn, rag, {"tasks": str(source)}, parser=fake_parser)

    assert report.removed_chunks == 1
    assert conn.execute("SELECT count(*) FROM chunks").fetchone()[0] == 0


@pytest.mark.anyio
async def test_progress_reports_every_file_and_finishes(project):
    vault, source, conn = project
    add_scanned(conn, source, "первое.pdf")
    add_scanned(conn, source, "второе.pdf")
    rag = await open_stub_index(vault)
    seen: list[Progress] = []

    await ingest(conn, rag, {"tasks": str(source)}, parser=fake_parser, on_progress=seen.append)

    stages = [event.stage for event in seen]
    assert stages[0] == "started"
    assert stages[-1] == "finished"
    assert [event.rel_path for event in seen if event.stage == "file"] == [
        "второе.pdf",
        "первое.pdf",
    ]


@pytest.mark.anyio
async def test_narrowing_by_path_indexes_only_that_folder(project):
    vault, source, conn = project
    add_scanned(conn, source, "ЭОМ/задание.pdf")
    add_scanned(conn, source, "ОВ/задание.pdf")
    rag = await open_stub_index(vault)

    report = await ingest(conn, rag, {"tasks": str(source)}, rel_paths=["ЭОМ/"], parser=fake_parser)

    assert report.files_ingested == 1
    assert [row[0] for row in conn.execute("SELECT DISTINCT rel_path FROM chunks")] == [
        "ЭОМ/задание.pdf"
    ]


@pytest.mark.anyio
async def test_a_document_with_no_text_is_consumed_rather_than_retried_forever(project):
    vault, source, conn = project
    add_scanned(conn, source, "пустое.pdf", "")
    rag = await open_stub_index(vault)

    report = await ingest(
        conn,
        rag,
        {"tasks": str(source)},
        parser=lambda path: ParsedDocument(doctype="pdf", markdown="", segments=()),
    )

    assert report.files_ingested == 1
    assert report.chunks == 0
    assert pending_files(conn) == []


@pytest.mark.anyio
async def test_a_failure_after_the_rows_leaves_the_file_pending(project, monkeypatch):
    """Rows without vectors must not read as «done»: the file has to come back
    on the next incremental run.
    """
    vault, source, conn = project
    add_scanned(conn, source, "задание.pdf")
    rag = await open_stub_index(vault)

    import aec_rag.ingest as ingest_module

    async def failing_insert(*args, **kwargs):
        raise RuntimeError("векторное хранилище недоступно")

    monkeypatch.setattr(ingest_module, "insert_document", failing_insert)
    report = await ingest(conn, rag, {"tasks": str(source)}, parser=fake_parser)

    assert report.files_failed == 1
    assert [file.rel_path for file in pending_files(conn)] == ["задание.pdf"]


def test_a_file_of_a_source_that_is_gone_resolves_to_nothing():
    assert resolve_path({}, PendingFile("tasks", "задание.pdf", "sha")) is None
