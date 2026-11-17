"""Задача T78 (UR52, решение владельца 2026-11-17): файловые инструменты агента не
пишут, не удаляют и не переносят файлы внутри подключённых папок источников.

Источники — оригиналы заказчика. Сервер `aec-sources` только читает по
построению, но у агента есть и свои файловые инструменты ядра (`write_file`,
`patch`), которые пишут куда угодно, куда пустит ОС. Здесь они получают отказ
словами, если цель лежит в папке источника. Терминал этим хуком не закрыть
(команду оболочки по путям не разобрать надёжно) — для него правило в навыке.

Папки источников берутся из `.aecpilot/project.json` проекта, в котором работает
агент: его рабочая папка и есть хранилище проекта (задача 1.20). Нет файла —
нет источников — нет запрета.
"""

from __future__ import annotations

import json
import os
import re
from collections.abc import Callable
from pathlib import Path
from typing import Any

_WRITE_TOOLS = frozenset({"write_file", "patch"})

# V4A-заплатка (`patch` в режиме `patch`): цели названы в заголовках. Образцы —
# те же, что у разборщика ядра (`tools/patch_parser.py`, `_OP_MARKERS`): что
# разберёт ядро, то обязан увидеть и страж. Перенос (`Move File: a -> b`) —
# запрещены обе стороны: вынести файл из источника значит удалить его там.
# `Move to:` — старый вид заголовка переноса; оставлен на случай подъёма пина.
_V4A_HEADER = re.compile(r"^\*\*\*\s*(?:Update|Add|Delete)\s+File:\s*(.+?)\s*$", re.MULTILINE)
_V4A_MOVE = re.compile(r"^\*\*\*\s*Move\s+File:\s*(.+?)\s*->\s*(.+?)\s*$", re.MULTILINE)
_V4A_MOVE_TO = re.compile(r"^\*\*\*\s*Move\s+to\s*:\s*(.+?)\s*$", re.MULTILINE)


def _targets(tool_name: str, args: Any) -> list[str]:
    if not isinstance(args, dict):
        return []
    out: list[str] = []
    path = args.get("path")
    if isinstance(path, str) and path.strip():
        out.append(path.strip())
    if tool_name == "patch":
        text = args.get("patch")
        if isinstance(text, str):
            text = text.replace("\r\n", "\n")
            out.extend(match.group(1) for match in _V4A_HEADER.finditer(text))
            out.extend(match.group(1) for match in _V4A_MOVE_TO.finditer(text))
            for match in _V4A_MOVE.finditer(text):
                out.extend((match.group(1), match.group(2)))
    return out


def _real(path: Path) -> str:
    try:
        return os.path.normcase(os.path.realpath(path))
    except (OSError, ValueError):
        return os.path.normcase(os.path.abspath(path))


def _is_under(path: str, root: str) -> bool:
    try:
        return os.path.commonpath([path, root]) == root
    except ValueError:  # другой диск на Windows
        return False


def source_roots(vault: Path) -> list[tuple[str, str]]:
    """``(как записано, настоящий путь)`` каждой папки источника проекта."""
    try:
        config = json.loads((vault / ".aecpilot" / "project.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    if not isinstance(config, dict):
        return []
    roots: list[tuple[str, str]] = []
    for source in config.get("sources") or []:
        root = source.get("root_path") if isinstance(source, dict) else None
        if isinstance(root, str) and root:
            roots.append((root, _real(Path(root))))
    return roots


def refusal(root: str) -> str:
    return (
        f"Запись в папку источника запрещена: {root} — это исходные документы заказчика, "
        "их можно только читать. Сохраните результат в хранилище проекта (например, в "
        "workspace/) и сошлитесь на исходный файл."
    )


def before_file_write(
    tool_name: str, args: Any, *, resolve: Callable[[str], Path]
) -> dict[str, str] | None:
    """Отказ, если файловый инструмент пишет в папку источника; иначе ``None``.

    ``resolve`` приводит путь из аргументов к абсолютному так же, как это сделает
    сам инструмент: относительный — от рабочей папки сеанса.
    """
    if tool_name not in _WRITE_TOOLS:
        return None
    targets = _targets(tool_name, args)
    if not targets:
        return None
    roots = source_roots(resolve("."))
    if not roots:
        return None
    for raw in targets:
        try:
            target = _real(resolve(raw))
        except (OSError, ValueError, RuntimeError):
            continue
        for written, real in roots:
            if _is_under(target, real) or _is_under(target, os.path.normcase(written)):
                return {"action": "block", "message": refusal(written)}
    return None


def core_resolver(task_id: str) -> Callable[[str], Path]:
    """Путь так, как его разрешит файловый инструмент ядра для этой задачи.

    `_resolve_path_for_task` — внутренний помощник ядра; если подъём пина его
    переименует, берётся рабочая папка процесса — тот же ответ для сеанса окна,
    чья папка и есть хранилище.
    """

    def resolve(raw: str) -> Path:
        try:
            from tools.file_tools_paths import _resolve_path_for_task

            return Path(_resolve_path_for_task(raw, task_id or "default"))
        except ImportError:
            base = os.environ.get("TERMINAL_CWD") or os.getcwd()
            candidate = Path(os.path.expanduser(raw))
            return candidate if candidate.is_absolute() else Path(base) / candidate

    return resolve
