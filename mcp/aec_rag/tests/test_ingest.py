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
from aec_rag.store import PendingFile, index_stats, pending_files, pending_ocr

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


# ───────────────────── Две скорости: слой, затем распознавание (3H.13–3H.15) ─────

SCAN = "[скан]"


def layer_parser(path):
    """Like :func:`fake_parser`, but a line reading ``[скан]`` is a page without
    a usable text layer — empty, and waiting for recognition."""
    lines = path.read_text(encoding="utf-8").splitlines()
    return ParsedDocument(
        doctype="pdf",
        markdown="\n\n".join(line for line in lines if line != SCAN),
        segments=tuple(
            ParsedSegment(locator={"page": number}, markdown="" if line == SCAN else line)
            for number, line in enumerate(lines, start=1)
        ),
        pending_pages=tuple(number for number, line in enumerate(lines, start=1) if line == SCAN),
    )


class Recognizer:
    """Reads «страница N распознана» off any page, and remembers what it was asked."""

    def __init__(self, stop_after: int | None = None) -> None:
        self.asked: list[int] = []
        self.stop_after = stop_after

    def __call__(self, path, pages):
        for page in pages:
            if self.stop_after is not None and len(self.asked) == self.stop_after:
                raise KeyboardInterrupt  # what «Остановить» looks like from inside
            self.asked.append(page)
            yield page, f"Страница {page} распознана: грунт суглинок."


def page_texts(conn):
    return [
        (row[0], row[1])
        for row in conn.execute(
            "SELECT json_extract(locator, '$.page'), text FROM chunks ORDER BY ordinal"
        )
    ]


@pytest.mark.anyio
async def test_the_text_layer_is_searchable_before_any_page_is_recognised(project):
    vault, source, conn = project
    add_scanned(conn, source, "ИГИ.pdf", f"Отчёт об изысканиях.\n{SCAN}\n{SCAN}")
    rag = await open_stub_index(vault)
    seen: list[Progress] = []

    def stop_before_recognition(progress):
        seen.append(progress)
        if progress.phase == "ocr":
            raise KeyboardInterrupt

    with pytest.raises(KeyboardInterrupt):
        await ingest(
            conn,
            rag,
            {"tasks": str(source)},
            parser=layer_parser,
            recognizer=Recognizer(),
            on_progress=stop_before_recognition,
        )

    assert page_texts(conn) == [(1, "Отчёт об изысканиях.")]
    assert pending_files(conn) == []
    assert [work.pages for work in pending_ocr(conn)] == [(2, 3)]
    file_event = next(event for event in seen if event.stage == "file")
    assert file_event.pages == 2
    assert index_stats(conn)["pages_pending"] == 2


@pytest.mark.anyio
async def test_recognised_pages_join_the_same_file_under_their_own_page(project):
    vault, source, conn = project
    add_scanned(conn, source, "ИГИ.pdf", f"Отчёт об изысканиях.\n{SCAN}\n{SCAN}")
    rag = await open_stub_index(vault)
    seen: list[Progress] = []

    report = await ingest(
        conn,
        rag,
        {"tasks": str(source)},
        parser=layer_parser,
        recognizer=Recognizer(),
        on_progress=seen.append,
    )

    assert report.pages_recognized == 2
    assert page_texts(conn) == [
        (1, "Отчёт об изысканиях."),
        (2, "Страница 2 распознана: грунт суглинок."),
        (3, "Страница 3 распознана: грунт суглинок."),
    ]
    assert pending_ocr(conn) == []
    assert conn.execute("SELECT chunk_count FROM ingested_files").fetchone()[0] == 3
    pages = [(e.done, e.total, e.page, e.pages) for e in seen if e.stage == "page"]
    assert pages == [(1, 1, 1, 2), (1, 1, 2, 2)]
    assert all(e.phase == "ocr" for e in seen if e.stage == "page")


@pytest.mark.anyio
async def test_a_stopped_run_resumes_from_the_first_page_not_done(project):
    vault, source, conn = project
    add_scanned(conn, source, "ИГИ.pdf", f"Отчёт.\n{SCAN}\n{SCAN}\n{SCAN}")
    rag = await open_stub_index(vault)

    with pytest.raises(KeyboardInterrupt):
        await ingest(
            conn,
            rag,
            {"tasks": str(source)},
            parser=layer_parser,
            recognizer=Recognizer(stop_after=1),
        )

    again = Recognizer()
    report = await ingest(conn, rag, {"tasks": str(source)}, parser=layer_parser, recognizer=again)

    assert report.files_total == 0
    assert again.asked == [3, 4]
    assert [page for page, _ in page_texts(conn)] == [1, 2, 3, 4]


