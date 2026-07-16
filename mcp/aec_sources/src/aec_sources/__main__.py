"""Command-line entry point for the aec-sources MCP server (stdio transport)."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from aec_sources.audit import logs_dir_from_project
from aec_sources.config import ProjectConfigError, parse_project_config
from aec_sources.server import build_server


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="aec-sources")
    parser.add_argument(
        "--project",
        required=True,
        type=Path,
        help="Path to the project's project.json (see specs/workspace-sources.md)",
    )
    args = parser.parse_args(argv)

    try:
        roots = parse_project_config(args.project)
    except ProjectConfigError as exc:
        print(f"aec-sources: {exc}", file=sys.stderr)
        return 1

    server = build_server(roots, logs_dir=logs_dir_from_project(args.project))
    server.run("stdio")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
