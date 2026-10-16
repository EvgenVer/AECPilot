"""Задача T20.11 (решение владельца 2026-10-16, п. 16): правки агента в поставляемых
навыках AECPilot идут в копию в профиле.

ПОЧЕМУ. Наши навыки (`aec-qa`, `aec-wiki`) ядро читает из папки программы —
`skills.external_dirs` указывает на `skills/` репозитория, а после установки — на
папку приложения. `skill_manage` правит навык там, где его нашёл, то есть в папке
программы: правка теряется при обновлении, может быть запрещена (Program Files),
молча меняет поведение во всех проектах и в разработке попадает в git (2026-10-16
тестовая модель так переписала `skills/aec-wiki/SKILL.md`).

КАК. Ядро ищет навык сначала в профиле (`<HERMES_HOME>/skills`), потом во внешних
папках (`tools/skill_manager_tool.py::_find_skill`, порядок
`agent/skill_utils.get_all_skills_dirs`; замер `runtime/skill-priority-probe.mjs`:
навык профиля перекрывает одноимённый внешний и в списке навыков). Поэтому перед
первой правкой поставляемого навыка он копируется в профиль, и вызов уходит в
копию. Удалить поставляемый навык нельзя; удаление копии возвращает исходный.

Где папка поставляемых навыков, говорит файл `shipped-skills.json` рядом с плагином —
его пишет установка фильтра (`runtime/register-secret-filter.mjs`).
"""

from __future__ import annotations

import json
import logging
import shutil
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

SHIPPED_FILE = "shipped-skills.json"
WRITE_ACTIONS = frozenset({"edit", "patch", "write_file", "remove_file"})

DELETE_REFUSAL = (
    "Это навык AECPilot из поставки: удалить его нельзя. Править можно — правка пойдёт "
    "в копию навыка в профиле, а исходный останется нетронутым."
)
COPY_REFUSAL = (
    "Навык AECPilot из поставки правится только в копии в профиле, а копию создать не "
    "удалось — правка не выполнена, чтобы не менять файлы программы."
)


def shipped_root(plugin_dir: Path | None = None) -> Path | None:
    """Папка поставляемых навыков или None (файла нет — правки не перенаправляются)."""
    marker = (plugin_dir or Path(__file__).parent) / SHIPPED_FILE
    try:
        raw = json.loads(marker.read_text(encoding="utf-8")).get("dir")
    except (OSError, ValueError, AttributeError):
        return None
    if not isinstance(raw, str) or not raw:
        return None
    root = Path(raw)
    return root if root.is_dir() else None


def _frontmatter_name(skill_md: Path) -> str:
    try:
        lines = skill_md.read_text(encoding="utf-8-sig").splitlines()
    except OSError:
        return ""
    if not lines or lines[0].strip() != "---":
        return ""
    for line in lines[1:]:
        if line.strip() == "---":
            break
        if line.startswith("name:"):
            return line.split(":", 1)[1].strip().strip("'\"")
    return ""


def _find(root: Path, name: str, depth: int) -> Path | None:
    """Навык с этим именем папки или `name:` в заголовке — не глубже `depth` уровней."""
    candidates = [root]
    for _ in range(depth):
        nxt: list[Path] = []
        for base in candidates:
            try:
                children = [p for p in base.iterdir() if p.is_dir()]
            except OSError:
                continue
            for child in children:
                skill_md = child / "SKILL.md"
                if skill_md.is_file() and (
                    child.name == name or _frontmatter_name(skill_md) == name
                ):
                    return child
                nxt.append(child)
        candidates = nxt
    return None


def before_skill_write(
    args: Any, home: Path, plugin_dir: Path | None = None
) -> dict[str, str] | None:
    """Вызывается перед `skill_manage`. None — пропустить вызов, dict — отказ ядра."""
    if isinstance(args, str):
        try:
            args = json.loads(args)
        except ValueError:
            return None
    if not isinstance(args, dict):
        return None
    action = args.get("action")
    name = args.get("name")
    if action not in WRITE_ACTIONS and action != "delete":
        return None
    if not isinstance(name, str) or not name or "/" in name or "\\" in name:
        return None

    root = shipped_root(plugin_dir)
    if root is None:
        return None
    shipped = _find(root, name, depth=1)
    if shipped is None:
        return None

    local_root = home / "skills"
    if _find(local_root, name, depth=2) is not None:
        return None  # копия уже есть — ядро найдёт её первой

    if action == "delete":
        return {"action": "block", "message": DELETE_REFUSAL}

    try:
        shutil.copytree(
            shipped, local_root / shipped.name, ignore=shutil.ignore_patterns("__pycache__")
        )
    except OSError as error:
        logger.warning("aec-secret-filter: копия навыка %s не создана (%s)", shipped.name, error)
        return {"action": "block", "message": COPY_REFUSAL}
    logger.info("aec-secret-filter: навык %s скопирован в профиль для правки", shipped.name)
    return None
