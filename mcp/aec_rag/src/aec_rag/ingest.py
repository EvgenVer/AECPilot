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
   progress as it goes.

A file that fails is recorded and the run continues. One unreadable PDF in a
folder of two hundred must not cost the other hundred and ninety-nine their
index — and the failure is in the report, not in a log nobody reads.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any

from aec_rag.chunk import chunk_document
from aec_rag.lightrag_bridge import IndexedChunk, delete_document, document_id, insert_document
from aec_rag.parse import SUPPORTED_SUFFIXES, ParsedDocument, ParseError, parse_file
from aec_rag.store import (
    PendingFile,
    live_files,
    pending_files,
    prune_removed,
    store_chunks,
    unmark_ingested,
)

if TYPE_CHECKING:
    from lightrag import LightRAG


@dataclass(frozen=True)
class Progress:
    """One step of a run, as the UI and the agent see it."""

    stage: str
    done: int
    total: int
    source_id: str = ""
    rel_path: str = ""
    chunks: int = 0
    error: str = ""

    def as_dict(self) -> dict[str, Any]:
        return {
            "stage": self.stage,
            "done": self.done,
            "total": self.total,
            "source_id": self.source_id,
            "rel_path": self.rel_path,
            "chunks": self.chunks,
            "error": self.error,
        }


@dataclass
class IngestReport:
    files_total: int = 0
    files_ingested: int = 0
    files_skipped: int = 0
    files_failed: int = 0
    chunks: int = 0
    removed_chunks: int = 0
    errors: list[dict[str, str]] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "files_total": self.files_total,
            "files_ingested": self.files_ingested,
            "files_skipped": self.files_skipped,
            "files_failed": self.files_failed,
            "chunks": self.chunks,
            "removed_chunks": self.removed_chunks,
            "errors": self.errors,
        }


ProgressCallback = Callable[[Progress], None]
Parser = Callable[[Path], ParsedDocument]


def _noop(_: Progress) -> None:
    return None


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
    max_chars: int | None = None,
) -> IngestReport:
    """Run a level-1 ingest over ``conn``'s scanned files.

    ``mode="full"`` re-reads every live file; ``"incremental"`` (the default)
    only the ones whose content changed since the index last consumed them.
    ``source_ids``/``rel_paths`` narrow the run further — that is how «index
    this folder» is expressed without inventing a second code path.

    ``parser`` is injectable so tests do not have to load Docling's models to
    check the bookkeeping around it.
    """
    report = IngestReport()

    removed = prune_removed(conn)
    report.removed_chunks = removed
    if removed:
        on_progress(Progress(stage="pruned", done=removed, total=removed))

    candidates = live_files(conn) if mode == "full" else pending_files(conn)
    if source_ids is not None:
        wanted = set(source_ids)
        candidates = [file for file in candidates if file.source_id in wanted]
    if rel_paths is not None:
        prefixes = tuple(rel_paths)
        candidates = [file for file in candidates if file.rel_path.startswith(prefixes)]

    report.files_total = len(candidates)
    on_progress(Progress(stage="started", done=0, total=report.files_total))

    parse = parser or parse_file
    for done, file in enumerate(candidates, start=1):
        path = resolve_path(roots, file)
        if path is None:
            report.files_skipped += 1
            _fail(report, on_progress, file, done, "источник не подключён", skipped=True)
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
                )
            )
            continue

        try:
            count = await ingest_one(conn, rag, file, path, parse=parse, max_chars=max_chars)
        except (ParseError, OSError, ValueError, RuntimeError) as exc:
            report.files_failed += 1
            _fail(report, on_progress, file, done, str(exc))
            continue

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
            )
        )

    on_progress(Progress(stage="finished", done=report.files_ingested, total=report.files_total))
    return report


async def ingest_one(
    conn: sqlite3.Connection,
    rag: LightRAG,
    file: PendingFile,
    path: Path,
    *,
    parse: Parser = parse_file,
    max_chars: int | None = None,
) -> int:
    """Parse, chunk and index one file. Returns how many chunks it produced.

    ``index.db`` is written first — it holds the locators, without which a
    vector is unciteable — and the vector store second. A failure in between
    un-marks the file, so an incremental run picks it up again instead of
    treating «rows present, vectors missing» as done forever.
    """
    parsed = parse(path)
    chunks = (
        chunk_document(parsed)
        if max_chars is None
        else chunk_document(parsed, max_chars=max_chars)
    )
    doc_id = document_id(file.source_id, file.rel_path)

    if not chunks:
        # A document with no extractable text still counts as consumed: without
        # this its sha256 stays pending and every run re-reads it forever.
        store_chunks(conn, file.source_id, file.rel_path, file.sha256, [])
        await delete_document(rag, doc_id)
        return 0

    ids = store_chunks(conn, file.source_id, file.rel_path, file.sha256, chunks)
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
    return len(chunks)


def _fail(
    report: IngestReport,
    on_progress: ProgressCallback,
    file: PendingFile,
    done: int,
    message: str,
    *,
    skipped: bool = False,
) -> None:
    report.errors.append(
        {"source_id": file.source_id, "rel_path": file.rel_path, "error": message}
    )
    on_progress(
        Progress(
            stage="skipped" if skipped else "failed",
            done=done,
            total=report.files_total,
            source_id=file.source_id,
            rel_path=file.rel_path,
            error=message,
        )
    )
