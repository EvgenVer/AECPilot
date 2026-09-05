"""Проверки роестра, каким его видит инструмент (задача 3C.7, §Р6).

Здесь пиннится одно правило: имя из чужого текста никогда не становится
аргументом команды. В команду уходит только `name` из снимка.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

import pytest
from aec_roster.ask import AskError
from aec_roster.roster import (
    STALE_AFTER_SECONDS,
    Specialist,
    load,
    resolve,
    snapshot_age_seconds,
)

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


# -- задача 3D.4: молчание снимка — это отказ, а не тишина ---------------------
#
# После переезда роестра на их плагин список рисует ИХ поверхность, а снимок
# кормит опрос в главном процессе. Если опрос встанет, файл останется
# правильным на вид и мёртвым по сути: обращение к живому специалисту вернёт
# «такого нет». Это худший вид отказа — он выглядит ответом.


def _stamp(tmp_path, ago_seconds: float):
    """Снимок с отметкой времени, снятой `ago_seconds` назад."""
    snapshot = tmp_path / "aecpilot-roster.json"
    snapshot.write_text(
        json.dumps({"specialists": [{"name": "smeta", "title": "Смета"}]}),
        encoding="utf-8",
    )
    seen = datetime.now(UTC) - timedelta(seconds=ago_seconds)
    (tmp_path / "aecpilot-roster.json.seen").write_text(seen.isoformat(), encoding="utf-8")
    return snapshot


def test_a_stale_snapshot_says_it_is_stale_not_that_nobody_is_there(tmp_path) -> None:
    snapshot = _stamp(tmp_path, STALE_AFTER_SECONDS + 60)

    with pytest.raises(AskError) as failure:
        resolve(load(snapshot), "Электрика", snapshot_age_seconds(snapshot))

    said = str(failure.value)
    assert "не обновлялся" in said, "устаревший снимок обязан назвать себя устаревшим"
    assert "приложение" in said, "человеку сказано, что проверить"
    # Последний известный список всё равно показывается: он не бесполезен, он
    # просто может быть неполным.
    assert "Смета" in said


def test_a_fresh_snapshot_still_answers_plainly(tmp_path) -> None:
    snapshot = _stamp(tmp_path, 5)

    with pytest.raises(AskError) as failure:
        resolve(load(snapshot), "Электрика", snapshot_age_seconds(snapshot))

    said = str(failure.value)
    assert "нет в роестре" in said
    assert "не обновлялся" not in said, "свежий снимок не должен жаловаться на возраст"


def test_a_hit_does_not_care_how_old_the_snapshot_is(tmp_path) -> None:
    # Возраст меняет ТОЛЬКО текст промаха. Найденного специалиста устаревший
    # снимок не отменяет: он был там, и звать его по-прежнему осмысленно.
    snapshot = _stamp(tmp_path, STALE_AFTER_SECONDS * 10)

    found = resolve(load(snapshot), "Смета", snapshot_age_seconds(snapshot))

    assert found.name == "smeta"


def test_no_stamp_means_we_cannot_judge_freshness_and_do_not_pretend(tmp_path) -> None:
    snapshot = tmp_path / "aecpilot-roster.json"
    snapshot.write_text(json.dumps({"specialists": []}), encoding="utf-8")

    assert snapshot_age_seconds(snapshot) is None

    with pytest.raises(AskError) as failure:
        resolve(load(snapshot), "Смета", snapshot_age_seconds(snapshot))

    # Без отметки поведение прежнее — жаловаться на возраст, которого мы не
    # знаем, значило бы пугать человека догадкой.
    assert "не обновлялся" not in str(failure.value)


def test_a_broken_stamp_is_ignored_rather_than_fatal(tmp_path) -> None:
    snapshot = tmp_path / "aecpilot-roster.json"
    snapshot.write_text(json.dumps({"specialists": []}), encoding="utf-8")
    (tmp_path / "aecpilot-roster.json.seen").write_text("вчера", encoding="utf-8")

    assert snapshot_age_seconds(snapshot) is None
