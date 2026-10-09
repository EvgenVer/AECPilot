"""Level-1 ingest: parse → chunk → `index.db` + vectors (task 2.10).

SPECIFICATION UR24 splits indexing in two. This is the first level and the one
that is always on: everything that got into the project is read, chunked and
made searchable, **without a single LLM call**. That is what makes indexing
everything affordable, and it covers every scenario in
specs/qa-over-sources.md except the overview ones.

The second level — the knowledge graph — is opt-in per folder or file and lives
in :mod:`aec_rag.graph_scope`.

What a run does, in order:

1. drops the chunks of files that are gone (deleted, or their source detached);
2. takes the files whose content on disk differs from what the index consumed —
   the one comparison incrementality rests on (see :mod:`aec_rag.store`);
3. parses, chunks and stores each of them, one transaction per file, reporting
   progress as it goes;
4. recognises, page by page, the PDF pages that had no usable text layer
   (task 3H.14) — the second of the two speeds. A file is searchable after step
   3; its scanned pages join it one by one, and a stopped run resumes from the
   first page not yet done.

A file that fails is recorded and the run continues. One unreadable PDF in a
folder of two hundred must not cost the other hundred and ninety-nine their
index — and the failure is in the report, not in a log nobody reads.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any

from aec_rag.chunk import chunk_document
from aec_rag.errors import OCR_FAILED, SOURCE_DETACHED, UNSUPPORTED, classify
from aec_rag.lightrag_bridge import IndexedChunk, delete_document, document_id, insert_document
from aec_rag.parse import (
    SUPPORTED_SUFFIXES,
    ParsedDocument,
    ParsedSegment,
    ParseError,
    parse_file,
    recognize_pages,
)
from aec_rag.store import (
    OcrWork,
    PendingFile,
    clear_file_error,
    finish_page,
    live_files,
    pending_files,
    pending_ocr,
    prune_removed,
    recognized_page_numbers,
    recognized_pages,
    record_file_error,
    set_pending_pages,
    store_chunks,
    store_page_chunks,
    unmark_ingested,
)

if TYPE_CHECKING:
    from lightrag import LightRAG


@dataclass(frozen=True)
class Progress:
    """One step of a run, as the UI and the agent see it.

    ``done``/``total`` count files of the current pass. ``phase`` names the
    pass: ``text`` — the text layer and every non-PDF format, ``ocr`` —
    recognition of scanned pages (task 3H.15). In the ``ocr`` pass ``page`` is
    how many of the file's ``pages`` waiting for recognition are done; in the
    ``text`` pass ``pages`` is how many of the file's pages were left for it.
    """

    stage: str
    done: int
    total: int
    source_id: str = ""
    rel_path: str = ""
    chunks: int = 0
    error: str = ""
    phase: str = "text"
    page: int = 0
    pages: int = 0
    # Why, as a code from aec_rag.errors (task 3J.7) — the app words it in the
    # interface language; ``error`` keeps the library's own text.
    code: str = ""

    def as_dict(self) -> dict[str, Any]:
        return {
            "stage": self.stage,
            "done": self.done,
            "total": self.total,
            "source_id": self.source_id,
            "rel_path": self.rel_path,
            "chunks": self.chunks,
            "error": self.error,
            "phase": self.phase,
            "page": self.page,
            "pages": self.pages,
            "code": self.code,
        }


@dataclass
class IngestReport:
    files_total: int = 0
    files_ingested: int = 0
    files_skipped: int = 0
    files_failed: int = 0
    chunks: int = 0
    removed_chunks: int = 0
    pages_recognized: int = 0
    pages_failed: int = 0
    # The run was asked to stop and did, between two files or two pages
    # (task 3H.16). What it finished is stored; the next run continues.
    stopped: bool = False
    errors: list[dict[str, str]] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "files_total": self.files_total,
            "files_ingested": self.files_ingested,
            "files_skipped": self.files_skipped,
            "files_failed": self.files_failed,
            "chunks": self.chunks,
            "removed_chunks": self.removed_chunks,
            "pages_recognized": self.pages_recognized,
            "pages_failed": self.pages_failed,
            "stopped": self.stopped,
            "errors": self.errors,
        }


ProgressCallback = Callable[[Progress], None]
Parser = Callable[[Path], ParsedDocument]
# ``(path, pages)`` → ``(page, text or error)`` page by page — see
# :func:`aec_rag.parse.recognize_pages`. Injectable for the same reason as the
# parser: the tests check the bookkeeping, not the recognition model.
Recognizer = Callable[[Path, Sequence[int]], Iterable[tuple[int, "str | ParseError"]]]


def _noop(_: Progress) -> None:
    return None


def _never() -> bool:
    return False


def resolve_path(roots: dict[str, str], file: PendingFile) -> Path | None:
    """Absolute path of a scanned file, or ``None`` if its source is gone."""
    root = roots.get(file.source_id)
    return None if root is None else Path(root) / file.rel_path


async def ingest(
    conn: sqlite3.Connection,
    rag: LightRAG,
    roots: dict[str, str],
    *,
    mode: str = "incremental",
    source_ids: Sequence[str] | None = None,
    rel_paths: Sequence[str] | None = None,
    on_progress: ProgressCallback = _noop,
    parser: Parser | None = None,
    recognizer: Recognizer | None = None,
    max_chars: int | None = None,
    should_stop: Callable[[], bool] = _never,
) -> IngestReport:
    """Run a level-1 ingest over ``conn``'s scanned files.

    ``mode="full"`` re-reads every live file; ``"incremental"`` (the default)
    only the ones whose content changed since the index last consumed them.
    ``source_ids``/``rel_paths`` narrow the run further — that is how «index
    this folder» is expressed without inventing a second code path. The
    narrowing applies to both passes.

    ``parser`` and ``recognizer`` are injectable so tests do not have to load
    Docling's or RapidOCR's models to check the bookkeeping around them.

    ``should_stop`` is asked before every file and after every recognised page
    (task 3H.16). Stopping there, rather than being killed anywhere, is what
    keeps the vector store whole: a process ended in the middle of writing it
    leaves a half-written file the next run cannot open.
    """
    report = IngestReport()

    removed = prune_removed(conn)
    report.removed_chunks = removed
    if removed:
        on_progress(Progress(stage="pruned", done=removed, total=removed))

    def wanted(source_id: str, rel_path: str) -> bool:
        if source_ids is not None and source_id not in source_ids:
            return False
        return rel_paths is None or any(_under(rel_path, path) for path in rel_paths)

    candidates = live_files(conn) if mode == "full" else pending_files(conn)
    candidates = [file for file in candidates if wanted(file.source_id, file.rel_path)]

    report.files_total = len(candidates)
    on_progress(Progress(stage="started", done=0, total=report.files_total))

    parse = parser or parse_file
    for done, file in enumerate(candidates, start=1):
        if should_stop():
            report.stopped = True
            break
        path = resolve_path(roots, file)
        if path is None:
            report.files_skipped += 1
            _fail(
                report,
                on_progress,
                file,
                done,
                "источник не подключён",
                code=SOURCE_DETACHED,
                skipped=True,
            )
            continue
        if path.suffix.lower() not in SUPPORTED_SUFFIXES:
            report.files_skipped += 1
            on_progress(
                Progress(
                    stage="skipped",
                    done=done,
                    total=report.files_total,
                    source_id=file.source_id,
                    rel_path=file.rel_path,
                    code=UNSUPPORTED,
                )
            )
            continue

        # Task 3J.9: the text layer is written whole, at the end of the file. A
        # run ended by force while a file is being read loses that file's work,
        # and the app can only say which one if the start was announced.
        on_progress(
            Progress(
                stage="reading",
                done=done - 1,
                total=report.files_total,
                source_id=file.source_id,
                rel_path=file.rel_path,
            )
        )
        try:
            count, waiting = await ingest_one(
                conn, rag, file, path, parse=parse, max_chars=max_chars
            )
        # Any failure of ONE file — a provider refusal included (3J.7): before,
        # an `openai` error was none of the four types caught here and took the
        # whole run down with it, the other files never reached.
        except Exception as exc:  # noqa: BLE001
            code, detail = classify(exc)
            report.files_failed += 1
            record_file_error(
                conn, file.source_id, file.rel_path, file.sha256, "index", code, detail
            )
            _fail(report, on_progress, file, done, detail, code=code)
            continue

        clear_file_error(conn, file.source_id, file.rel_path, "index")

        report.files_ingested += 1
        report.chunks += count
        on_progress(
            Progress(
                stage="file",
                done=done,
                total=report.files_total,
                source_id=file.source_id,
                rel_path=file.rel_path,
                chunks=count,
                pages=waiting,
            )
        )

    work = [item for item in pending_ocr(conn) if wanted(item.source_id, item.rel_path)]
    if work and not report.stopped:
        await _recognize(
            conn, rag, roots, work, report, on_progress, recognizer, max_chars, should_stop
        )

    on_progress(
        Progress(
            stage="stopped" if report.stopped else "finished",
            done=report.files_ingested,
            total=report.files_total,
        )
    )
    return report


def _under(rel_path: str, path: str) -> bool:
    """Is the file ``rel_path`` the file ``path`` or inside the folder ``path``?
    By segments, so «ЭОМ» does not pull in «ЭОМ-2»; an empty ``path`` is the
    whole source."""
    folder = path.strip("/")
    return not folder or rel_path == folder or rel_path.startswith(f"{folder}/")


def _page_doc_rel_path(rel_path: str, page: int) -> str:
    """The name a recognised page is filed under in the vector store.

    A page is its own vector document: the file's document is already there
    after the first pass, and replacing it for every recognised page would pay
    for the embeddings of the whole file once per page. The file's chunks in
    ``index.db`` still carry the real ``rel_path`` — this name only keys the
    vectors.
    """
    return f"{rel_path}#p{page}"


async def _recognize(
    conn: sqlite3.Connection,
    rag: LightRAG,
    roots: dict[str, str],
    work: list[OcrWork],
    report: IngestReport,
    on_progress: ProgressCallback,
    recognizer: Recognizer | None,
    max_chars: int | None,
    should_stop: Callable[[], bool] = _never,
) -> None:
    """The second pass: recognise the waiting pages, one page at a time."""
    recognize = recognizer or recognize_pages
    total = len(work)
    on_progress(
        Progress(
            stage="started",
            done=0,
            total=total,
            phase="ocr",
            pages=sum(len(item.pages) for item in work),
        )
    )
    for done, item in enumerate(work, start=1):
        path = resolve_path(roots, PendingFile(item.source_id, item.rel_path, item.sha256))
        if path is None or not path.is_file():
            continue
        for finished, (page, result) in enumerate(recognize(path, item.pages), start=1):
            base = dict(
                done=done,
                total=total,
                source_id=item.source_id,
                rel_path=item.rel_path,
                phase="ocr",
                page=finished,
                pages=len(item.pages),
            )
            if isinstance(result, Exception):
                finish_page(
                    conn, item.source_id, item.rel_path, item.sha256, page, error=str(result)
                )
                report.pages_failed += 1
                on_progress(Progress(stage="failed", error=str(result), code=OCR_FAILED, **base))
                continue

            segment = ParsedSegment(locator={"page": page}, markdown=result)
            parsed = ParsedDocument(doctype="pdf", markdown=result, segments=(segment,))
            chunks = (
                chunk_document(parsed)
                if max_chars is None
                else chunk_document(parsed, max_chars=max_chars)
            )
            ids = store_page_chunks(conn, item.source_id, item.rel_path, page, chunks)
            if chunks:
                await insert_document(
                    rag,
                    source_id=item.source_id,
                    rel_path=_page_doc_rel_path(item.rel_path, page),
                    chunks=[
                        IndexedChunk(chunk_id=identifier, text=chunk.text)
                        for identifier, chunk in zip(ids, chunks, strict=True)
                    ],
                    build_graph=False,
                )
            finish_page(conn, item.source_id, item.rel_path, item.sha256, page, text=result)
            report.pages_recognized += 1
            report.chunks += len(chunks)
            on_progress(Progress(stage="page", chunks=len(chunks), **base))
            if should_stop():
                report.stopped = True
                return


async def ingest_one(
    conn: sqlite3.Connection,
    rag: LightRAG,
    file: PendingFile,
    path: Path,
    *,
    parse: Parser = parse_file,
    max_chars: int | None = None,
) -> tuple[int, int]:
    """Parse, chunk and index one file — the first pass.

    Returns how many chunks it produced and how many of its PDF pages wait for
    recognition. A page recognised before, at this same content, is folded in
    from ``index.db`` instead of waiting again: a full re-index or a rebuild for
    another embedding model costs embeddings, not another recognition.

    ``index.db`` is written first — it holds the locators, without which a
    vector is unciteable — and the vector store second. A failure in between
    un-marks the file, so an incremental run picks it up again instead of
    treating «rows present, vectors missing» as done forever.
    """
    parsed = parse(path)
    waiting: list[int] = []
    if parsed.doctype == "pdf":
        known = recognized_pages(conn, file.source_id, file.rel_path, file.sha256)
        waiting = [page for page in parsed.pending_pages if page not in known]
        if known:
            parsed = ParsedDocument(
                doctype=parsed.doctype,
                markdown=parsed.markdown,
                segments=tuple(
                    ParsedSegment(locator=segment.locator, markdown=known[number])
                    if (number := int(segment.locator.get("page", 0))) in known
                    else segment
                    for segment in parsed.segments
                ),
                pending_pages=tuple(waiting),
            )
        # Every recognised page had a vector document of its own. From here
        # its text is part of the file's document (same content) or obsolete
        # (changed content) — either way that page document goes.
        for page in recognized_page_numbers(conn, file.source_id, file.rel_path):
            await delete_document(
                rag, document_id(file.source_id, _page_doc_rel_path(file.rel_path, page))
            )
    chunks = (
        chunk_document(parsed) if max_chars is None else chunk_document(parsed, max_chars=max_chars)
    )
    doc_id = document_id(file.source_id, file.rel_path)

    if not chunks:
        # A document with no extractable text still counts as consumed: without
        # this its sha256 stays pending and every run re-reads it forever.
        store_chunks(conn, file.source_id, file.rel_path, file.sha256, [])
        if parsed.doctype == "pdf":
            set_pending_pages(conn, file.source_id, file.rel_path, file.sha256, waiting)
        await delete_document(rag, doc_id)
        return 0, len(waiting)

    ids = store_chunks(conn, file.source_id, file.rel_path, file.sha256, chunks)
    if parsed.doctype == "pdf":
        set_pending_pages(conn, file.source_id, file.rel_path, file.sha256, waiting)
    try:
        await insert_document(
            rag,
            source_id=file.source_id,
            rel_path=file.rel_path,
            chunks=[
                IndexedChunk(chunk_id=identifier, text=chunk.text)
                for identifier, chunk in zip(ids, chunks, strict=True)
            ],
            build_graph=False,
        )
    except Exception:
        unmark_ingested(conn, file.source_id, file.rel_path)
        raise
    return len(chunks), len(waiting)


def _fail(
    report: IngestReport,
    on_progress: ProgressCallback,
    file: PendingFile,
    done: int,
    message: str,
    *,
    code: str,
    skipped: bool = False,
) -> None:
    report.errors.append(
        {"source_id": file.source_id, "rel_path": file.rel_path, "error": message, "code": code}
    )
    on_progress(
        Progress(
            stage="skipped" if skipped else "failed",
            done=done,
            total=report.files_total,
            source_id=file.source_id,
            rel_path=file.rel_path,
            error=message,
            code=code,
        )
    )
