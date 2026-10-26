"""Проверки чистой части обращения (задача 3C.7, контракт — docs/history/specs/agent-roster.md §Р6).

Главное, что здесь пиннится, — разбор ИХ вывода. Он замерен вживую на 0.20.5, и
если следующая версия ядра его изменит, упадёт этот файл, а не поведение у
человека.

Формы взяты из настоящих прогонов, а не придуманы: служебная строка ядра в
начале stdout, рамка «Reasoning» и строки размышления с их тускло-курсивной
меткой, ответ без метки — и `session_id` в ДРУГОМ потоке.
"""

from __future__ import annotations

import pytest
from aec_roster.ask import (
    AskError,
    ask_argv,
    chat_argv,
    check_name,
    parse_chat_id,
    parse_reply,
    parse_session_id,
    signed,
)

DIM = "\x1b[2;3m"
RESET = "\x1b[0m"

# Ровно то, что печатает ядро рядом с ответом (замерено).
SERVICE = "Warning: Unknown toolsets: a2a\r\n"
STDERR = (
    "Config ref '${env:OPENAI_API_KEY}': OPENAI_API_KEY is not set; keeping the placeholder\r\n"
    "\r\n"
    "session_id: 20260823_195609_95e5b3\r\n"
)


def test_question_never_reaches_the_command_line() -> None:
    argv = ask_argv("hermes", "smeta", "/tmp/q.txt")

    assert argv == ["hermes", "-p", "smeta", "chat", "-Q", "--query-file", "/tmp/q.txt"]
    # Ни одного аргумента с текстом вопроса — он в файле, и это вся защита.
    assert not any("?" in part or " " in part for part in argv)


def test_permanent_chat_is_continued_when_it_exists() -> None:
    assert ask_argv("hermes", "smeta", "/tmp/q.txt", "20260823_175839_18a063")[-2:] == [
        "--resume",
        "20260823_175839_18a063",
    ]


def test_name_is_checked_even_though_it_comes_from_the_roster() -> None:
    assert check_name("  smeta ") == "smeta"
    assert check_name("smeta-2") == "smeta-2"

    for bad in ("../побег", "a b", "", "-начинается-с-дефиса", "смета"):
        with pytest.raises(AskError):
            check_name(bad)


def test_permanent_chat_is_found_by_source_not_by_title() -> None:
    argv = chat_argv("hermes", "smeta", "aecpilot-roster")
    assert argv[-4:] == ["--source", "aecpilot-roster", "--limit", "1"]


def test_chat_id_is_read_out_of_their_table() -> None:
    table = (
        "Title                Workspace   Last Active   ID\n"
        "─────────────────────────────────────────────────\n"
        "Смета                runtime     1h ago        20260823_161408_3f1264\n"
    )
    assert parse_chat_id(table) == "20260823_161408_3f1264"


def test_no_permanent_chat_yet_is_an_answer_not_a_failure() -> None:
    assert parse_chat_id("Title  Workspace  Last Active  ID\n") == ""
    assert parse_chat_id("") == ""


def test_the_session_line_lives_in_the_other_stream() -> None:
    # Замерено: `session_id:` печатается в stderr. Разбор, искавший его в
    # stdout, на живом запуске не находил ответа вовсе — и это было молчание,
    # а не ошибка.
    assert parse_session_id(STDERR) == "20260823_195609_95e5b3"
    assert parse_session_id("") == ""


def test_reasoning_and_their_prologue_are_dropped_by_measured_marks() -> None:
    stdout = (
        SERVICE
        + "\r\n"
        + f"{DIM}┌─ Reasoning ───────────────────────────────┐{RESET}\r\n"
        + f"{DIM}**Considering the question**{RESET}\r\n"
        + f"{DIM}{RESET}\r\n"
        + f"{DIM}Two plus two is four.{RESET}\r\n"
        + "четыре\r\n"
    )

    reply = parse_reply(stdout, STDERR)

    assert reply.answer == "четыре"
    assert reply.session_id == "20260823_195609_95e5b3"


def test_multi_line_answer_survives_whole_with_its_own_blank_lines() -> None:
    stdout = SERVICE + "\r\nПервая строка\r\n\r\nВторая строка\r\n"

    assert parse_reply(stdout, "").answer == "Первая строка\n\nВторая строка"


def test_a_warning_inside_the_answer_belongs_to_the_specialist() -> None:
    # Отбрасывается только вступление. Такая же строка ПОСЛЕ начала ответа —
    # это слова специалиста, и съесть их было бы хуже, чем оставить лишнее.
    stdout = SERVICE + "Смотри смету:\r\nWarning: перерасход по разделу 5\r\n"

    assert parse_reply(stdout, "").answer == "Смотри смету:\nWarning: перерасход по разделу 5"


def test_silence_is_an_error_with_words() -> None:
    with pytest.raises(AskError):
        parse_reply(SERVICE, STDERR)
    with pytest.raises(AskError):
        parse_reply("", "")


def test_answer_carries_who_said_it() -> None:
    assert signed("четыре", "smeta", "Смета").startswith("Смета отвечает:")
    # Без подписи — имя профиля: реплика ниоткуда хуже некрасивого имени.
    assert signed("четыре", "smeta").startswith("smeta отвечает:")
