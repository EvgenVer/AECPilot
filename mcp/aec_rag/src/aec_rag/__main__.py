"""Command-line entry point for aec-rag (task 1.14): `aec-rag scan --project
<vault or project.json path>` scans every configured source into
``<vault>/.aecpilot/index.db`` and prints a JSON change report to stdout.

Spawned by the desktop app's scan scheduler (apps/desktop/src/main/
scan-runner.ts) once per scheduled tick / "scan now" click; also runnable by
hand for verification (see specs/workspace-sources.md's "Детект изменений").
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from aec_rag.db import open_index
from aec_rag.indexer import scan_source
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
    — one `scan_source` report (see aec_rag.indexer) per configured source.
    """
    project_path = _resolve_project_json(project_arg)
    roots = parse_project_config(project_path)

    index_db_path = project_path.parent / "index.db"
    conn = open_index(index_db_path)
    try:
        reports = {root.id: scan_source(conn, root.id, root.root_path) for root in roots}
    finally:
        conn.close()

    return {"sources": reports}


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

    args = parser.parse_args(argv)

    try:
        report = run_scan(args.project)
    except ProjectConfigError as exc:
        print(f"aec-rag: {exc}", file=sys.stderr)
        return 1

    print(json.dumps(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
