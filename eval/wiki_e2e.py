"""Сквозной прогон вики: агент строит её сам, инструментами (проверка к 4.14).

    uv run python eval/wiki_e2e.py            # построить
    uv run python eval/wiki_e2e.py --update   # потом обновить по изменению

Чем это отличается от `wiki_eval.py`: тот меряет ТЕКСТ страницы, который модель
вернула ответом. Здесь модели дают настоящие инструменты — те же, что стоят в
продукте, — и она строит вики сама: заводит скелет, пишет снимки, кладёт
страницы на диск, ведёт каталог и журнал. Проверяется то, что нельзя проверить
текстом: дойдёт ли она вообще до конца и что окажется в папке.

Не покрыто и здесь: приложение. Как страницы выглядят на экране и работает ли
клик по `[[…]]` — это ручная приёмка (AC3, задача 4.15).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "eval" / "runner"))
sys.path.insert(0, str(REPO_ROOT / "mcp" / "aec_rag" / "src"))

import run as qa  # noqa: E402 — путь к раннеру достраивается выше

SKILL = REPO_ROOT / "skills" / "aec-wiki" / "SKILL.md"
VAULT = REPO_ROOT / "eval" / ".wiki-vault"
MAX_TURNS = 60


def tool(name: str, description: str, properties: dict, required: list[str] | None = None) -> dict:
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {
                "type": "object",
                "properties": properties,
                "required": required or [],
            },
        },
    }


TOOLS = [
    tool("wiki_init", "Создать скелет вики.", {}),
    tool(
        "wiki_snapshot",
        "Записать снимки разобранных документов в wiki/raw/.",
        {"rel_paths": {"type": "array", "items": {"type": "string"}}},
    ),
    tool(
        "rag_query",
        "Найти фрагменты документов. Возвращает чанки со ссылками.",
        {"query": {"type": "string"}, "top_k": {"type": "integer"}},
        ["query"],
    ),
    tool("rag_status", "Что в индексе: сколько файлов, сколько устарело.", {}),
    tool(
        "wiki_write_page",
        "Записать страницу вики. rel — путь от корня, например wiki/entities/ТП-1.md",
        {"rel": {"type": "string"}, "text": {"type": "string"}},
        ["rel", "text"],
    ),
    tool("read_page", "Прочитать существующий файл проекта.", {"rel": {"type": "string"}}, ["rel"]),
    tool("list_wiki", "Перечислить файлы вики.", {}),
    tool("wiki_stale", "Чем вики отстала от индекса.", {}),
    tool("wiki_edited", "Какие страницы правил человек.", {}),
    tool("wiki_checkpoint", "Запомнить вики в том виде, в каком её оставляешь.", {}),
]


async def dispatch(conn, rag, name: str, payload: dict) -> dict:
    from aec_rag.citation import format_citation
    from aec_rag.server import search_chunks
    from aec_rag.store import index_stats
    from aec_rag.wiki import (
        WriteRefused,
        checkpoint_pages,
        edited_pages,
        init_wiki,
        stale_snapshots,
        write_page,
        write_snapshots,
    )

    if name == "wiki_init":
        result = init_wiki(VAULT)
        return {"created_dirs": result.created_dirs, "created_files": result.created_files}

    if name == "wiki_snapshot":
        result = write_snapshots(conn, VAULT, rel_paths=payload.get("rel_paths"))
        return {"files": result.files, "skipped": result.skipped}

    if name == "rag_query":
        chunks = await search_chunks(
            conn, rag, payload.get("query", ""), top_k=int(payload.get("top_k") or 6)
        )
        return {
            "chunks": [
                {
                    "citation": format_citation(c["source_id"], c["rel_path"], c.get("locator")),
                    "text": c["text"][:2500],
                }
                for c in chunks
            ]
        }

    if name == "rag_status":
        return index_stats(conn)

    if name == "wiki_write_page":
        try:
            return write_page(VAULT, payload.get("rel", ""), payload.get("text", ""))
        except (WriteRefused, ValueError, OSError) as exc:
            return {"error": str(exc)}

    if name == "read_page":
        target = VAULT / payload.get("rel", "")
        if not target.is_file():
            return {"error": "нет такого файла"}
        return {"text": target.read_text(encoding="utf-8")}

    if name == "list_wiki":
        wiki = VAULT / "wiki"
        if not wiki.is_dir():
            return {"files": []}
        return {"files": sorted(p.relative_to(VAULT).as_posix() for p in wiki.rglob("*.md"))}

    if name == "wiki_stale":
        report = stale_snapshots(conn, VAULT)
        return {"changed": report.changed, "new": report.new, "gone": report.gone}

    if name == "wiki_edited":
        return edited_pages(VAULT)

    if name == "wiki_checkpoint":
        return {"pages": len(checkpoint_pages(VAULT))}

    return {"error": f"нет инструмента {name}"}


async def drive(conn, rag, instruction: str) -> list[str]:
    """Гоняет модель с инструментами, пока она не закончит. Возвращает журнал."""
    messages = [
        {"role": "system", "content": qa.skill_rules(SKILL)},
        {"role": "user", "content": instruction},
    ]
    trace: list[str] = []

    for turn in range(MAX_TURNS):
        response = await qa.client().chat.completions.create(
            model=qa.ANSWER_MODEL, messages=messages, tools=TOOLS
        )
        message = response.choices[0].message
        if not message.tool_calls:
            trace.append(f"[конец на ходу {turn}] {(message.content or '')[:700]}")
            return trace

        messages.append(message.model_dump(exclude_none=True))
        for call in message.tool_calls:
            try:
                payload = json.loads(call.function.arguments or "{}")
            except json.JSONDecodeError:
                payload = {}
            result = await dispatch(conn, rag, call.function.name, payload)
            note = payload.get("rel") or payload.get("query") or ""
            trace.append(f"{call.function.name} {str(note)[:60]}")
            if "error" in result:
                trace[-1] += f"  -> ОТКАЗ: {result['error'][:130]}"
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": call.id,
                    "content": json.dumps(result, ensure_ascii=False)[:6000],
                }
            )

    trace.append(f"[оборвано на {MAX_TURNS} ходах]")
    return trace


async def main_async(args) -> int:
    from aec_rag.wiki_lint import lint_wiki

    qa.load_env_file(Path(args.env_file))
    qa.VAULT = VAULT
    conn, rag = await qa.open_index_and_db()

    instruction = (
        "Обнови вики проекта по изменениям."
        if args.update
        else "Построй вики проекта по проиндексированным документам."
    )
    print(f"=== {instruction}\n", flush=True)
    for line in await drive(conn, rag, instruction):
        print("  " + line, flush=True)

    print("\n=== что в папке wiki/")
    wiki = VAULT / "wiki"
    for path in sorted(wiki.rglob("*.md")) if wiki.is_dir() else []:
        lines = len(path.read_text(encoding="utf-8").split("\n"))
        print(f"  {path.relative_to(VAULT).as_posix():<52} {lines:>4} строк")

    print("\n=== lint")
    findings = lint_wiki(conn, VAULT)
    if not findings:
        print("  находок нет")
    for finding in findings:
        print(f"  [{finding.severity}] {finding.page}: {finding.detail}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="wiki-e2e")
    parser.add_argument("--update", action="store_true")
    parser.add_argument("--env-file", default=str(qa.DEFAULT_ENV_FILE))
    return asyncio.run(main_async(parser.parse_args(argv)))


if __name__ == "__main__":
    raise SystemExit(main())
