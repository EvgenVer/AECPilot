"""Command-line entry point for aec-rag (task 1.14): `aec-rag scan --project
<vault or project.json path>` scans every configured source into
``<vault>/.aecpilot/index.db`` and prints a JSON change report to stdout.

Also `aec-rag detach --project <...> --source <id>` (task 1.16): marks that
source's `files` rows `detached` in `index.db` without touching anything
else — spawned by the desktop app right after it removes the source from
project.json (apps/desktop/src/main/project-manager.ts's
`removeSourceFromProject`), best-effort (see specs/workspace-sources.md's
"Отключение источника"). `scan` self-heals a `detach` that lost a lock race
against it: see `run_scan`'s docstring for the orphan-sweep it runs after
every scan cycle.

Spawned by the desktop app's scan scheduler (apps/desktop/src/main/
scan-runner.ts) once per scheduled tick / "scan now" click; also runnable by
hand for verification (see specs/workspace-sources.md's "Детект изменений").
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path

from aec_rag.db import open_index
from aec_rag.indexer import detach_source, scan_source
from aec_rag.project_config import ProjectConfigError, parse_project_config
from aec_rag.rag_index import RagIndexError


def _resolve_project_json(project_arg: Path) -> Path:
    """Accepts either a vault directory or a direct path to its
    `.aecpilot/project.json` — the desktop app passes the vault path, but a
    direct project.json path is handy for manual/ad-hoc runs.
    """
    if project_arg.is_dir():
        candidate = project_arg / ".aecpilot" / "project.json"
        if not candidate.is_file():
            raise ProjectConfigError(f"project.json not found under vault: {project_arg}")
        return candidate
    return project_arg


#: Substrings SQLite uses when the lock, not the query, is the problem.
LOCK_MARKERS = ("database is locked", "database is busy")


def explain_operational_error(exc: sqlite3.OperationalError, command: str = "") -> str:
    """Turn SQLite's `database is locked` into something a person can act on.

    Task 4D-9, owner decision 2026-08-17. The refusal itself is legitimate and
    stays: `index.db` takes one writer at a time, and a scan holds its
    transaction for the whole pass — it hashes every file inside it — so the
    five seconds a second writer waits are nowhere near enough to outlast a
    running one. What was wrong is that the message explained none of that.

    `detach` keeps its own ending, and it is not decoration: a source left
    un-detached IS picked up by `run_scan`'s orphan sweep on the next cycle, so
    there the honest advice is "you may also do nothing". For every other
    command the work simply did not happen and has to be repeated.
    """
    text = str(exc).lower()
    if not any(marker in text for marker in LOCK_MARKERS):
        return f"aec-rag: {exc}"
    common = (
        "aec-rag: индекс проекта занят другим процессом — скорее всего открытым "
        "приложением, которое сканирует источники. index.db принимает одного писателя "
        "за раз, а скан держит запись до конца прохода. "
    )
    if command == "detach":
        return common + (
            "Пометка будет доделана следующим сканом — или закройте приложение и повторите команду."
        )
    return common + "Закройте приложение (или дождитесь конца его скана) и повторите команду."


def run_scan(project_arg: Path) -> dict:
    """Scans every source declared in `project_arg`'s project.json into that
    vault's `.aecpilot/index.db`. Returns `{"sources": {source_id: report}}`
    — one `scan_source` report (see aec_rag.indexer) per configured source —
    plus `"detached_orphans": {source_id: n}` (only present when non-empty)
    from the self-healing sweep below.

    Fix-iteration (task 1.16, review major): a source can be removed from
    project.json (apps/desktop's `removeSourceFromProject`) while a scan or a
    racing `aec-rag detach` is still holding index.db's write lock against
    that same source — a `detach` that loses that race (SQLite's
    `busy_timeout` expires) fails, and the desktop side's best-effort catch
    swallows that failure, which would otherwise leave the source's rows
    stuck `"ok"`/`"changed"` forever (it's no longer in project.json, so no
    future scan ever visits it again to fix that). To make this
    self-healing, every scan finishes with a sweep: any `source_id` found in
    index.db (with at least one non-`"detached"` row) that is *not* among
    the source ids just read from project.json gets `detach_source`'d right
    here — converging the index within one scan cycle no matter what a prior
    scan/detach race left behind. Idempotent: a source with nothing left to
    detach contributes no entry to `detached_orphans`, and once every
    orphaned row is `"detached"` the next scan's sweep finds nothing to do.
    """
    project_path = _resolve_project_json(project_arg)
    roots = parse_project_config(project_path)

    index_db_path = project_path.parent / "index.db"
    conn = open_index(index_db_path)
    try:
        reports = {root.id: scan_source(conn, root.id, root.root_path) for root in roots}

        configured_ids = {root.id for root in roots}
        rows = conn.execute(
            "SELECT DISTINCT source_id FROM files WHERE status != 'detached'"
        ).fetchall()
        orphan_ids = {source_id for (source_id,) in rows if source_id not in configured_ids}
        detached_orphans = {
            source_id: count
            for source_id in orphan_ids
            if (count := detach_source(conn, source_id)) > 0
        }
    finally:
        conn.close()

    result: dict = {"sources": reports}
    if detached_orphans:
        result["detached_orphans"] = detached_orphans
    return result


def run_detach(project_arg: Path, source_id: str) -> dict:
    """Marks every `index.db` row for `source_id` as `detached` (task 1.16),
    without ever creating an index.db that didn't already exist: a source
    can be disconnected before it was ever scanned, and that's not an error
    -- this returns `{"source_id": source_id, "detached": 0}` rather than
    failing. `project_arg` must still resolve to a valid project.json (the
    vault itself being unreadable/missing IS fatal, same as `run_scan`) --
    only a *missing index.db next to it* is tolerated.
    """
    project_path = _resolve_project_json(project_arg)
    if not project_path.is_file():
        raise ProjectConfigError(f"project.json not found: {project_path}")
    index_db_path = project_path.parent / "index.db"
    if not index_db_path.is_file():
        return {"source_id": source_id, "detached": 0}

    conn = open_index(index_db_path)
    try:
        detached = detach_source(conn, source_id)
    finally:
        conn.close()

    return {"source_id": source_id, "detached": detached}


def run_ingest(project_arg: Path, *, mode: str) -> dict:
    """Tier-1 ingest over every scanned file (task 2.10), reporting as it goes.

    Progress is written to stdout as one JSON object per line while the run is
    in flight, and the final report is the last line. That shape is what lets
    the desktop app show a live indicator without a second channel — it is the
    same thing `scan` already does, and the app already knows how to read it.
    """
    import asyncio

    from aec_rag.ingest import ingest
    from aec_rag.rag_index import load_settings
    from aec_rag.rag_index import open_index as open_rag_index

    project_path = _resolve_project_json(project_arg)
    roots = {root.id: root.root_path for root in parse_project_config(project_path)}
    vault = project_path.parent.parent
    settings = load_settings(project_path)

    def emit(progress) -> None:
        print(json.dumps({"progress": progress.as_dict()}, ensure_ascii=False), flush=True)

    async def run() -> dict:
        conn = open_index(project_path.parent / "index.db")
        try:
            rag = await open_rag_index(vault, settings)
            report = await ingest(conn, rag, roots, mode=mode, on_progress=emit)
            return report.as_dict()
        finally:
            conn.close()

    return asyncio.run(run())


def run_status(project_arg: Path) -> dict:
    """What the index holds, for the desktop's indicator (task 2.15).

    The same numbers the `rag_status` MCP tool answers with, reached without a
    gateway: the app shows them on every project open and after every scan, and
    routing that through the agent's tool channel would make the indicator
    depend on a live session.
    """
    from aec_rag.graph_scope import estimate, graph_stats, pending_for_scope, read_scope
    from aec_rag.store import index_stats

    project_path = _resolve_project_json(project_arg)
    index_db_path = project_path.parent / "index.db"
    if not index_db_path.is_file():
        return {
            "files_total": 0,
            "files_indexed": 0,
            "chunks_total": 0,
            "stale_count": 0,
            "last_ingest_at": None,
            "graph": {
                "documents": 0,
                "chunks": 0,
                "documents_outside": 0,
                "covers_whole_project": False,
            },
            "graph_pending": {"documents": 0, "chunks_estimate": 0, "not_indexed": 0},
        }

    conn = open_index(index_db_path)
    try:
        stats = index_stats(conn)
        row = conn.execute("SELECT max(ingested_at) FROM ingested_files").fetchone()
        entries = read_scope(project_path)
        pending = pending_for_scope(conn, entries)
        return {
            **stats,
            "last_ingest_at": row[0] if row else None,
            "graph": graph_stats(conn),
            "graph_pending": estimate(conn, pending),
            "graph_entries": [entry.as_dict() for entry in entries],
        }
    finally:
        conn.close()


def run_serve(project_arg: Path) -> None:
    """Run the aec-rag MCP server over stdio (task 2.10)."""
    from aec_rag.server import build_server

    build_server(_resolve_project_json(project_arg)).run()


def run_check_quotes(project_arg: Path, answer: str) -> dict:
    """Второй рубеж сверки выдержек (SPEC UR26, задача 3.31).

    На вход — текст ответа целиком, на выход — каждая выдержка с вердиктом.
    Приложение показывает ответ дословно и лишь помечает непрошедшие: переписать
    ответ агента оно не вправе, а «этой фразы в источнике нет» — именно то, что
    человеку нужно знать.

    Одним процессом на ответ, а не на выдержку: ответ с пятью цитатами не должен
    стоить пяти запусков python.

    Выдержка сверяется с текстом БЛИЖАЙШЕЙ ПРЕДШЕСТВУЮЩЕЙ ссылки — так её и
    ставит скил (ссылка, следом выдержка). Выдержка до первой ссылки сверяется
    со всем процитированным в ответе: она может относиться к чему угодно из
    названного ниже, и придираться к порядку здесь значило бы помечать верные
    цитаты.
    """
    from aec_rag.citation import parse_citations
    from aec_rag.evidence import EvidenceUnavailable, check_quote, chunk_text, find_quotes

    project_path = _resolve_project_json(project_arg)
    index_db_path = project_path.parent / "index.db"
    if not index_db_path.is_file():
        return {"available": False, "reason": "индекс не собран", "quotes": []}

    conn = open_index(index_db_path)
    try:
        citations = parse_citations(answer)
        everything = "\n".join(chunk_text(conn, citation) for citation in citations)
        results = []
        for quote in find_quotes(answer):
            citation = quote.citation(citations)
            evidence = chunk_text(conn, citation) if citation else everything
            try:
                verdict = check_quote(quote.text, evidence)
            except EvidenceUnavailable as exc:
                # Сверять нечем — и это НЕ «прошло». Молчаливое «ок» убрало бы
                # гарантию, оставив её вид.
                return {"available": False, "reason": str(exc), "quotes": []}
            results.append({"text": quote.text, "start": quote.start, "end": quote.end, **verdict})
        return {"available": True, "quotes": results}
    finally:
        conn.close()


def run_wiki_init(project_arg: Path) -> dict:
    """Скелет вики (задача 4.7). Вызывается и скилом через MCP, и руками."""
    from aec_rag.wiki import init_wiki

    project_json = _resolve_project_json(project_arg)
    result = init_wiki(project_json.parent.parent)
    return {
        "created_dirs": result.created_dirs,
        "created_files": result.created_files,
        "wiki_path": result.wiki_path,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="aec-rag")
    subparsers = parser.add_subparsers(dest="command", required=True)

    scan_parser = subparsers.add_parser("scan", help="Scan every configured source")
    scan_parser.add_argument(
        "--project",
        required=True,
        type=Path,
        help="Path to the vault directory or its .aecpilot/project.json",
    )

    detach_parser = subparsers.add_parser(
        "detach", help="Mark a disconnected source's index.db rows as detached"
    )
    detach_parser.add_argument(
        "--project",
        required=True,
        type=Path,
        help="Path to the vault directory or its .aecpilot/project.json",
    )
    detach_parser.add_argument(
        "--source",
        required=True,
        help="Id of the source being disconnected",
    )

    ingest_parser = subparsers.add_parser(
        "ingest", help="Parse, chunk and index every scanned document (tier 1)"
    )
    ingest_parser.add_argument("--project", required=True, type=Path)
    ingest_parser.add_argument(
        "--full",
        action="store_true",
        help="Re-read every file, not only the ones whose content changed",
    )

    status_parser = subparsers.add_parser("status", help="Print what the index holds")
    status_parser.add_argument("--project", required=True, type=Path)

    serve_parser = subparsers.add_parser("serve", help="Run the aec-rag MCP server over stdio")
    serve_parser.add_argument("--project", required=True, type=Path)

    check_parser = subparsers.add_parser(
        "check-quotes", help="Check every verbatim quote in an answer read from stdin (UR26)"
    )
    check_parser.add_argument("--project", required=True, type=Path)

    wiki_parser = subparsers.add_parser(
        "wiki-init", help="Create the project's wiki skeleton (nothing existing is touched)"
    )
    wiki_parser.add_argument("--project", required=True, type=Path)

    args = parser.parse_args(argv)

    try:
        if args.command == "check-quotes":
            # Байты, а не `sys.stdin.read()`: на Windows текстовый stdin
            # декодируется кодировкой консоли, и русский ответ приезжает
            # искажённым — сверять его с источником после этого бессмысленно.
            report = run_check_quotes(args.project, sys.stdin.buffer.read().decode("utf-8"))
        elif args.command == "wiki-init":
            report = run_wiki_init(args.project)
        elif args.command == "detach":
            report = run_detach(args.project, args.source)
        elif args.command == "status":
            report = run_status(args.project)
        elif args.command == "ingest":
            report = run_ingest(args.project, mode="full" if args.full else "incremental")
        elif args.command == "serve":
            run_serve(args.project)
            return 0
        else:
            report = run_scan(args.project)
    except ProjectConfigError as exc:
        print(f"aec-rag: {exc}", file=sys.stderr)
        return 1
    except RagIndexError as exc:
        # The index refusing to open is a configuration answer, not a crash:
        # a changed embedding model, or a key that was never handed to us.
        print(f"aec-rag: {exc}", file=sys.stderr)
        return 1
    except sqlite3.OperationalError as exc:
        print(explain_operational_error(exc, getattr(args, "command", "")), file=sys.stderr)
        return 1

    print(json.dumps(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
