"""Проверки роестра, каким его видит инструмент (задача 3C.7, §Р6).

Здесь пиннится одно правило: имя из чужого текста никогда не становится
аргументом команды. В команду уходит только `name` из снимка.
"""

from __future__ import annotations

import json

import pytest
from aec_roster.ask import AskError
from aec_roster.roster import Specialist, load, resolve

ROSTER = [Specialist("smeta", "Смета"), Specialist("normokontrol", "Нормоконтроль")]


def write(tmp_path, data) -> str:
    path = tmp_path / "roster.json"
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return str(path)


def test_missing_snapshot_is_an_empty_roster_not_a_crash(tmp_path) -> None:
    assert load(str(tmp_path / "нет-такого.json")) == []


def test_snapshot_gives_profile_name_and_shown_name(tmp_path) -> None:
    path = write(tmp_path, {"specialists": [{"name": "smeta", "title": " Смета "}]})

    assert load(path) == [Specialist("smeta", "Смета")]


def test_rows_without_a_profile_name_are_skipped(tmp_path) -> None:
    path = write(tmp_path, {"specialists": [{"title": "Ничей"}, "мусор", {"name": "smeta"}]})

    assert load(path) == [Specialist("smeta", "")]


def test_broken_snapshot_says_so(tmp_path) -> None:
    path = tmp_path / "roster.json"
    path.write_text("{не json", encoding="utf-8")

    with pytest.raises(AskError):
        load(str(path))


def test_called_by_the_name_on_screen() -> None:
    assert resolve(ROSTER, "Смета").name == "smeta"
    assert resolve(ROSTER, "@смета").name == "smeta"
    assert resolve(ROSTER, "smeta").name == "smeta"


def test_spaces_in_a_title_become_the_dash_the_hint_inserts() -> None:
    # Ровно как в `mentions-pure.ts::mentionHandle` — иначе подсказка предложит
    # имя, на которое инструмент не отзывается.
    assert resolve([Specialist("gip", "Главный инженер")], "@Главный-инженер").name == "gip"


def test_unknown_name_answers_with_the_list_instead_of_running_anything() -> None:
    with pytest.raises(AskError) as failure:
        resolve(ROSTER, "Бухгалтерия")

    assert "Смета" in str(failure.value)
    assert "Нормоконтроль" in str(failure.value)


def test_empty_roster_says_it_is_empty() -> None:
    with pytest.raises(AskError) as failure:
        resolve([], "кто-нибудь")

    assert "пуст" in str(failure.value)


def test_a_snapshot_that_smuggles_a_bad_profile_name_is_still_refused() -> None:
    # Снимок пишем мы — но файл на диске это не доказательство. Имя проверяется
    # по форме даже когда оно пришло «из своих».
    smuggled = [Specialist("../побег", "Смета")]

    with pytest.raises(AskError):
        resolve(smuggled, "Смета")
