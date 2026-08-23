"""Кого можно позвать — роестр специалистов, каким его видит инструмент.

ПОЧЕМУ СНИМОК, А НЕ ЗАПРОС. Имя специалиста на экране («Смета») и имя его
профиля в ядре (`smeta`) — разные вещи, и связь между ними лежит в `ui_meta`
профиля. У `ui_meta` ровно одна дверь — шлюз (замерено: в ядре 0.20.5 `ui_meta`
встречается только в `tui_gateway/**`, ни одна команда CLI его не читает), а
токен шлюза этому инструменту не даётся сознательно (specs/agent-roster.md §Р6,
пункт 4). Значит роестр приносит сюда тот, кто им владеет: главный процесс
кладёт снимок файлом рядом с настройками ядра, а инструмент его читает.

Тот же приём, что у `aec-sources`: там приложение ведёт `project.json`, здесь —
роестр. Ни новой зависимости, ни второго источника правды: снимок
перезаписывается из того же ответа `profiles.list`, из которого нарисован список
на экране.

СНИМОК УСТАРЕВАЕТ — И ЭТО НЕ ОШИБКА. Если специалиста переименовали, а снимок
ещё старый, обращение по новому имени вернёт «такого нет» со списком тех, кто
есть. Это честный ответ, а не сбой: тихо позвать не того было бы хуже.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from aec_roster.ask import AskError, check_name


@dataclass(frozen=True)
class Specialist:
    """Строка роестра: имя профиля и подпись, под которой его знает человек."""

    name: str
    title: str

    @property
    def shown(self) -> str:
        return self.title or self.name


def _handle(text: str) -> str:
    """Ключ сравнения: как обращение выглядит в тексте.

    Правило то же, что в интерфейсе (`mentions-pure.ts::mentionHandle`):
    пробелы в подписи становятся дефисами, регистр не важен. Разойдётся с
    интерфейсом — подсказка начнёт предлагать имя, на которое инструмент не
    отзывается.
    """
    return " ".join(text.split()).replace(" ", "-").casefold()


def load(path: str | Path) -> list[Specialist]:
    """Читает снимок роестра.

    Отсутствие файла — это пустой роестр, а не падение: инструмент могли
    зарегистрировать раньше, чем приложение впервые записало снимок.
    """
    try:
        raw = Path(path).read_text(encoding="utf-8")
    except FileNotFoundError:
        return []
    except OSError as exc:
        raise AskError(f"роестр не читается: {exc}") from exc

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise AskError(f"роестр испорчен: {exc}") from exc

    rows = data.get("specialists") if isinstance(data, dict) else None
    if not isinstance(rows, list):
        return []

    found: list[Specialist] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        name = row.get("name")
        if not isinstance(name, str) or not name:
            continue
        title = row.get("title")
        found.append(Specialist(name=name, title=title.strip() if isinstance(title, str) else ""))
    return found


def resolve(roster: list[Specialist], asked: str) -> Specialist:
    """Кого позвали. Неизвестное имя — ответ со списком, а не запуск наугад.

    Имя приходит из текста человека через модель, то есть это чужие данные.
    Оно сверяется с роестром и НИКОГДА не уходит в команду как есть: наружу
    отправляется `specialist.name`, взятый из снимка и проверенный по форме.
    """
    wanted = _handle((asked or "").lstrip("@"))
    if not wanted:
        raise AskError("не сказано, кого спросить")

    for specialist in roster:
        if wanted in (_handle(specialist.title), _handle(specialist.name)):
            # Форма имени проверяется даже здесь: снимок пишем мы, но файл на
            # диске — это не доказательство, а всего лишь файл на диске.
            check_name(specialist.name)
            return specialist

    known = ", ".join(sorted(s.shown for s in roster))
    raise AskError(
        f"специалиста «{asked}» нет в роестре" + (f"; есть: {known}" if known else "; роестр пуст")
    )
