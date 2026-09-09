"""Задача 5.3 — фильтр секретов на диалогах-фикстурах.

Фикстуры написаны РЕПЛИКАМИ, а не строками: спека говорит про диалог, и вопрос
всегда один — «что агент понесёт в память после такого разговора». Половина
фикстур НЕГАТИВНАЯ (обычные фразы про пароли и ключи), потому что фильтр,
который режет разговор о секретах, отключат в первую неделю, а выключенный
фильтр не защищает ни от чего.
"""

from __future__ import annotations

import pytest
from aec_secret_filter import _on_pre_tool_call
from aec_secret_filter.secrets import find_secrets

# ─── ЧТО ЗАПОМИНАТЬ НЕЛЬЗЯ ────────────────────────────────────────────────────
SECRETS = [
    ("ключ OpenAI", "Ключ проекта: sk-proj-A1b2C3d4E5f6G7h8I9j0K1l2", "openai_key"),
    (
        "токен GitHub",
        "положил ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8 в переменные",
        "github_token",
    ),
    ("ключ AWS", "доступ AKIAIOSFODNN7EXAMPLE к бакету со сканами", "aws_access_key"),
    ("ключ Google", "AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q", "google_api_key"),
    ("токен Slack", "бот подключён по xoxb-1234567890-ABCdefGHIjkl", "slack_token"),
    (
        "закрытый ключ",
        "-----BEGIN RSA PRIVATE KEY-----\nMIIEow...\n-----END RSA PRIVATE KEY-----",
        "private_key",
    ),
    (
        "JWT",
        "сессия eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0."
        "dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk",
        "jwt",
    ),
    (
        "строка подключения",
        "база postgres://aecpilot:Sekret12345@10.0.0.4:5432/objects",
        "connection_string_password",
    ),
    ("заголовок авторизации", "шлём Authorization: Bearer abcdefgh12345678ijkl", "auth_header"),
    ("пароль с названием", "пароль: Qwerty12345!", "labelled_secret"),
    ("api_key с названием", 'api_key = "a1b2c3d4e5f6g7h8"', "labelled_secret"),
]


@pytest.mark.parametrize("label,text,expected", SECRETS, ids=[s[0] for s in SECRETS])
def test_секрет_виден(label: str, text: str, expected: str) -> None:
    assert expected in find_secrets(text), label


# ─── О ЧЁМ ГОВОРИТЬ МОЖНО ─────────────────────────────────────────────────────
# Реплики, в которых слова «пароль», «ключ», «токен» есть, а значения нет. Все
# они — законные факты проекта или человека, и запись обязана пройти.
INNOCENT = [
    ("разговор о пароле", "Пароль от почты храню в менеджере паролей, в переписке не передаю."),
    ("правило про ключи", "Ключи доступа к серверу заказчика выдаёт их админ, а не мы."),
    ("факт проекта", "Заказчик просил закладывать резерв мощности 20% на всех объектах."),
    ("предпочтение человека", "Веду раздел ОВ, отвечай коротко и по делу."),
    ("токен как термин", "Токен в их API живёт час, поэтому длинные выгрузки бьём на части."),
    ("api key без значения", "api_key нужно будет запросить у подрядчика."),
    ("короткое значение", "код подъезда: 1234"),
    ("путь, похожий на ключ", "смета лежит в D:/объекты/секретный-корпус/смета.xlsx"),
]


@pytest.mark.parametrize("label,text", INNOCENT, ids=[s[0] for s in INNOCENT])
def test_обычная_фраза_проходит(label: str, text: str) -> None:
    assert find_secrets(text) == [], label


# ─── ХУК: ОБА СЛОЯ И ОБЕ ФОРМЫ ВЫЗОВА ─────────────────────────────────────────
def test_слой_1_отказ() -> None:
    verdict = _on_pre_tool_call("memory", {"action": "add", "content": "пароль: Qwerty12345!"})

    assert verdict is not None
    assert verdict["action"] == "block"


def test_слой_2_отказ() -> None:
    verdict = _on_pre_tool_call("mem0_add", {"content": "ключ sk-proj-A1b2C3d4E5f6G7h8I9j0K1l2"})

    assert verdict is not None
    assert verdict["action"] == "block"


def test_пакетная_запись_не_проскакивает() -> None:
    # Их `memory` умеет список операций. Без разбора `operations` пакет прошёл
    # бы мимо фильтра целиком — самый дешёвый способ обойти его.
    verdict = _on_pre_tool_call(
        "memory",
        {
            "operations": [
                {"action": "add", "content": "заказчик просил резерв 20%"},
                {"action": "add", "content": "ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8"},
            ]
        },
    )

    assert verdict is not None
    assert verdict["action"] == "block"


def test_замена_смотрит_и_на_старый_текст() -> None:
    verdict = _on_pre_tool_call(
        "memory",
        {"action": "replace", "old_text": "пароль: Qwerty12345!", "content": "пароль сменили"},
    )

    assert verdict is not None


def test_отказ_не_повторяет_сам_секрет() -> None:
    # Иначе значение уехало бы в переписку, из которой его и не пускали.
    verdict = _on_pre_tool_call("mem0_add", {"content": "пароль: Qwerty12345!"})

    assert "Qwerty12345" not in verdict["message"]
    assert "labelled_secret" in verdict["message"]


def test_чужой_инструмент_не_трогаем() -> None:
    # Фильтр стоит на пути ЗАПИСИ В ПАМЯТЬ. Тот же текст в `write_file` — не его
    # дело: там свои правила и свой сканер.
    assert _on_pre_tool_call("write_file", {"content": "пароль: Qwerty12345!"}) is None


def test_обычная_запись_проходит() -> None:
    assert _on_pre_tool_call("memory", {"action": "add", "content": "резерв 20%"}) is None


def test_просьба_человека_фильтр_не_отменяет() -> None:
    # Пограничный случай спеки: «Секрет в тексте, который человек САМ просит
    # запомнить → фильтр всё равно срабатывает». Хук стоит на вызове
    # инструмента и о том, кто попросил, не знает вовсе — проверяем, что это
    # действительно так, а не на словах.
    verdict = _on_pre_tool_call(
        "memory",
        {"action": "add", "content": "запомни мой пароль: Qwerty12345!, я его забываю"},
    )

    assert verdict is not None
    assert verdict["action"] == "block"
