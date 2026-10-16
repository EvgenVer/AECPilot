"""Задача T20.11: правка поставляемого навыка уходит в копию в профиле — на функциях ядра.

Тот же порядок, что у хода агента: наш хук `pre_tool_call` (из плагина, установленного
в профиль), затем `skill_manage(action='patch')` ядра; после — `skill_view` ядра.
Проверяется: копия в профиле изменилась, поставляемый навык не тронут, `skill_view`
отдаёт копию, а удаление поставляемого навыка отклоняется.

Безопасность (урок T20.9): работает только на временной копии профиля
(`AEC_HERMES_HOME` с префиксом `aecpilot-acceptance-profile-`) и только с копией навыков
(`AEC_SKILLS_DIR` вне репозитория) — в конфиге профиля пути к `skills/` репозитория
заменяются этой копией, как это делает `apps/desktop/e2e/lib/core.ts`.

Usage: AEC_HERMES_HOME=<копия профиля> AEC_SKILLS_DIR=<копия skills/> \
       runtime/.hermes-venv/Scripts/python.exe runtime/skill-copy-probe.py
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
HOME = Path(os.environ.get("AEC_HERMES_HOME", ""))
SHIPPED = Path(os.environ.get("AEC_SKILLS_DIR", ""))

if "aecpilot-acceptance-profile-" not in str(HOME) or not SHIPPED.is_dir():
    print("refusing: needs a temporary profile copy and AEC_SKILLS_DIR")
    sys.exit(2)
if SHIPPED.resolve().is_relative_to(REPO):
    print("refusing: AEC_SKILLS_DIR must be a copy outside the repository")
    sys.exit(2)

os.environ["HERMES_HOME"] = str(HOME)
config = HOME / "config.yaml"
repo_skills = str((REPO / "skills").resolve()).lower()
lines = []
for line in config.read_text(encoding="utf-8").splitlines():
    stripped = line.strip()
    if stripped.startswith("- "):
        value = stripped[2:].strip().strip("'\"").replace("\\\\", "\\")
        if value and str(Path(value).resolve()).lower() == repo_skills:
            line = line[: line.index("-")] + f"- {SHIPPED}"
    lines.append(line)
config.write_text("\n".join(lines) + "\n", encoding="utf-8")

plugin_dir = HOME / "plugins" / "aec-secret-filter"
marker = json.loads((plugin_dir / "shipped-skills.json").read_text(encoding="utf-8"))
assert Path(marker["dir"]) == SHIPPED, f"plugin points at {marker['dir']}, expected {SHIPPED}"

sys.path.insert(0, str(REPO / "runtime" / ".hermes-src"))
sys.path.insert(0, str(HOME / "plugins"))
import importlib.util  # noqa: E402

spec = importlib.util.spec_from_file_location(
    "aec_secret_filter", plugin_dir / "__init__.py", submodule_search_locations=[str(plugin_dir)]
)
plugin = importlib.util.module_from_spec(spec)
sys.modules["aec_secret_filter"] = plugin
spec.loader.exec_module(plugin)

from tools.skill_manager_tool import skill_manage  # noqa: E402
from tools.skills_tool import skill_view  # noqa: E402

NAME = "aec-wiki"
shipped_md = SHIPPED / NAME / "SKILL.md"
before = hashlib.sha256(shipped_md.read_bytes()).hexdigest()
text = shipped_md.read_text(encoding="utf-8")
old = next(line for line in text.splitlines() if line.startswith("# "))
new = old + " (probe)"

failed = False

args = {"action": "patch", "name": NAME, "old_string": old, "new_string": new}
hook = plugin._on_pre_tool_call(tool_name="skill_manage", args=args)
print("hook on patch:", hook)
result = json.loads(skill_manage(**args))
shown = {k: result.get(k) for k in ("success", "error", "path") if k in result}
print("skill_manage patch:", shown)

copy_md = HOME / "skills" / NAME / "SKILL.md"
if not copy_md.is_file() or new not in copy_md.read_text(encoding="utf-8"):
    print("FAIL: the copy in the profile was not patched")
    failed = True
if hashlib.sha256(shipped_md.read_bytes()).hexdigest() != before:
    print("FAIL: the shipped skill changed")
    failed = True

viewed = json.loads(skill_view(NAME))
if new not in json.dumps(viewed, ensure_ascii=False):
    print("FAIL: skill_view does not return the profile copy")
    failed = True

# Удаление: копия есть — удаляется копия; без копии — отказ хука.
import shutil  # noqa: E402

shutil.rmtree(HOME / "skills" / NAME)
delete_args = {"action": "delete", "name": NAME}
refusal = plugin._on_pre_tool_call(tool_name="skill_manage", args=delete_args)
print("hook on delete without a copy:", refusal and refusal.get("action"))
if not refusal or refusal.get("action") != "block":
    print("FAIL: deleting the shipped skill was not refused")
    failed = True

print("RESULT: FAIL" if failed else "RESULT: PASS — the edit went to the profile copy")
sys.exit(1 if failed else 0)
