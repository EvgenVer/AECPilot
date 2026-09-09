"""Плагин ядра: секрет не уезжает в память ни одним из двух путей (задача 5.3).

Ставится в `$HERMES_HOME/plugins/aec-secret-filter/` (`runtime/register-secret-filter.mjs`)
и вешает ОДИН их хук — `pre_tool_call`. Хук умеет отказать в вызове любого
инструмента, и это единственное место, откуда достаётся ОБА слоя памяти сразу:
встроенный `memory` и инструменты провайдера `mem0_*`, которые в реестре
инструментов не значатся и ходят своей дорогой (`agent/tool_executor.py`:
«These are not in the tool registry — route through MemoryManager»).

ОТКАЗ, А НЕ ВЫРЕЗАНИЕ. Вырезав значение, мы сохранили бы запись, которую человек
не писал, и он бы об этом не узнал. Отказ виден агенту сразу и в его же ходе:
он перескажет факт без секрета — так же, как ведёт себя их собственный сканер
записей памяти, который тоже отказывает, а не правит.

У ЯДРА ЭТОТ ХУК ЗАКРЫВАЕТСЯ ПРИ ТАЙМАУТЕ (`_HOOK_TIMEOUT_FAIL_CLOSED_HOOKS`), то
есть зависший фильтр запрещает запись, а не пропускает её. Нам это подходит:
цена ложного отказа — переписанная фраза, цена пропуска — секрет в памяти
навсегда.
"""

from __future__ import annotations

from typing import Any

from .secrets import find_secrets, refusal_message

# Инструменты, пишущие в память. `memory` — слой 1 (их встроенный), `mem0_*` —
# слой 2. Имена слоя 2 принадлежат их плагину и здесь не переименовываются
# (`specs/agent-memory.md` §«Слой 2»).
_MEMORY_TOOLS = frozenset({"memory", "mem0_add", "mem0_update"})

# Поля, в которых у этих инструментов лежит текст. `operations` — пакетная форма
# их `memory`: без неё пакетная запись прошла бы мимо фильтра целиком.
_TEXT_FIELDS = ("content", "text", "old_text")


def _texts(args: Any) -> list[str]:
    if not isinstance(args, dict):
        return []

    out: list[str] = []
    for field in _TEXT_FIELDS:
        value = args.get(field)
        if isinstance(value, str) and value:
            out.append(value)

    operations = args.get("operations")
    if isinstance(operations, list):
        for op in operations:
            if isinstance(op, dict):
                out.extend(_texts(op))

    return out


def _on_pre_tool_call(tool_name: str = "", args: Any = None, **_: Any) -> dict[str, str] | None:
    if tool_name not in _MEMORY_TOOLS:
        return None

    found: list[str] = []
    for text in _texts(args):
        for name in find_secrets(text):
            if name not in found:
                found.append(name)

    if not found:
        return None

    return {"action": "block", "message": refusal_message(found)}


def register(ctx) -> None:
    ctx.register_hook("pre_tool_call", _on_pre_tool_call)
