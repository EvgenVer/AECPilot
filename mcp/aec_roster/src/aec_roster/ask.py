"""Как один специалист спрашивает другого — чистая часть, без запуска процессов.

Здесь живёт всё, что можно проверить, не поднимая ядро: как собирается команда,
как из её вывода достаётся ответ и где проходит граница между размышлением
модели и самим ответом. Запуск — в ``runner.py``, и он намеренно тонкий: то, что
трудно проверить, должно быть коротким.

ЗАМЕРЕНО НА ЯДРЕ 0.20.5 (specs/agent-roster.md §Р6, «Транспорт»):

* ``chat -Q`` — программный режим: без него ответ приходит внутри рамки из
  псевдографики, и разбирать её пришлось бы гаданием;
* идентификатор сессии выводится отдельной строкой ``session_id: <…>``;
* строки размышления модели помечены тускло-курсивной escape-последовательностью,
  а сам ответ — нет. Это единственный признак, отделяющий одно от другого,
  поэтому разметка снимается ПОСЛЕ разбора, а не до него.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

#: Имя профиля годится в путь и в аргумент. Правило то же, что в интерфейсе
#: (``roster-pure.ts``): имя приходит из роестра, но проверяется всё равно —
#: аргумент, собранный из непроверенных данных, это привычка, а не случай.
NAME = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$")

#: Тускло-курсивное начало строки размышления. Их метка, не наша.
REASONING_PREFIX = "\x1b[2;3m"

#: Любая escape-последовательность — снимается уже после того, как строки
#: разобраны по признаку выше.
ANSI = re.compile(r"\x1b\[[0-9;]*m")

#: Идентификатор сессии в их выводе: ``session_id: 20260823_175839_18a063``.
SESSION_LINE = re.compile(r"^session_id:\s*(\S+)\s*$")

#: Он же в таблице ``sessions list`` — последний столбец строки.
SESSION_ID = re.compile(r"\b\d{8}_\d{6}_[0-9a-f]{6}\b")


class AskError(Exception):
    """Обращение не состоялось, и человеку надо сказать почему."""


@dataclass(frozen=True)
class Reply:
    """Что вернулось от специалиста."""

    answer: str
    session_id: str


def check_name(name: str) -> str:
    """Возвращает имя или объясняет, почему оно не годится."""
    cleaned = (name or "").strip()
    if not NAME.match(cleaned):
        raise AskError(
            f"«{cleaned}» не похоже на имя специалиста: "
            "латинские буквы, цифры, дефис и подчёркивание, начиная с буквы или цифры"
        )
    return cleaned


def ask_argv(hermes: str, profile: str, query_file: str, resume: str = "") -> list[str]:
    """Команда обращения.

    Текста человека здесь нет вовсе — он в файле. Это и есть главное отличие от
    пути, с которого начинал донор: их команда собиралась из текста, и они же
    потом от этого ушли.
    """
    argv = [hermes, "-p", profile, "chat", "-Q", "--query-file", query_file]
    if resume:
        argv += ["--resume", resume]
    return argv


def chat_argv(hermes: str, profile: str, source: str) -> list[str]:
    """Команда поиска постоянного чата специалиста — по метке источника.

    Тот же опознавательный знак, что и в интерфейсе (задача 3C.4б): не заголовок,
    потому что заголовок переименовывает автоименователь модели.
    """
    return [hermes, "-p", profile, "sessions", "list", "--source", source, "--limit", "1"]


def parse_chat_id(stdout: str) -> str:
    """Идентификатор постоянного чата из таблицы ``sessions list``.

    Пусто — значит чата ещё нет: обращение заведёт новый, и это правильный
    исход, а не сбой.
    """
    found = SESSION_ID.search(ANSI.sub("", stdout or ""))
    return found.group(0) if found else ""


def parse_reply(stdout: str) -> Reply:
    """Ответ специалиста и сессия, в которой он его дал.

    Строки размышления отбрасываются по ИХ метке — до снятия разметки. Наоборот
    не выйдет: снимешь разметку раньше и потеряешь единственный признак, по
    которому размышление отличается от ответа.
    """
    session_id = ""
    answer: list[str] = []
    seen_marker = False

    for raw in (stdout or "").splitlines():
        line = raw.rstrip("\r")

        if line.startswith(REASONING_PREFIX):
            continue

        plain = ANSI.sub("", line).rstrip()

        marker = SESSION_LINE.match(plain)
        if marker:
            session_id = marker.group(1)
            seen_marker = True
            # Всё, что было до этой строки, — служебное; ответ идёт после.
            answer.clear()
            continue

        if seen_marker and plain.strip():
            answer.append(plain)

    text = "\n".join(answer).strip()
    if not text:
        raise AskError("специалист не ответил ничего")

    return Reply(answer=text, session_id=session_id)


def signed(answer: str, name: str, title: str = "") -> str:
    """Ответ с подписью того, кто его дал.

    Без подписи в переписке появляется реплика ниоткуда: спрашивал один агент,
    отвечал другой, а выглядит как продолжение мысли первого.
    """
    who = title.strip() or name
    return f"{who} отвечает:\n\n{answer}"
