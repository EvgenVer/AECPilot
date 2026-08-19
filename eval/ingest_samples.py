"""Index the reference project into a throwaway vault (tasks 2.16–2.18).

The eval set, the baseline and the load measurement all need one thing first:
the sample documents actually indexed, with their locators, the way the product
would index them. This does that in one command, without a desktop app and
without a gateway.

    uv run python eval/ingest_samples.py            # scan + tier-1 ingest
    uv run python eval/ingest_samples.py --status   # what the index holds now

The vault lives in `eval/.eval-vault` (gitignored). The API key is read from the
process environment or, with `--env-file`, loaded out of a dotenv file by this
script — never printed.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from graph_cost import load_env_file  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[1]
SAMPLES = REPO_ROOT / "eval" / "samples" / "project"
# Tracked, unlike `samples`: the injection scenario has to be runnable on a
# fresh clone, and it needs a document that carries the planted text.
FIXTURES = REPO_ROOT / "eval" / "fixtures"
VAULT = REPO_ROOT / "eval" / ".eval-vault"
DEFAULT_ENV_FILE = REPO_ROOT / "runtime" / "dev-profile" / ".env"
SOURCE_ID = "project"


def ensure_vault() -> Path:
    """Create the throwaway vault and point it at both source roots.

    Reconciles rather than only creating: a vault made before a source existed
    would otherwise keep ignoring it, and that miss looks exactly like «that
    document has nothing to say».
    """
    project_json = VAULT / ".aecpilot" / "project.json"
    project_json.parent.mkdir(parents=True, exist_ok=True)
    wanted = {SOURCE_ID: str(SAMPLES), "fixtures": str(FIXTURES)}

    data: dict = {"schema_version": 1, "name": "eval", "sources": []}
    if project_json.is_file():
        data = json.loads(project_json.read_text(encoding="utf-8"))

    sources = [entry for entry in data.get("sources", []) if entry.get("id") in wanted]
    known = {entry["id"] for entry in sources}
    for source_id, root in wanted.items():
        if source_id not in known:
            sources.append({"id": source_id, "root_path": root})
    data["sources"] = sources

    project_json.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return project_json


async def run(args) -> dict:
    from aec_rag.__main__ import run_scan, run_status
    from aec_rag.db import open_index
    from aec_rag.ingest import ingest
    from aec_rag.project_config import parse_project_config
    from aec_rag.rag_index import load_settings
    from aec_rag.rag_index import open_index as open_rag_index

    project_json = ensure_vault()
    if args.status:
        return run_status(project_json)

    started = time.monotonic()
    scan = run_scan(project_json)
    print(f"== скан: {time.monotonic() - started:.1f} с", flush=True)
    for source_id, report in scan["sources"].items():
        print(
            f"   {source_id}: +{len(report['added'])} ~{len(report['changed'])} "
            f"-{len(report['deleted'])} ={report['unchanged']}",
            flush=True,
        )

    roots = {root.id: root.root_path for root in parse_project_config(project_json)}
    settings = load_settings(project_json)
    conn = open_index(project_json.parent / "index.db")
    try:
        rag = await open_rag_index(VAULT, settings)

        def note(progress) -> None:
            if progress.stage in ("file", "failed", "skipped"):
                print(
                    f"   [{progress.done}/{progress.total}] {progress.stage} "
                    f"{progress.rel_path} ({progress.chunks} чанков) {progress.error}".rstrip(),
                    flush=True,
                )

        ingest_started = time.monotonic()
        report = await ingest(
            conn,
            rag,
            roots,
            mode="full" if args.full else "incremental",
            source_ids=args.source or None,
            rel_paths=args.only or None,
            on_progress=note,
        )
        elapsed = time.monotonic() - ingest_started
    finally:
        conn.close()

    result = report.as_dict()
    result["seconds"] = round(elapsed, 1)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="ingest_samples")
    parser.add_argument("--status", action="store_true", help="Только показать состояние индекса")
    parser.add_argument("--full", action="store_true", help="Перечитать всё, а не изменившееся")
    parser.add_argument(
        "--source",
        action="append",
        help="Только этот источник (можно повторять)",
    )
    parser.add_argument(
        "--only", action="append", help="Только пути с этим префиксом (можно повторять)"
    )
    parser.add_argument("--env-file", default=str(DEFAULT_ENV_FILE))
    args = parser.parse_args(argv)

    if not SAMPLES.is_dir() or not any(SAMPLES.iterdir()):
        print(f"ingest_samples: в {SAMPLES} нет документов (см. eval/README.md)", file=sys.stderr)
        return 1

    load_env_file(Path(args.env_file))
    report = asyncio.run(run(args))
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
