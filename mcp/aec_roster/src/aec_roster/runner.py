"""Запуск их CLI — тонкая часть, которую нельзя проверить без ядра.

Намеренно короткая: всё, что можно решить без процесса, решено в ``ask.py`` и
покрыто тестами. Здесь остаются только сами запуски и границы вокруг них.

ГРАНИЦЫ, И КАЖДАЯ ЕСТЬ РЕШЕНИЕ:

* **без оболочки.** ``shell=False`` (умолчание) — аргументы уходят списком, и
  ни кавычки, ни ``$(...)`` в имени профиля ничего не значат. Текст человека
  сюда не попадает вовсе: он в файле;
* **вопрос пишется во временный файл и удаляется после ответа.** Он содержит то,
  что человек сказал агенту, и лежать на диске дольше разговора ему незачем;
* **срок.** Ход агента может идти долго, но не бесконечно: без срока
  зависший специалист подвесил бы того, кто спросил;
* **вывод не растёт без предела** — читается целиком, но их тихий режим
  печатает ответ и сведения о сессии, а не поток.
"""

from __future__ import annotations

import contextlib
import os
import subprocess
import tempfile
import time
from collections.abc import Iterator
from pathlib import Path

from aec_roster.ask import (
    AskError,
    Reply,
    ask_argv,
    chat_argv,
    parse_chat_id,
    parse_reply,
)

#: Метка сессий, которые интерфейс заводит как постоянный чат специалиста.
#: Та же строка, что в `main/roster.ts` — если разойдутся, обращение начнёт
#: заводить новую сессию вместо продолжения разговора.
CHAT_SOURCE = "aecpilot-roster"

#: Сколько ждём ответа. Ход агента с инструментами идёт минутами; десять — это
#: «долго, но ещё разговор», а не «навсегда».
ASK_TIMEOUT_SECONDS = 600

#: Поиск сессии — это чтение базы, оно быстрое. Если и оно не уложилось,
#: разговаривать всё равно не с кем.
LOOKUP_TIMEOUT_SECONDS = 60


def _run(argv: list[str], timeout: int) -> str:
    try:
        done = subprocess.run(  # noqa: S603 — список аргументов, без оболочки
            argv,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
        )
    except FileNotFoundError as exc:
        raise AskError(f"не нашёлся исполняемый файл ядра: {argv[0]}") from exc
    except subprocess.TimeoutExpired as exc:
        raise AskError(f"специалист не ответил за {timeout} с") from exc

    if done.returncode != 0:
        # Сначала stderr: там причина. stdout в тихом режиме — это ответ.
        why = (done.stderr or done.stdout or "").strip().splitlines()
        raise AskError(why[-1] if why else f"ядро вернуло код {done.returncode}")

    return done.stdout or ""


def find_chat(hermes: str, profile: str) -> str:
    """Постоянный чат специалиста, если он у него уже есть.

    Неудача поиска — это НЕ отказ обращения: разговор начнётся новой сессией.
    Ошибку здесь глотаем сознательно, а не по невнимательности.
    """
    try:
        return parse_chat_id(_run(chat_argv(hermes, profile, CHAT_SOURCE), LOOKUP_TIMEOUT_SECONDS))
    except AskError:
        return ""


def ask(hermes: str, profile: str, question: str) -> Reply:
    """Задаёт специалисту вопрос и возвращает его ответ."""
    text = (question or "").strip()
    if not text:
        raise AskError("вопрос пустой — специалисту нечего ответить")

    handle, path = tempfile.mkstemp(prefix="aec-ask-", suffix=".txt", text=True)
    try:
        with os.fdopen(handle, "w", encoding="utf-8", newline="\n") as file:
            file.write(text)

        return parse_reply(
            _run(ask_argv(hermes, profile, path, find_chat(hermes, profile)), ASK_TIMEOUT_SECONDS)
        )
    finally:
        try:
            os.unlink(path)
        except OSError:
            # Файл уже убрали или каталог недоступен — обращение от этого не
            # становится неудачным, а молча падать на уборке незачем.
            pass


@contextlib.contextmanager
def busy(profile: str) -> Iterator[None]:
    """Один разговор со специалистом за раз.

    ДВЕ ПРИЧИНЫ, И ОБЕ НАСТОЯЩИЕ:

    * **постоянный чат один.** Два ``chat --resume`` в одну и ту же сессию
      сразу — это два хода, пишущих один транскрипт; чинить такое потом
      нечем;
    * **обращения замыкаются в кольцо.** Спросили Смету, Смета спросила
      Электрику, Электрика спросила Смету. Замок разрывает кольцо на третьем
      шаге: занят — значит откажем, и модель услышит об этом словами.

    Замок протухает по сроку самого обращения: дольше него ни один разговор
    не живёт, значит более старый замок принадлежит умершему процессу.
    """
    lock = Path(tempfile.gettempdir()) / f"aec-roster-{profile}.lock"

    try:
        age = time.time() - lock.stat().st_mtime
        if age > ASK_TIMEOUT_SECONDS:
            lock.unlink(missing_ok=True)
    except OSError:
        pass

    try:
        handle = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError as exc:
        raise AskError("уже отвечает на другой вопрос — спросите, когда освободится") from exc
    except OSError as exc:
        # Замок не завёлся по причине окружения (нет прав, нет каталога). Это
        # не повод не разговаривать: без замка хуже, чем с ним, но лучше, чем
        # молчание.
        del exc
        yield
        return

    os.close(handle)
    try:
        yield
    finally:
        try:
            lock.unlink()
        except OSError:
            pass
