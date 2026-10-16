"""T20.11: правка поставляемого навыка идёт в копию в профиле."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from aec_secret_filter import shipped_skills


def _skill(root: Path, dir_name: str, name: str | None = None, body: str = "исходный") -> Path:
    skill = root / dir_name
    skill.mkdir(parents=True)
    (skill / "SKILL.md").write_text(
        f"---\nname: {name or dir_name}\ndescription: d\n---\n{body}\n", encoding="utf-8"
    )
    (skill / "references").mkdir()
    (skill / "references" / "note.md").write_text("справка", encoding="utf-8")
    return skill


@pytest.fixture
def layout(tmp_path: Path) -> dict[str, Path]:
    shipped = tmp_path / "program" / "skills"
    _skill(shipped, "aec-wiki")
    home = tmp_path / "profile"
    home.mkdir()
    plugin = tmp_path / "plugin"
    plugin.mkdir()
    (plugin / shipped_skills.SHIPPED_FILE).write_text(
        json.dumps({"dir": str(shipped)}), encoding="utf-8"
    )
    return {"shipped": shipped, "home": home, "plugin": plugin}


def test_правка_копирует_навык_в_профиль_и_уходит_туда(layout: dict[str, Path]) -> None:
    answer = shipped_skills.before_skill_write(
        {"action": "patch", "name": "aec-wiki", "old_string": "a", "new_string": "b"},
        layout["home"],
        layout["plugin"],
    )

    assert answer is None, "вызов пропускается — ядро найдёт копию первой"
    copy = layout["home"] / "skills" / "aec-wiki"
    assert (copy / "SKILL.md").read_text(encoding="utf-8").endswith("исходный\n")
    assert (copy / "references" / "note.md").is_file(), "копируется навык целиком"


def test_вторая_правка_копию_не_пересоздаёт(layout: dict[str, Path]) -> None:
    args = {"action": "edit", "name": "aec-wiki", "content": "x"}
    shipped_skills.before_skill_write(args, layout["home"], layout["plugin"])
    copy_md = layout["home"] / "skills" / "aec-wiki" / "SKILL.md"
    copy_md.write_text("правка агента", encoding="utf-8")

    assert shipped_skills.before_skill_write(args, layout["home"], layout["plugin"]) is None
    assert copy_md.read_text(encoding="utf-8") == "правка агента", "копия не перетирается"


def test_удалить_поставляемый_нельзя_а_копию_можно(layout: dict[str, Path]) -> None:
    args = {"action": "delete", "name": "aec-wiki"}
    answer = shipped_skills.before_skill_write(args, layout["home"], layout["plugin"])
    assert answer == {"action": "block", "message": shipped_skills.DELETE_REFUSAL}
    assert not (layout["home"] / "skills").exists(), "отказ ничего не копирует"

    shipped_skills.before_skill_write(
        {"action": "patch", "name": "aec-wiki"}, layout["home"], layout["plugin"]
    )
    assert shipped_skills.before_skill_write(args, layout["home"], layout["plugin"]) is None


def test_чужие_навыки_и_прочие_действия_не_трогаются(layout: dict[str, Path]) -> None:
    for args in (
        {"action": "patch", "name": "my-own-skill"},
        {"action": "create", "name": "aec-wiki", "content": "x"},
        {"action": "patch", "name": "category/aec-wiki"},
        {"action": "patch"},
        "не json",
        None,
    ):
        assert shipped_skills.before_skill_write(args, layout["home"], layout["plugin"]) is None
    assert not (layout["home"] / "skills").exists()


def test_имя_из_заголовка_тоже_узнаётся(tmp_path: Path) -> None:
    shipped = tmp_path / "skills"
    _skill(shipped, "wiki-dir", name="aec-wiki")
    plugin = tmp_path / "plugin"
    plugin.mkdir()
    (plugin / shipped_skills.SHIPPED_FILE).write_text(json.dumps({"dir": str(shipped)}))
    home = tmp_path / "home"

    shipped_skills.before_skill_write({"action": "patch", "name": "aec-wiki"}, home, plugin)

    assert (home / "skills" / "wiki-dir" / "SKILL.md").is_file()


def test_без_файла_поставки_ничего_не_перенаправляется(tmp_path: Path) -> None:
    answer = shipped_skills.before_skill_write(
        {"action": "patch", "name": "aec-wiki"}, tmp_path / "home", tmp_path
    )
    assert answer is None
    assert not (tmp_path / "home").exists()


def test_копия_не_создалась_правка_отклоняется(
    layout: dict[str, Path], monkeypatch: pytest.MonkeyPatch
) -> None:
    def broken(*_args: object, **_kw: object) -> None:
        raise OSError("диск недоступен")

    monkeypatch.setattr(shipped_skills.shutil, "copytree", broken)
    answer = shipped_skills.before_skill_write(
        {"action": "patch", "name": "aec-wiki"}, layout["home"], layout["plugin"]
    )
    assert answer == {"action": "block", "message": shipped_skills.COPY_REFUSAL}


def test_хук_фильтра_зовёт_перенаправление(
    layout: dict[str, Path], monkeypatch: pytest.MonkeyPatch
) -> None:
    import sys
    import types

    import aec_secret_filter

    fake = types.ModuleType("hermes_constants")
    fake.get_hermes_home = lambda: layout["home"]  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "hermes_constants", fake)
    seen: list[object] = []
    monkeypatch.setattr(
        shipped_skills,
        "before_skill_write",
        lambda args, home, plugin_dir=None: seen.append((args, home)),
    )

    aec_secret_filter._on_pre_tool_call(tool_name="skill_manage", args={"action": "patch"})

    assert seen == [({"action": "patch"}, layout["home"])]