@pytest.mark.anyio
async def test_a_full_re_index_does_not_recognise_a_page_twice(project):
    """«Перестроить индекс» for another embedding model re-embeds everything —
    it must not pay for recognition again while the file is unchanged."""
    vault, source, conn = project
    add_scanned(conn, source, "ИГИ.pdf", f"Отчёт.\n{SCAN}")
    rag = await open_stub_index(vault)
    await ingest(conn, rag, {"tasks": str(source)}, parser=layer_parser, recognizer=Recognizer())

    again = Recognizer()
    report = await ingest(
        conn, rag, {"tasks": str(source)}, mode="full", parser=layer_parser, recognizer=again
    )

    assert report.files_ingested == 1
    assert again.asked == []
    assert page_texts(conn) == [(1, "Отчёт."), (2, "Страница 2 распознана: грунт суглинок.")]


@pytest.mark.anyio
async def test_a_changed_file_is_recognised_again(project):
    vault, source, conn = project
    add_scanned(conn, source, "ИГИ.pdf", f"Отчёт.\n{SCAN}")
    rag = await open_stub_index(vault)
    await ingest(conn, rag, {"tasks": str(source)}, parser=layer_parser, recognizer=Recognizer())

    add_scanned(conn, source, "ИГИ.pdf", f"Отчёт, редакция 2.\n{SCAN}")
    again = Recognizer()
    await ingest(conn, rag, {"tasks": str(source)}, parser=layer_parser, recognizer=again)

    assert again.asked == [2]
    assert [text for _, text in page_texts(conn)][0] == "Отчёт, редакция 2."


@pytest.mark.anyio
async def test_a_page_that_fails_is_reported_and_the_rest_go_on(project):
    vault, source, conn = project
    add_scanned(conn, source, "ИГИ.pdf", f"Отчёт.\n{SCAN}\n{SCAN}")
    rag = await open_stub_index(vault)

    def recognizer(path, pages):
        for page in pages:
            if page == 2:
                yield page, ParseError("страница 2 не распознана: битая картинка")
            else:
                yield page, f"Страница {page} распознана."

    report = await ingest(
        conn, rag, {"tasks": str(source)}, parser=layer_parser, recognizer=recognizer
    )

    assert report.pages_failed == 1
    assert report.pages_recognized == 1
    assert [page for page, _ in page_texts(conn)] == [1, 3]
    assert pending_ocr(conn) == []


@pytest.mark.anyio
async def test_a_narrowed_run_recognises_only_its_own_files(project):
    vault, source, conn = project
    add_scanned(conn, source, "ИГИ/1.pdf", f"Отчёт 1.\n{SCAN}")
    add_scanned(conn, source, "КР/2.pdf", f"Отчёт 2.\n{SCAN}")
    rag = await open_stub_index(vault)
    recognizer = Recognizer()

    await ingest(
        conn,
        rag,
        {"tasks": str(source)},
        rel_paths=["ИГИ/"],
        parser=layer_parser,
        recognizer=recognizer,
    )

    assert recognizer.asked == [2]
    rows = conn.execute("SELECT DISTINCT rel_path FROM chunks").fetchall()
    assert [row[0] for row in rows] == ["ИГИ/1.pdf"]


@pytest.mark.anyio
async def test_a_stop_request_ends_the_run_between_pages_and_keeps_what_is_done(project):
    vault, source, conn = project
    add_scanned(conn, source, "ИГИ.pdf", f"Отчёт.\n{SCAN}\n{SCAN}\n{SCAN}")
    rag = await open_stub_index(vault)
    recognizer = Recognizer()
    seen: list[Progress] = []

    report = await ingest(
        conn,
        rag,
        {"tasks": str(source)},
        parser=layer_parser,
        recognizer=recognizer,
        on_progress=seen.append,
        should_stop=lambda: len(recognizer.asked) >= 1,
    )

    assert report.stopped
    assert recognizer.asked == [2]
    assert seen[-1].stage == "stopped"
    assert [work.pages for work in pending_ocr(conn)] == [(3, 4)]


@pytest.mark.anyio
async def test_a_stop_request_before_a_file_leaves_it_for_the_next_run(project):
    vault, source, conn = project
    add_scanned(conn, source, "1.pdf")
    add_scanned(conn, source, "2.pdf")
    rag = await open_stub_index(vault)
    seen: list[Progress] = []

    report = await ingest(
        conn,
        rag,
        {"tasks": str(source)},
        parser=fake_parser,
        on_progress=seen.append,
        should_stop=lambda: any(event.stage == "file" for event in seen),
    )

    assert report.stopped
    assert report.files_ingested == 1
    assert [file.rel_path for file in pending_files(conn)] == ["2.pdf"]


