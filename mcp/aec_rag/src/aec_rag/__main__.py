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

    args = parser.parse_args(argv)

    try:
        if args.command == "detach":
            report = run_detach(args.project, args.source)
        else:
            report = run_scan(args.project)
    except ProjectConfigError as exc:
        print(f"aec-rag: {exc}", file=sys.stderr)
        return 1
    except sqlite3.OperationalError as exc:
        # Review fix (major, task 1.16): `detach` can lose a lock race
        # against a concurrently running `scan` (SQLite's busy_timeout
        # expires) -- report that plainly instead of a raw traceback. Not
        # fatal for the *system* (`run_scan`'s orphan sweep above will pick
        # up and detach this source on the very next scan cycle), just for
        # this one process's exit code.
        print(
            f"aec-rag: index.db занят идущим сканированием — пометка будет доделана "
            f"следующим сканом ({exc})",
            file=sys.stderr,
        )
        return 1

    print(json.dumps(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
