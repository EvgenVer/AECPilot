"""Плагин ядра: секрет не уезжает в память ни одним из двух путей (задача 5.3).

Ставится в `$HERMES_HOME/plugins/aec-secret-filter/` (`runtime/register-secret-filter.mjs`).

ПУТЕЙ В ПАМЯТЬ ДВА, И ОНИ РАЗНЫЕ. Это выяснилось замером, а не чтением:

1. **Запись инструментом** — `memory` (слой 1) и `mem0_*` (слой 2). Её заказал
   агент, и её можно ОТКЛОНИТЬ: хук `pre_tool_call` умеет отказать в вызове
   любого инструмента, и это единственное место, откуда достаются оба слоя
   сразу — инструменты слоя 2 в реестре не значатся и ходят своей дорогой
   (`agent/tool_executor.py`: «These are not in the tool registry — route
   through MemoryManager»).

2. **Автоматическая запись хода** — её не заказывал никто: конец каждого
   неперебитого хода сам отправляет реплику человека и ответ агента в провайдера
   (`run_agent._sync_external_memory_for_turn` -> `MemoryManager.sync_all`).
   Вызова инструмента там нет, и хука тоже — поэтому второй путь закрывается
   ОБЁРТКОЙ их метода (см. :func:`install_sync_guard`), другого места нет.

ПОЧЕМУ НА ОДНОМ ПУТИ ОТКАЗ, А НА ДРУГОМ ВЫРЕЗАНИЕ. Отказ имеет смысл, когда есть
кому отказать: агент увидит его в своём же ходе и перескажет факт без значения —
так же ведёт себя их собственный сканер записей памяти. На автоматическом пути
заказчика нет, а выбросить ход целиком значит потерять все обычные факты,
сказанные рядом с секретом. Поэтому там значение вырезается, а ход едет дальше.

У ЯДРА ЭТОТ ХУК ЗАКРЫВАЕТСЯ ПРИ ТАЙМАУТЕ (`_HOOK_TIMEOUT_FAIL_CLOSED_HOOKS`), то
есть зависший фильтр запрещает запись, а не пропускает её. Нам это подходит:
цена ложного отказа — переписанная фраза, цена пропуска — секрет в памяти
навсегда.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from .secrets import find_secrets, redact_secrets, refusal_message

logger = logging.getLogger(__name__)

# Инструменты, пишущие в память. `memory` — слой 1 (их встроенный), `mem0_*` —
# слой 2. Имена слоя 2 принадлежат их плагину и здесь не переименовываются
# (`specs/agent-memory.md` §«Слой 2»).
_MEMORY_TOOLS = frozenset({"memory", "mem0_add", "mem0_update"})

# Поля, в которых у этих инструментов лежит текст. `operations` — пакетная форма
# их `memory`: без неё пакетная запись прошла бы мимо фильтра целиком.
_TEXT_FIELDS = ("content", "text", "old_text")


def _texts(args: Any) -> list[str]:
    if not isinstance(args, dict):
        return []

    out: list[str] = []
    for field in _TEXT_FIELDS:
        value = args.get(field)
        if isinstance(value, str) and value:
            out.append(value)

    operations = args.get("operations")
    if isinstance(operations, list):
        for op in operations:
            if isinstance(op, dict):
                out.extend(_texts(op))

    return out


def _on_pre_tool_call(tool_name: str = "", args: Any = None, **_: Any) -> dict[str, str] | None:
    if tool_name not in _MEMORY_TOOLS:
        return None

    found: list[str] = []
    for text in _texts(args):
        for name in find_secrets(text):
            if name not in found:
                found.append(name)

    if not found:
        return None

    return {"action": "block", "message": refusal_message(found)}


_GUARD_FLAG = "_aec_secret_filter_installed"

#: Файл состояния, который пишет экран памяти (задача 5.4). Его ОТСУТСТВИЕ значит
#: «автозапись включена» — это умолчание ядра, и выключать его молча мы не вправе.
_AUTOWRITE_FILE = "aec-memory.json"


def autowrite_enabled() -> bool:
    """Разрешена ли автоматическая запись хода в память.

    ПОЧЕМУ ЭТО ВООБЩЕ ЗДЕСЬ. Спека требует переключателя автозаписи, а у ядра
    выключателя для этого пути НЕТ: конец хода уезжает в провайдера сам
    (`MemoryManager.sync_all`), без ключа конфига и без хука. Обёртка на воронке у
    нас уже стоит ради секретов — она же исполняет и решение человека.

    Читается на каждый ход нарочно: человек щёлкает переключателем в работающем
    приложении, и ждать перезапуска ядра ему незачем. Цена — чтение маленького
    файла рядом с вызовом модели.
    """
    try:
        from hermes_constants import get_hermes_home

        path = get_hermes_home() / _AUTOWRITE_FILE
    except Exception:  # pragma: no cover — ядро на месте всегда
        return True

    try:
        with open(path, encoding="utf-8") as handle:
            return json.load(handle).get("autowrite", True) is not False
    except FileNotFoundError:
        return True
    except Exception:
        # Мусор в файле — умолчание ядра, а не тихое выключение памяти.
        logger.warning("aec-secret-filter: %s не разобрался, автозапись оставлена включённой", path)
        return True


def _redact_messages(messages: Any) -> tuple[Any, list[str]]:
    """Вычищает `messages`, если их передали: провайдер может читать их вместо текста."""
    if not isinstance(messages, list):
        return messages, []

    found: list[str] = []
    out = []
    for message in messages:
        if isinstance(message, dict) and isinstance(message.get("content"), str):
            clean, hits = redact_secrets(message["content"])
            found.extend(name for name in hits if name not in found)
            message = {**message, "content": clean}
        out.append(message)

    return out, found


def install_sync_guard() -> bool:
    """Закрывает ВТОРОЙ путь записи — автоматический, без вызова инструмента.

    ЗАМЕРЕНО 2026-09-09 (`runtime/memory-autowrite-probe.mjs`): реплика «запомни:
    пароль от почты — Qwerty12345!, и ещё резерв 20%» уехала в слой 2 ЦЕЛИКОМ,
    паролем внутри, хотя фильтр на `pre_tool_call` стоял и был включён. Причина
    не в фильтре: автоматическую запись делает не инструмент, а конец хода —
    `run_agent._sync_external_memory_for_turn` -> `MemoryManager.sync_all` ->
    `Mem0MemoryProvider.sync_turn` -> `backend.add(..., infer=True)`. Вызова
    инструмента там нет, значит и хука нет: `VALID_HOOKS` на этом пути пуст,
    выключателя у него тоже нет, а их `sanitize_context` снимает только их
    собственные теги.

    ПОЭТОМУ ЗДЕСЬ ОБЁРТКА ИХ МЕТОДА, А НЕ ХУК — другого места просто не
    существует. Обёртка стоит на `MemoryManager.sync_all`, то есть на ВОРОНКЕ: её
    проходят все провайдеры, включая те, которых мы не знаем. Их код не
    правится, файл на диске не трогается — подменяется атрибут класса в нашем же
    процессе.

    Возвращает, встала ли обёртка. Не встала — значит их устройство изменилось
    (подъём пина), и об этом надо узнать из лога, а не из утечки.
    """
    try:
        from agent.memory_manager import MemoryManager
    except Exception as error:  # pragma: no cover — ядро на месте всегда
        logger.warning(
            "aec-secret-filter: нет agent.memory_manager (%s), автозапись НЕ закрыта", error
        )
        return False

    original = getattr(MemoryManager, "sync_all", None)
    if original is None:
        logger.warning("aec-secret-filter: у MemoryManager нет sync_all — автозапись НЕ закрыта")
        return False
    if getattr(original, _GUARD_FLAG, False):
        return True

    def sync_all(self, user_content, assistant_content, **kwargs):
        # Решение человека проверяется ПЕРВЫМ: выключенная автозапись означает,
        # что хода в памяти не будет вовсе, и вырезать в нём уже нечего.
        if not autowrite_enabled():
            logger.debug("aec-secret-filter: автозапись выключена человеком — ход не записан")
            return None

        clean_user, found_user = redact_secrets(user_content or "")
        clean_assistant, found_assistant = redact_secrets(assistant_content or "")
        found = found_user + [n for n in found_assistant if n not in found_user]

        if "messages" in kwargs:
            kwargs["messages"], found_messages = _redact_messages(kwargs["messages"])
            found.extend(name for name in found_messages if name not in found)

        if found:
            # Громко: ход записан НЕ ТЕМ текстом, который сказал человек, и это
            # должно быть видно в журнале, а не только по последствиям.
            logger.warning(
                "aec-secret-filter: из автозаписи хода вырезано значение (%s)", ", ".join(found)
            )

        return original(self, clean_user, clean_assistant, **kwargs)

    setattr(sync_all, _GUARD_FLAG, True)
    MemoryManager.sync_all = sync_all
    return True


# ── МАРШРУТ ФАКТА В СИСТЕМНОМ ПРОМПТЕ ─────────────────────────────────────────
# Текст короткий нарочно: он конкурирует не с пустотой, а с блоком плагина mem0,
# и чем он длиннее, тем меньше весит каждая его строка.
_MEMORY_ROUTING_SECTION = (
    "Память двухслойная, и слои принадлежат разному.\n"
    "- Факт о ПРОЕКТЕ (решение, требование заказчика, значение по объекту) — "
    "в память проекта: `mem0_add`.\n"
    "- Факт о ЧЕЛОВЕКЕ (какой раздел он ведёт, как просит отвечать, чем "
    "пользуется) — в записку профиля: инструмент `memory`, цель `user`. "
    "Для такого факта `mem0_add` НЕВЕРЕН: память проекта живёт вместе с "
    "проектом, и предпочтение, записанное туда, на другом объекте исчезнет.\n"
    "- Решение, куда записывать, не зависит от того, что вернул поиск по "
    "памяти: найденное относится к проекту, а выбор слоя — к природе факта.\n"
    "- Значение ключа, пароля или токена в память не уедет: такая запись "
    "отклоняется целиком. Перескажите факт без самого значения."
)


def register(ctx) -> None:
    ctx.register_hook("pre_tool_call", _on_pre_tool_call)
    install_sync_guard()

    # ПОЧЕМУ ПРАВИЛО ЖИВЁТ ЗДЕСЬ, А НЕ ТОЛЬКО В ПРОЕКТНОМ `AGENTS.md`.
    #
    # Замерено эвалом 5.6: правило из проектного файла агент выполнял в одном
    # прогоне из трёх — факт о человеке уезжал в память проекта, где он привязан
    # к объекту и на другом исчезает. Причина не в формулировке: у плагина mem0
    # СВОЙ блок в системном промпте («You have persistent memory of this user…
    # mem0_add to store facts»), он про проектную ось не знает и тянет туда всё.
    # Проектный файл лежит в промпте НИЖЕ и спорит из неудобного места.
    #
    # `register_system_prompt_section` ставит наш текст В ТОТ ЖЕ промпт, рядом с
    # их блоком. Это и есть ответ на развилку отчёта `memory-smoke.md`: менять
    # `SOUL.md` не нужно — вайвер владельца на тот файл держится ровно на том, что
    # там нет инструкций о поведении.
    #
    # Мягко: если точки расширения не окажется (подъём пина), правило остаётся
    # только в проектном файле — это хуже, но не поломка.
    register_section = getattr(ctx, "register_system_prompt_section", None)
    if register_section is None:
        logger.warning(
            "aec-secret-filter: нет register_system_prompt_section — "
            "маршрут факта остался только в AGENTS.md"
        )
        return
    try:
        register_section("aec-memory-routing", _MEMORY_ROUTING_SECTION)
    except Exception as error:
        logger.warning("aec-secret-filter: секция маршрута не встала (%s)", error)
