"""Индексирует мини-проект для эвала вики (задача 4.14).

    uv run python eval/ingest_wiki_fixture.py

Свой vault, отдельный от `eval/.eval-vault`: тот стоит на настоящих документах
владельца, а этот — на шести придуманных, и смешивать их нельзя. Материал по
мини-проекту помещается в модель и в судью целиком, и только поэтому проверка
«нет выдумок» что-то значит (см. `eval/fixtures/wiki-project/README.md`).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from graph_cost import load_env_file  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[1]
FIXTURE = REPO_ROOT / "eval" / "fixtures" / "wiki-project"
VAULT = REPO_ROOT / "eval" / ".wiki-vault"
DEFAULT_ENV_FILE = REPO_ROOT / "runtime" / "dev-profile" / ".env"
SOURCE_ID = "mini"


def ensure_vault() -> Path:
    project_json = VAULT / ".aecpilot" / "project.json"
    project_json.parent.mkdir(parents=True, exist_ok=True)
    project_json.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "name": "wiki-eval",
                "sources": [{"id": SOURCE_ID, "root_path": str(FIXTURE)}],
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return project_json


async def run(full: bool) -> dict:
    from aec_rag.__main__ import run_scan
    from aec_rag.db import open_index
    from aec_rag.ingest import ingest
    from aec_rag.project_config import parse_project_config
    from aec_rag.rag_index import load_settings
    from aec_rag.rag_index import open_index as open_rag_index

    project_json = ensure_vault()
    scan = run_scan(project_json)
    for source_id, report in scan["sources"].items():
        print(
            f"   {source_id}: +{len(report['added'])} ~{len(report['changed'])} "
            f"-{len(report['deleted'])} ={report['unchanged']}",
            flush=True,
        )

    roots = {root.id: root.root_path for root in parse_project_config(project_json)}
    conn = open_index(project_json.parent / "index.db")
    try:
        rag = await open_rag_index(VAULT, load_settings(project_json))
        report = await ingest(conn, rag, roots, mode="full" if full else "incremental")
    finally:
        conn.close()
    return report.as_dict()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="ingest-wiki-fixture")
    parser.add_argument("--full", action="store_true")
    parser.add_argument("--env-file", default=str(DEFAULT_ENV_FILE))
    args = parser.parse_args(argv)

    load_env_file(Path(args.env_file))
    print(json.dumps(asyncio.run(run(args.full)), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
