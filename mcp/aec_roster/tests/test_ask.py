"""Проверки чистой части обращения (задача 3C.7, контракт — specs/agent-roster.md §Р6).

Главное, что здесь пиннится, — разбор ИХ вывода. Он замерен вживую на 0.20.5, и
если следующая версия ядра его изменит, упадёт этот файл, а не поведение у
человека.
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
    signed,
)

DIM = "\x1b[2;3m"
RESET = "\x1b[0m"


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


def test_reasoning_is_dropped_by_their_own_marker() -> None:
    # Ровно та форма, что замерена: размышление помечено тускло-курсивной
    # последовательностью, ответ — нет.
    stdout = (
        f"{DIM}The user asks for the capital of Italy.{RESET}\r\n"
        "\r\n"
        "session_id: 20260823_175839_18a063\r\n"
        f"{DIM}I'll say Rome.{RESET}\r\n"
        "Рим\r\n"
    )

    reply = parse_reply(stdout)

    assert reply.answer == "Рим"
    assert reply.session_id == "20260823_175839_18a063"


def test_multi_line_answer_survives_whole() -> None:
    stdout = "session_id: с-1\r\nПервая строка\r\nВторая строка\r\n"

    assert parse_reply(stdout).answer == "Первая строка\nВторая строка"


def test_everything_before_the_session_line_is_service_noise() -> None:
    stdout = "Config ref: что-то про окружение\r\nsession_id: с-1\r\nОтвет\r\n"

    assert parse_reply(stdout).answer == "Ответ"


def test_silence_is_an_error_with_words() -> None:
    with pytest.raises(AskError):
        parse_reply("session_id: с-1\r\n")
    with pytest.raises(AskError):
        parse_reply("")


def test_answer_carries_who_said_it() -> None:
    assert signed("четыре", "smeta", "Смета").startswith("Смета отвечает:")
    # Без подписи — имя профиля: реплика ниоткуда хуже некрасивого имени.
    assert signed("четыре", "smeta").startswith("smeta отвечает:")
