"""Сколько стоит второй проход извлечения сущностей и что он приносит (4D-22).

    uv run python eval/gleaning_bench.py

Умолчание LightRAG `entity_extract_max_gleaning = 1` делает после первого
извлечения второй вызов «что ещё осталось», унося в контекст весь первый ответ.
Замер 2.9a показал 2,02 вызова на чанк — то есть счёт за построение графа
удваивается. Вопрос, на который отвечает этот скрипт: что мы за эти деньги
получаем.

Мерится на мини-проекте вики (`eval/fixtures/wiki-project`, шесть придуманных
документов) — он маленький, поэтому прогон стоит копейки, и он же полностью
помещается в голову, поэтому разницу видно глазами, а не только в цифре.

Две индексации в разные vault'ы, один и тот же корпус:
  gleaning=1 — как сейчас;
  gleaning=0 — один проход.
Сравниваются вызовы LLM, потраченные токены, число сущностей и связей.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import shutil
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "eval"))
sys.path.insert(0, str(REPO_ROOT / "mcp" / "aec_rag" / "src"))
sys.path.insert(0, str(REPO_ROOT / "eval" / "fixtures" / "wiki-project"))

from graph_cost import load_env_file  # noqa: E402

FIXTURE = REPO_ROOT / "eval" / "fixtures" / "wiki-project"
DEFAULT_ENV_FILE = REPO_ROOT / "runtime" / "dev-profile" / ".env"
SOURCE_ID = "mini"


class Counter:
    """Считает вызовы LLM и токены, не мешая самому вызову."""

    def __init__(self) -> None:
        self.calls = 0
        self.prompt_chars = 0
        self.completion_chars = 0

    def wrap(self, func):
        async def counted(prompt, system_prompt=None, **kwargs):
            self.calls += 1
            self.prompt_chars += len(prompt or "") + len(system_prompt or "")
            answer = await func(prompt, system_prompt=system_prompt, **kwargs)
            self.completion_chars += len(answer or "")
            return answer

        return counted


def make_vault(root: Path) -> Path:
    if root.exists():
        shutil.rmtree(root)
    project_json = root / ".aecpilot" / "project.json"
    project_json.parent.mkdir(parents=True)
    project_json.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "name": "gleaning-bench",
                "sources": [{"id": SOURCE_ID, "root_path": str(FIXTURE)}],
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return project_json


async def run_one(vault_root: Path, gleaning: int) -> dict:
    from aec_rag.__main__ import run_scan
    from aec_rag.db import open_index
    from aec_rag.graph_scope import add_documents_to_graph, add_to_scope, pending_for_scope
    from aec_rag.ingest import ingest
    from aec_rag.project_config import parse_project_config
    from aec_rag.rag_index import _default_llm_func, load_settings
    from aec_rag.rag_index import open_index as open_rag_index

    project_json = make_vault(vault_root)
    run_scan(project_json)

    settings = load_settings(project_json)
    counter = Counter()
    rag = await open_rag_index(
        vault_root, settings, llm_func=counter.wrap(_default_llm_func(settings))
    )
    # Ставится после открытия: `open_index` — наша дверь, и параметр
    # извлечения в её сигнатуру не входит. Меняем ровно одно поле, чтобы
    # разница между двумя прогонами была ровно одна.
    rag.entity_extract_max_gleaning = gleaning

    roots = {root.id: root.root_path for root in parse_project_config(project_json)}
    conn = open_index(project_json.parent / "index.db")
    try:
        report = await ingest(conn, rag, roots, mode="full")
        # Граф — второй уровень и он opt-in: `ingest` кладёт документы с
        # `build_graph=False`, а строит граф отдельный путь. Мерить надо именно
        # его, иначе замер не касается предмета.
        # Путь в области графа — это `<source_id>/<rel>`, а не путь на диске:
        # `covers` сравнивает сегменты. Один id источника накрывает весь корпус.
        entries = add_to_scope(project_json, [SOURCE_ID], {SOURCE_ID: "folder"})
        pending = pending_for_scope(conn, entries)
        await add_documents_to_graph(conn, rag, pending)
    finally:
        conn.close()

    graph = rag.chunk_entity_relation_graph
    entities = await graph.get_all_nodes()
    relations = await graph.get_all_edges()

    return {
        "gleaning": gleaning,
        "chunks": report.as_dict().get("chunks"),
        "llm_calls": counter.calls,
        "prompt_chars": counter.prompt_chars,
        "completion_chars": counter.completion_chars,
        "entities": len(entities or []),
        "relations": len(relations or []),
        "entity_names": sorted(str(node.get("entity_id") or "") for node in (entities or [])),
    }


async def main_async(args) -> int:
    load_env_file(Path(args.env_file))
    import build_docs

    build_docs.main()

    results = []
    for gleaning in (1, 0):
        root = REPO_ROOT / "eval" / f".gleaning-{gleaning}"
        print(f"=== индексация с gleaning={gleaning}", flush=True)
        results.append(await run_one(root, gleaning))
        print(json.dumps(results[-1], ensure_ascii=False), flush=True)

    with_g, without_g = results
    print("\n=== итог")
    print(f"{'':<16}{'gleaning=1':>14}{'gleaning=0':>14}{'разница':>12}")
    for key in ("llm_calls", "prompt_chars", "completion_chars", "entities", "relations"):
        a, b = with_g[key], without_g[key]
        delta = "—" if not b else f"{(a - b) / b * 100:+.0f}%"
        print(f"{key:<16}{a:>14}{b:>14}{delta:>12}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="gleaning-bench")
    parser.add_argument("--env-file", default=str(DEFAULT_ENV_FILE))
    return asyncio.run(main_async(parser.parse_args(argv)))


if __name__ == "__main__":
    raise SystemExit(main())
