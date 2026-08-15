"""MCP server `aec-rag`: index the project's documents and search them.

Contract: specs/qa-over-sources.md (API contracts). Two rules shape everything
here:

* **The tool returns material, the agent writes the answer.** `rag_query` and
  `rag_overview` hand back chunks, entities and relations with the place each
  came from — never finished prose. Prose from a tool would be a second author
  with its own tone and its own language, and its text does not decompose back
  into exact references.
* **Indexing is two-tier** (SPECIFICATION UR24). `rag_ingest` is tier one and
  never calls a model. The graph is tier two, opt-in, and lives behind
  `rag_graph_add`.

Ingest runs as a job because it takes minutes on a real project: the tool
returns a `job_id` immediately and `rag_status` reports how far it got. The
desktop app does not poll this server — it runs the same engine through
`aec-rag ingest` and reads progress off stdout (task 2.15).
"""

from __future__ import annotations

import asyncio
import sqlite3
import uuid
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any

from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.exceptions import ToolError

from aec_rag.db import open_index as open_db
from aec_rag.ingest import Progress, ingest
from aec_rag.project_config import ProjectConfigError, parse_project_config
from aec_rag.rag_index import RagIndexError, load_settings, open_index
from aec_rag.store import index_stats

if TYPE_CHECKING:
    from lightrag import LightRAG

# How many progress events a finished job keeps. Enough to see what the run did
# to the last few files, not so many that a project-wide ingest holds its whole
# history in memory.
MAX_EVENTS = 200

# Over-fetch before filtering: filters are applied to retrieved chunks, so
# asking for exactly top_k would return fewer than top_k whenever a filter
# matches part of the result.
FILTER_OVERFETCH = 5


@dataclass
class Job:
    job_id: str
    kind: str
    status: str = "running"
    started_at: str = ""
    finished_at: str = ""
    done: int = 0
    total: int = 0
    error: str = ""
    report: dict[str, Any] | None = None
    events: list[dict[str, Any]] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "job_id": self.job_id,
            "kind": self.kind,
            "status": self.status,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "done": self.done,
            "total": self.total,
            "error": self.error,
            "report": self.report,
        }


def _now() -> str:
    return datetime.now(UTC).isoformat()


class RagServer:
    """Everything one project's tools need, opened when first asked for.

    Both the database and the index are lazy on purpose: the server is spawned
    on every agent session, and a project whose questions never touch the index
    should not pay for loading it.
    """

    def __init__(self, project_json: Path) -> None:
        self.project_json = Path(project_json)
        self.vault = self.project_json.parent.parent
        self._conn: sqlite3.Connection | None = None
        self._index: LightRAG | None = None
        self.jobs: dict[str, Job] = {}

    @property
    def roots(self) -> dict[str, str]:
        return {root.id: root.root_path for root in parse_project_config(self.project_json)}

    def db(self) -> sqlite3.Connection:
        if self._conn is None:
            # `check_same_thread=False`: FastMCP may run a tool body in a worker
            # thread, and every write here is already serialized by the event
            # loop being single-threaded.
            self._conn = open_db(self.project_json.parent / "index.db")
            self._conn.execute("PRAGMA busy_timeout = 5000")
        return self._conn

    async def index(self) -> LightRAG:
        if self._index is None:
            settings = load_settings(self.project_json)
            self._index = await open_index(self.vault, settings)
        return self._index

    def new_job(self, kind: str) -> Job:
        job = Job(job_id=f"{kind}-{uuid.uuid4().hex[:12]}", kind=kind, started_at=_now())
        self.jobs[job.job_id] = job
        return job

    def record(self, job: Job, progress: Progress) -> None:
        job.done = progress.done
        job.total = progress.total
        job.events.append(progress.as_dict())
        if len(job.events) > MAX_EVENTS:
            del job.events[: len(job.events) - MAX_EVENTS]


