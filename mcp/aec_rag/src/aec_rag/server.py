"""MCP server `aec-rag`: index the project's documents and search them.

Contract: docs/history/specs/qa-over-sources.md (API contracts). Two rules shape everything
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
import re
import sqlite3
import uuid
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any

from mcp.server import MCPServer
from mcp.server.mcpserver.exceptions import ToolError

from aec_rag.citation import parse_citations
from aec_rag.db import open_index as open_db
from aec_rag.evidence import EvidenceUnavailable, check_quote, chunk_text
from aec_rag.ingest import Progress, ingest
from aec_rag.project_config import ProjectConfigError
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


#: Виды задач, которые ПИШУТ: у них общая база и общий экземпляр LightRAG,
#: поэтому одновременно работать может только одна (находка D-49).
MUTATION_KINDS = frozenset({"ingest", "graph"})


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
        from aec_rag.project_scope import all_roots

        return all_roots(self.project_json)

    def db(self) -> sqlite3.Connection:
        if self._conn is None:
            # `check_same_thread=False` is set in `open_db` itself — mcp 2.0 really
            # does run a sync tool body on a worker thread (measured, 3.B0б), and
            # until that task the flag was only claimed here, never passed. What
            # keeps it safe is that every writer of this database is an ASYNC tool
            # body, so writes stay on the loop thread; sync bodies only read.
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

    def claim_mutation(self, kind: str) -> Job:
        """Занимает единственное место под пишущую задачу — или отказывает.

        Находка D-49: ``rag_ingest`` и ``rag_graph_add`` заводили задачу через
        ``asyncio.create_task`` без всякого взаимного исключения, а база и
        экземпляр LightRAG у них ОБЩИЕ. Две такие задачи живут на одном цикле
        событий и перемежаются на каждом ``await`` — то есть одна может
        закоммитить транзакцию, начатую другой. Зовёт их модель, поэтому
        ограничения в окне тут не помогают: граница должна стоять на сервере.

        Место занимается СИНХРОННО, до первого ``await`` в теле инструмента, —
        иначе два вызова успеют пройти проверку, пока каждый ждёт открытия
        индекса, и замок не удержит ничего. По той же причине задача заводится
        здесь же, а не после подготовки: занятое место и есть задача.

        Освобождается оно тем, что задача доходит до ``done`` или ``failed`` —
        ``run()`` в обоих инструментах ставит это в ``finally``, так что упавшая
        задача сервер не глушит.
        """
        for job in self.jobs.values():
            if job.kind in MUTATION_KINDS and job.status == "running":
                raise ToolError(
                    f"уже идёт задача {job.kind} ({job.job_id}): она пишет в тот же индекс, "
                    f"и второй такой быть не может. Дождитесь конца — rag_job({job.job_id!r})"
                )
        return self.new_job(kind)

    def record(self, job: Job, progress: Progress) -> None:
        job.done = progress.done
        job.total = progress.total
        job.events.append(progress.as_dict())
        if len(job.events) > MAX_EVENTS:
            del job.events[: len(job.events) - MAX_EVENTS]


def build_server(project_json: Path) -> MCPServer:
    """Construct the aec-rag MCP server for one project."""
    server = MCPServer(name="aec-rag")
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

        # Место занимается ДО первого await (находка D-49) — иначе два вызова
        # пройдут проверку, пока каждый ждёт открытия индекса.
        job = state.claim_mutation("ingest")
        try:
            conn = state.db()
            rag = await _index(state)
            roots = _roots(state)
        except Exception as exc:
            # Подготовка не удалась — место надо освободить здесь: до `run()`
            # дело не дошло, а занятая навсегда задача заглушила бы сервер.
            job.status = "failed"
            job.error = str(exc)
            job.finished_at = _now()
            raise

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
        description=("Progress events of one job, oldest first — what rag_ingest has been doing.")
    )
    def rag_job(job_id: str) -> dict[str, Any]:
        job = state.jobs.get(job_id)
        if job is None:
            raise ToolError(f"нет такой задачи: {job_id}")
        return {**job.as_dict(), "events": list(job.events)}

    # --8<-- [start:rag_query]
    @server.tool(
        description=(
            "Search the indexed documents — vectors and full text together. Returns the "
            "matching chunks with the place each came from (file, and page/sheet/heading) "
            "so the answer can cite it. `score` is the vector similarity and is null for a "
            "chunk only the full-text half found; `match` says which half found it. "
            "filters accepts source_id, path_prefix and doctype. "
            "A chunk with `project_file: true` is from a file of the project itself that a "
            "person chose to index (a draft, a wiki page), not from a source document: its "
            "`rel_path` is relative to the project folder, cite it as "
            "[src: project/<rel_path>], read it with the file tools rather than sources_read, "
            "and never present it as a primary source."
        )
    )
    async def rag_query(
        query: str,
        top_k: int = 10,
        filters: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        if not query.strip():
            return _refused("пустой запрос: передай вопрос словами")
        rag = await _index(state)
        chunks = await search_chunks(state.db(), rag, query, top_k=top_k, filters=filters)
        return {"chunks": chunks}

    # --8<-- [end:rag_query]
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

        # Место занимается ПЕРВЫМ делом (находка D-49), раньше `add_to_scope`:
        # он правит project.json, и записать, а потом отказать — хуже, чем
        # отказать сразу.
        job = state.claim_mutation("graph")
        try:
            conn = state.db()
            entries = add_to_scope(state.project_json, paths, kinds or {})
            pending = pending_of(conn, entries)
            forecast = estimate(conn, pending)
            rag = await _index(state)
        except Exception as exc:
            job.status = "failed"
            job.error = str(exc)
            job.finished_at = _now()
            raise

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
            return _refused("пустой запрос: передай вопрос словами")
        rag = await _index(state)
        return await overview(state.db(), rag, query, top_k=top_k)

    @server.tool(
        description=(
            "Check a verbatim quote against the text of the place it cites (SPEC UR26). "
            "Call it BEFORE putting the quote in the answer: `ok: false` means that "
            "sentence is not in the source, so take the real wording or drop the quote. "
            "`citation` is the reference as it appears in the answer — [src: …]."
        )
    )
    def rag_check_quote(citation: str, quote: str) -> dict[str, Any]:
        parsed = parse_citations(citation)
        if not parsed:
            raise ToolError("ссылка не разобрана: ожидается [src: <source_id>/<путь>#<локатор>]")
        evidence = chunk_text(state.db(), parsed[0])
        if not evidence:
            return {
                "ok": False,
                "reason": "эта ссылка не указывает ни на один фрагмент индекса",
            }
        try:
            return check_quote(quote, evidence)
        except EvidenceUnavailable as exc:
            # Не «ок» и не «не совпало»: сверять нечем, и это обязано быть видно
            # — иначе исчезает гарантия, а её вид остаётся.
            raise ToolError(str(exc)) from exc

    @server.tool(
        description=(
            "Create the project's wiki skeleton: wiki/ with entities, concepts, "
            "comparisons, queries, raw, plus SCHEMA.md, index.md and log.md. Call it "
            "once before building the wiki. Existing files and folders are never "
            "touched, so calling it again on a live project is safe and returns empty "
            "lists."
        )
    )
    def wiki_init() -> dict[str, Any]:
        from aec_rag.wiki import init_wiki

        result = init_wiki(state.vault)
        return {
            "created_dirs": result.created_dirs,
            "created_files": result.created_files,
            "wiki_path": result.wiki_path,
        }

    @server.tool(
        description=(
            "Write wiki/raw/ snapshots of parsed documents, taken from the index — the "
            "same text you were given, with the sha256 it was read at, so drift is "
            "detectable later. Do NOT copy document text into files yourself; call "
            "this. Without arguments it snapshots every indexed document; pass "
            "source_id and/or rel_paths to narrow it to what changed."
        )
    )
    def wiki_snapshot(
        source_id: str | None = None, rel_paths: list[str] | None = None
    ) -> dict[str, Any]:
        from aec_rag.wiki import write_snapshots

        result = write_snapshots(state.db(), state.vault, source_id=source_id, rel_paths=rel_paths)
        return {"files": result.files, "skipped": result.skipped}

    @server.tool(
        description=(
            "What the wiki has fallen behind on, by comparing each wiki/raw/ snapshot's "
            "sha256 against the index. Three separate lists: 'changed' — the document "
            "was reissued, so pages built from it no longer describe it; 'new' — "
            "indexed but never snapshotted; 'gone' — snapshotted but no longer in the "
            "index. Files added with wiki_add_raw are checked against the original on "
            "disk (source_id 'user'). Call this first when asked to update the wiki."
        )
    )
    def wiki_stale() -> dict[str, Any]:
        from aec_rag.wiki import stale_snapshots

        report = stale_snapshots(state.db(), state.vault)
        return {"changed": report.changed, "gone": report.gone, "new": report.new}

    @server.tool(
        description=(
            "Which wiki pages carry work that is not yours. 'edited' — a human changed "
            "the page after you last wrote it; 'unknown' — a page you have no record of "
            "writing. Never overwrite either one wholesale: read it and edit in place. "
            "Call this BEFORE updating any page."
        )
    )
    def wiki_edited() -> dict[str, Any]:
        from aec_rag.wiki import edited_pages

        return edited_pages(state.vault)

    @server.tool(
        description=(
            "Write a wiki page. Use this instead of the plain file tools for anything "
            "under wiki/: it REFUSES the write when the new text would drop a paragraph "
            "a human wrote, and tells you which one. Getting that refusal means read "
            "the page and put the paragraph back — not rephrase it, put it back. "
            "Pages live only in wiki/entities|concepts|comparisons|queries/<page>.md, "
            "wiki/index.md and wiki/log.md. A refusal comes back as {ok: false, "
            "refused}: fix what it names, do not repeat the same call."
        )
    )
    def wiki_write_page(rel: str, text: str) -> dict[str, Any]:
        from aec_rag.wiki import WikiRefusal, write_page

        try:
            return write_page(state.vault, rel, text)
        except WikiRefusal as refused:
            return _refused(str(refused))
        except (OSError, ValueError) as exc:
            raise ToolError(str(exc)) from exc

    @server.tool(
        description=(
            "Add a raw source to the wiki WITHOUT indexing it: something the person gives "
            "you that is not in the project's documents. kind: files (source_path — the "
            "file is parsed like the index does it, page by page, and not copied), links "
            "(text you fetched + source_url), notes (pasted text, minutes), decisions (a "
            "decision the person asked to record, dated). name is its title. Returns the "
            "wiki/raw/user/... path to cite on the pages you then write. It never enters "
            "document search; that is a separate, explicit request."
        )
    )
    def wiki_add_raw(
        kind: str,
        name: str,
        text: str | None = None,
        source_path: str | None = None,
        source_url: str | None = None,
    ) -> dict[str, Any]:
        from aec_rag.wiki import WikiRefusal, add_raw

        try:
            return add_raw(state.vault, kind, name, text, source_path, source_url)
        except WikiRefusal as refused:
            return _refused(str(refused))
        except OSError as exc:
            raise ToolError(str(exc)) from exc

    @server.tool(
        description=(
            "Record the wiki as you are leaving it, so a later run can tell your own "
            "text from a human's edits. Call it ONCE at the end of a build or update, "
            "after every page is written."
        )
    )
    def wiki_checkpoint() -> dict[str, Any]:
        from aec_rag.wiki import checkpoint_pages

        return {"pages": len(checkpoint_pages(state.vault))}

    @server.tool(
        description=(
            "Check the wiki mechanically: broken [[links]], orphan pages, pages whose "
            "source was reissued, malformed frontmatter, and contradictions still "
            "awaiting a decision. Findings come worst-first with severity error / "
            "warning / info. Report them; do not silently fix a page a human may have "
            "written (see wiki_edited)."
        )
    )
    def wiki_lint() -> dict[str, Any]:
        from aec_rag.wiki_lint import lint_wiki

        findings = lint_wiki(state.db(), state.vault)
        return {
            "findings": [finding.as_dict() for finding in findings],
            "counts": {
                severity: sum(1 for f in findings if f.severity == severity)
                for severity in ("error", "warning", "info")
            },
        }

    return server


def _refused(reason: str) -> dict[str, Any]:
    """Штатный отказ — обычным результатом, а не ошибкой инструмента (D-142).

    Ошибку ядро засчитывает предохранителю сервера как сбой: три подряд — и весь
    ``aec-rag`` минуту отвечает «server unreachable». Отказ по существу — ответ.
    """
    return {"ok": False, "refused": reason}


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


_FTS_WORD = re.compile(r"[\w\-]{3,}", re.UNICODE)

# --8<-- [start:rank_fusion]
# Reciprocal rank fusion's damping constant. 60 is the value the method was
# published with and it needs no tuning: it only decides how quickly a hit's
# contribution falls with its rank, and nothing here is sensitive to that.
RRF_K = 60


def fts_query(text: str) -> str:
    """A question turned into an FTS5 MATCH expression.

    Words joined by OR rather than AND: a question rarely repeats the
    document's wording exactly, and one missing word must not empty the result.
    bm25 sorts it out — a word that occurs everywhere carries almost no weight.
    """
    words = {word.lower().replace('"', "") for word in _FTS_WORD.findall(text)}
    return " OR ".join(f'"{word}"' for word in sorted(words) if word)


def _fuse(ranked: list[list[str]]) -> list[str]:
    """Reciprocal rank fusion of several ranked id lists, best first."""
    scores: dict[str, float] = {}
    for ids in ranked:
        for rank, identifier in enumerate(ids, start=1):
            scores[identifier] = scores.get(identifier, 0.0) + 1.0 / (RRF_K + rank)
    return sorted(scores, key=lambda identifier: -scores[identifier])


# --8<-- [end:rank_fusion]
async def search_chunks(
    conn: sqlite3.Connection,
    rag: LightRAG,
    query: str,
    *,
    top_k: int = 10,
    filters: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    """Hybrid search over chunks, joined back to their locators.

    Vectors alone are not enough, and the case that proved it is worth writing
    down. «Сколько испытаний штампом 600 см² предусмотрено» has its answer in
    one row of a table of works; that row's chunk holds twenty other rows about
    other works, so its embedding is the average of all of them and the
    question does not come near it — measured 2026-08-15, the right chunk was
    **not in the top 100**. Full-text search put it first, because the question
    and the row share exact wording: «штампом», «600», «0,5 МПа».

    So both indexes are asked and their rankings fused (reciprocal rank
    fusion). That is what `files_fts` was built for in task 2.9 — «точная
    формулировка, марки и обозначения ищутся здесь, смысл ищется векторами» —
    and until now nothing used it.

    ``score`` stays the cosine similarity and is ``None`` for a chunk only
    full-text search found: there is no similarity to report for it without
    paying for another embedding call, and inventing one would break the only
    signal the agent has for «nothing here is close».
    """
    from aec_rag.lightrag_bridge import split_chunk_key
    from aec_rag.store import get_chunks, search_text

    wanted = max(1, int(top_k))
    fetch = wanted * FILTER_OVERFETCH if filters else wanted * 2

    vector_ids: list[str] = []
    scores: dict[str, float] = {}
    for hit in await rag.chunks_vdb.query(query, top_k=fetch):
        split = split_chunk_key(str(hit.get("id", "")))
        if split is None:
            continue
        vector_ids.append(split[1])
        scores[split[1]] = float(hit.get("distance", 0.0))

    text_ids: list[str] = []
    expression = fts_query(query)
    if expression:
        try:
            text_ids = [chunk.chunk_id for chunk in search_text(conn, expression, limit=fetch)]
        except sqlite3.OperationalError:
            # A question that FTS5 cannot parse must cost the vector half
            # nothing: half a search beats no search.
            text_ids = []

    identifiers = _fuse([vector_ids, text_ids])
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
        score = scores.get(identifier)
        results.append(
            {
                "text": chunk.text,
                "source_id": chunk.source_id,
                "rel_path": chunk.rel_path,
                "locator": chunk.locator,
                "is_table": chunk.is_table,
                "score": round(score, 4) if score is not None else None,
                "match": _match_kind(identifier, vector_ids, text_ids),
                **_origin(chunk),
            }
        )
        if len(results) >= wanted:
            break
    return results


def _origin(chunk) -> dict[str, bool]:
    """Task 3K.7 (SPEC UR45): a chunk of the project's own files says so — a
    draft or a wiki page must not pass for a source document."""
    from aec_rag.project_scope import PROJECT_SOURCE_ID

    return {"project_file": True} if chunk.source_id == PROJECT_SOURCE_ID else {}


def _match_kind(identifier: str, vector_ids: list[str], text_ids: list[str]) -> str:
    in_vectors = identifier in vector_ids
    in_text = identifier in text_ids
    if in_vectors and in_text:
        return "both"
    return "vector" if in_vectors else "text"


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
    (docs/history/specs/qa-over-sources.md).
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
            **_origin(chunk),
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