@pytest.mark.anyio
async def test_a_narrowed_folder_does_not_pull_in_its_namesake(project):
    vault, source, conn = project
    add_scanned(conn, source, "ЭОМ/задание.pdf")
    add_scanned(conn, source, "ЭОМ-2/задание.pdf")
    rag = await open_stub_index(vault)

    report = await ingest(conn, rag, {"tasks": str(source)}, rel_paths=["ЭОМ"], parser=fake_parser)

    assert report.files_total == 1
    assert [file.rel_path for file in pending_files(conn)] == ["ЭОМ-2/задание.pdf"]


# ───────────────────── Ошибки кодом и таблица file_errors (3J.7) ─────


def file_errors(conn):
    return [
        tuple(row)
        for row in conn.execute(
            "SELECT rel_path, stage, code, detail FROM file_errors ORDER BY rel_path, stage"
        )
    ]


class _ProviderRefusal(Exception):
    """Shaped like an openai.BadRequestError — not one of the four types the
    loop used to catch."""

    status_code = 400


@pytest.mark.anyio
async def test_a_failed_file_leaves_its_reason_as_a_code_and_success_clears_it(project):
    vault, source, conn = project
    add_scanned(conn, source, "битое.pdf")
    rag = await open_stub_index(vault)

    def broken(path):
        raise ParseError("не удалось разобрать")

    report = await ingest(conn, rag, {"tasks": str(source)}, parser=broken)

    assert report.errors[0]["code"] == "parse_failed"
    assert file_errors(conn) == [("битое.pdf", "index", "parse_failed", "не удалось разобрать")]

    await ingest(conn, rag, {"tasks": str(source)}, parser=fake_parser)
    assert file_errors(conn) == []


@pytest.mark.anyio
async def test_a_provider_refusal_costs_one_file_not_the_run(project, monkeypatch):
    """D-195 class: Gemini's 400 «Please pass a valid API key» used to escape the
    per-file guard and end the run with a traceback."""
    vault, source, conn = project
    add_scanned(conn, source, "а.pdf")
    add_scanned(conn, source, "б.pdf", "Категория вторая.")
    rag = await open_stub_index(vault)

    import aec_rag.ingest as ingest_module

    real_insert = ingest_module.insert_document

    async def refusing_insert(rag, *, rel_path, **kwargs):
        if rel_path == "а.pdf":
            raise _ProviderRefusal("API key not valid. Please pass a valid API key.")
        return await real_insert(rag, rel_path=rel_path, **kwargs)

    monkeypatch.setattr(ingest_module, "insert_document", refusing_insert)
    report = await ingest(conn, rag, {"tasks": str(source)}, parser=fake_parser)

    assert report.files_ingested == 1
    assert report.files_failed == 1
    assert [row[:3] for row in file_errors(conn)] == [("а.pdf", "index", "provider_key")]


@pytest.mark.anyio
async def test_skipped_files_say_why_as_a_code(project):
    vault, source, conn = project
    add_scanned(conn, source, "план.dwg")
    add_scanned(conn, source, "задание.pdf")
    rag = await open_stub_index(vault)
    seen: list[Progress] = []

    await ingest(conn, rag, {}, parser=fake_parser, on_progress=seen.append)
    await ingest(conn, rag, {"tasks": str(source)}, parser=fake_parser, on_progress=seen.append)

    codes = {(p.rel_path, p.stage, p.code) for p in seen if p.stage == "skipped"}
    assert ("задание.pdf", "skipped", "source_detached") in codes
    assert ("план.dwg", "skipped", "unsupported") in codes


@pytest.mark.anyio
async def test_a_graph_failure_is_recorded_under_the_graph_stage(project, monkeypatch):
    from aec_rag.graph_scope import add_documents_to_graph

    vault, source, conn = project
    sha = add_scanned(conn, source, "задание.pdf")
    rag = await open_stub_index(vault)
    await ingest(conn, rag, {"tasks": str(source)}, parser=fake_parser)

    import aec_rag.lightrag_bridge as bridge

    async def limited(*args, **kwargs):
        raise RuntimeError("429 RESOURCE_EXHAUSTED")

    monkeypatch.setattr(bridge, "insert_document", limited)
    file = PendingFile("tasks", "задание.pdf", sha)
    missing = PendingFile("tasks", "нет.pdf", "x")
    report = await add_documents_to_graph(conn, rag, [file, missing])

    assert [error["code"] for error in report["errors"]] == ["provider_limit", "not_indexed"]
    assert [row[:3] for row in file_errors(conn)] == [
        ("задание.pdf", "graph", "provider_limit"),
        ("нет.pdf", "graph", "not_indexed"),
    ]