def build_server(project_json: Path) -> FastMCP:
    """Construct the aec-rag MCP server for one project."""
    server = FastMCP(name="aec-rag")
    state = RagServer(project_json)
    server.rag_state = state

    @server.tool(
        description=(
            "Index the project's scanned documents: parse, chunk, embed. Tier one — "
            "no model is called and nothing is added to the knowledge graph. Returns a "
            "job_id; follow it with rag_status. mode='incremental' (default) only "
            "re-reads files whose content changed; 'full' re-reads everything."
        )
    )
    async def rag_ingest(
        mode: str = "incremental",
        source_ids: list[str] | None = None,
        paths: list[str] | None = None,
    ) -> dict[str, Any]:
        if mode not in ("incremental", "full"):
            raise ToolError(f"неизвестный режим {mode!r}: ожидается 'incremental' или 'full'")

        conn = state.db()
        rag = await _index(state)
        roots = _roots(state)
        job = state.new_job("ingest")

        async def run() -> None:
            try:
                report = await ingest(
                    conn,
                    rag,
                    roots,
                    mode=mode,
                    source_ids=source_ids,
                    rel_paths=paths,
                    on_progress=lambda progress: state.record(job, progress),
                )
                job.report = report.as_dict()
                job.status = "done"
            except Exception as exc:  # noqa: BLE001 — a job reports its own failure
                job.status = "failed"
                job.error = str(exc)
            finally:
                job.finished_at = _now()

        job.task = asyncio.create_task(run())
        return {"job_id": job.job_id, "mode": mode}

    @server.tool(
        description=(
            "State of the project's index: how many files are known, how many are "
            "indexed, how many are stale, when the last ingest finished, what is in "
            "the knowledge graph, and the jobs this server has run."
        )
    )
    def rag_status() -> dict[str, Any]:
        conn = state.db()
        stats = index_stats(conn)
        row = conn.execute("SELECT max(ingested_at) FROM ingested_files").fetchone()
        return {
            **stats,
            "last_ingest_at": row[0] if row else None,
            "graph": graph_summary(conn),
            "jobs": [job.as_dict() for job in state.jobs.values()],
        }

    @server.tool(
        description=(
            "Progress events of one job, oldest first — what rag_ingest has been doing."
        )
    )
    def rag_job(job_id: str) -> dict[str, Any]:
        job = state.jobs.get(job_id)
        if job is None:
            raise ToolError(f"нет такой задачи: {job_id}")
        return {**job.as_dict(), "events": list(job.events)}

    @server.tool(
        description=(
            "Search the indexed documents. Returns the matching chunks with the place "
            "each came from — file, and page/sheet/heading — so the answer can cite it. "
            "filters accepts source_id, path_prefix and doctype."
        )
    )
    async def rag_query(
        query: str,
        top_k: int = 10,
        filters: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        if not query.strip():
            raise ToolError("пустой запрос")
        rag = await _index(state)
        chunks = await search_chunks(state.db(), rag, query, top_k=top_k, filters=filters)
        return {"chunks": chunks}

    @server.tool(
        description=(
            "What the project's knowledge graph covers: the folders and files that were "
            "marked for it, how many documents are actually in it, and which documents "
            "appeared in a marked folder but have not been added yet (pending). Adding "
            "them costs a model call per chunk, so it never happens on its own."
        )
    )
    def rag_graph_scope() -> dict[str, Any]:
        from aec_rag.graph_scope import (
            documents_in_graph,
            estimate,
            pending_for_scope,
            read_scope,
        )

        conn = state.db()
        entries = read_scope(state.project_json)
        pending = pending_for_scope(conn, entries)
        # `documents` is the count, as in `rag_graph_add`'s forecast; `in_graph`
        # is the list behind it. Two names because the interface needs both and
        # one name for both is how a count silently becomes a list.
        return {
            "entries": [entry.as_dict() for entry in entries],
            "in_graph": documents_in_graph(conn),
            "pending": [
                {"source_id": file.source_id, "rel_path": file.rel_path} for file in pending
            ],
            "pending_estimate": estimate(conn, pending),
            **graph_summary(conn),
        }

    @server.tool(
        description=(
            "Add folders or files to the project's knowledge graph. Each path is "
            "'<source_id>/<relative path>'. Returns how many documents and chunks the "
            "run covers BEFORE doing the work, plus a job_id to follow. Tier 2: this "
            "calls the extraction model once per chunk and costs money."
        )
    )
    async def rag_graph_add(
        paths: list[str], kinds: dict[str, str] | None = None
    ) -> dict[str, Any]:
        from aec_rag.graph_scope import add_documents_to_graph, add_to_scope, estimate
        from aec_rag.graph_scope import pending_for_scope as pending_of

        if not paths:
            raise ToolError("не указано, что добавлять в граф")

        conn = state.db()
        entries = add_to_scope(state.project_json, paths, kinds or {})
        pending = pending_of(conn, entries)
        forecast = estimate(conn, pending)

        rag = await _index(state)
        job = state.new_job("graph")
        job.total = forecast["documents"]

        async def run() -> None:
            try:
                def note(done: int, total: int, file, chunks: int) -> None:
                    state.record(
                        job,
                        Progress(
                            stage="graph",
                            done=done,
                            total=total,
                            source_id=file.source_id,
                            rel_path=file.rel_path,
                            chunks=chunks,
                        ),
                    )

                job.report = await add_documents_to_graph(conn, rag, pending, on_progress=note)
                job.status = "done"
            except Exception as exc:  # noqa: BLE001 — a job reports its own failure
                job.status = "failed"
                job.error = str(exc)
            finally:
                job.finished_at = _now()

        job.task = asyncio.create_task(run())
        return {"job_id": job.job_id, **forecast}

    @server.tool(
        description=(
            "Material for an overview answer: the entities and relations the knowledge "
            "graph holds around the question, plus the chunks behind them with the place "
            "each came from. Returns material, never prose — the answer is yours to write. "
            "graph_scope.covers_whole_project says whether the graph covers the whole "
            "project; when it is false, say so before answering."
        )
    )
    async def rag_overview(query: str, top_k: int = 20) -> dict[str, Any]:
        if not query.strip():
            raise ToolError("пустой запрос")
        rag = await _index(state)
        return await overview(state.db(), rag, query, top_k=top_k)

    return server


def _roots(state: RagServer) -> dict[str, str]:
    try:
        return state.roots
    except ProjectConfigError as exc:
        raise ToolError(str(exc)) from exc


async def _index(state: RagServer) -> LightRAG:
    try:
        return await state.index()
    except (RagIndexError, ProjectConfigError) as exc:
        raise ToolError(str(exc)) from exc


def graph_summary(conn: sqlite3.Connection) -> dict[str, Any]:
    """What the knowledge graph currently covers (see :mod:`aec_rag.graph_scope`)."""
    from aec_rag.graph_scope import graph_stats

    return graph_stats(conn)


async def search_chunks(
    conn: sqlite3.Connection,
    rag: LightRAG,
    query: str,
    *,
    top_k: int = 10,
    filters: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    """Vector search over chunks, joined back to their locators.

    The search runs against LightRAG's chunk vectors directly rather than
    through ``aquery_data``: it is the same nearest-neighbour lookup, but it
    keeps the similarity score, and a score is what tells the agent whether the
    top hit is an answer or the least bad of a bad set.
    """
    from aec_rag.lightrag_bridge import split_chunk_key
    from aec_rag.store import get_chunks

    wanted = max(1, int(top_k))
    fetch = wanted * FILTER_OVERFETCH if filters else wanted
    hits = await rag.chunks_vdb.query(query, top_k=fetch)

    identifiers = []
    scores: dict[str, float] = {}
    for hit in hits:
        split = split_chunk_key(str(hit.get("id", "")))
        if split is None:
            continue
        identifiers.append(split[1])
        scores[split[1]] = float(hit.get("distance", 0.0))

    stored = get_chunks(conn, identifiers)
    results: list[dict[str, Any]] = []
    for identifier in identifiers:
        chunk = stored.get(identifier)
        if chunk is None:
            # A vector whose chunk is no longer in index.db: the file was
            # removed between the flush and now. Skipping it is the point —
            # citing a document the user cannot open is worse than one fewer
            # result.
            continue
        if not _passes(chunk, filters):
            continue
        results.append(
            {
                "text": chunk.text,
                "source_id": chunk.source_id,
                "rel_path": chunk.rel_path,
                "locator": chunk.locator,
                "is_table": chunk.is_table,
                "score": round(scores.get(identifier, 0.0), 4),
            }
        )
        if len(results) >= wanted:
            break
    return results


_SOURCE_SEPARATOR = "<SEP>"


def _documents_of(conn: sqlite3.Connection, source_field: str) -> list[dict[str, str]]:
    """Which of our documents an entity or relation was extracted from.

    LightRAG records provenance as its own chunk keys joined by ``<SEP>``. Ours
    carry our chunk id, so the same join that puts a locator on a search hit
    puts a document on a graph node — which is what lets an overview answer
    cite something instead of asserting it.
    """
    from aec_rag.lightrag_bridge import split_chunk_key
    from aec_rag.store import get_chunks

    identifiers = []
    for key in str(source_field or "").split(_SOURCE_SEPARATOR):
        split = split_chunk_key(key.strip())
        if split is not None:
            identifiers.append(split[1])

    seen: list[dict[str, str]] = []
    for chunk in get_chunks(conn, identifiers).values():
        entry = {"source_id": chunk.source_id, "rel_path": chunk.rel_path}
        if entry not in seen:
            seen.append(entry)
    return seen


async def overview(
    conn: sqlite3.Connection, rag: LightRAG, query: str, *, top_k: int = 20
) -> dict[str, Any]:
    """Graph material for an overview question (task 2.11a).

    Material, not prose. Finished text from a tool would be a second author in
    the product, with its own tone and its own language, and it does not
    decompose back into the exact references an engineer needs
    (specs/qa-over-sources.md).
    """
    from lightrag.base import QueryParam

    from aec_rag.graph_scope import graph_stats

    result = await rag.aquery_data(
        query,
        param=QueryParam(mode="mix", top_k=top_k, chunk_top_k=top_k, enable_rerank=False),
    )
    data = result.get("data") or {}

    entities = [
        {
            "name": entity.get("entity_name", ""),
            "type": entity.get("entity_type", ""),
            "description": entity.get("description", ""),
            "documents": _documents_of(conn, entity.get("source_id", "")),
        }
        for entity in data.get("entities", [])
    ]
    relations = [
        {
            "source": relation.get("src_id", ""),
            "target": relation.get("tgt_id", ""),
            "description": relation.get("description", ""),
            "keywords": relation.get("keywords", ""),
            "documents": _documents_of(conn, relation.get("source_id", "")),
        }
        for relation in data.get("relationships", [])
    ]

    return {
        "entities": entities,
        "relations": relations,
        "chunks": _chunks_of(conn, data.get("chunks", [])),
        "graph_scope": graph_stats(conn),
    }


def _chunks_of(conn: sqlite3.Connection, hits: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    """LightRAG's returned chunks, joined back to their locators."""
    from aec_rag.store import get_chunks

    identifiers = chunk_ids_of([{"id": hit.get("chunk_id", "")} for hit in hits])
    stored = get_chunks(conn, identifiers)
    return [
        {
            "text": chunk.text,
            "source_id": chunk.source_id,
            "rel_path": chunk.rel_path,
            "locator": chunk.locator,
            "is_table": chunk.is_table,
        }
        for identifier in identifiers
        if (chunk := stored.get(identifier)) is not None
    ]


def _passes(chunk, filters: dict[str, str] | None) -> bool:
    if not filters:
        return True
    source_id = filters.get("source_id")
    if source_id and chunk.source_id != source_id:
        return False
    prefix = filters.get("path_prefix")
    if prefix and not chunk.rel_path.startswith(prefix):
        return False
    doctype = filters.get("doctype")
    if doctype and not chunk.rel_path.lower().endswith(f".{doctype.lower().lstrip('.')}"):
        return False
    return True


def chunk_ids_of(hits: Sequence[dict[str, Any]]) -> list[str]:
    """Our chunk ids out of a LightRAG hit list, skipping anything not ours."""
    from aec_rag.lightrag_bridge import split_chunk_key

    identifiers = []
    for hit in hits:
        split = split_chunk_key(str(hit.get("id", "")))
        if split is not None:
            identifiers.append(split[1])
    return identifiers
