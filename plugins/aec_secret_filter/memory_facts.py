"""Список фактов памяти проекта и их удаление — ВНУТРИ ЖИВОГО ЯДРА (задача 3H.20, D-190).

ПОЧЕМУ КОМАНДА ЯДРА, А НЕ ОТДЕЛЬНЫЙ ПРОЦЕСС. Встроенный qdrant держит папку
хранилища исключительно, и второй процесс получает отказ (замер 5.4). До 3H.20
список читался так: погасить ядро → прочитать отдельным процессом → поднять
обратно, и на это время агент пропадал. Наш плагин и так живёт в процессе ядра, а
плагин Mem0 держит ОДИН клиент на папку (их `_LOCAL_QDRANT_MEMORIES`, T20.6): провайдер,
открытый здесь, получает того же клиента, что агенты, — без второй блокировки и без
остановки (замер `runtime/memory-list-probe.py`). Удалённый факт сразу пропадает и
из поиска живых сессий: клиент у них общий.

Команда — `/aec-memory-facts list` и `/aec-memory-facts delete <id>`; ответ —
ОДНА строка JSON. Окно зовёт её через `command.dispatch` шлюза. Тот же `run`
использует `runtime/memory-facts.py`, когда ядро не запущено: форма ответа одна.

Обработчик не бросает: исключение их диспетчер глотает и отвечает «not a
quick/plugin/bundle/skill command», и человек увидел бы чужую ошибку вместо
причины.
"""

from __future__ import annotations

import contextlib
import json
import logging
from typing import Any

from .secrets import redact_secrets

logger = logging.getLogger(__name__)

COMMAND = "aec-memory-facts"


def facts_of(raw: Any) -> list[dict]:
    """mem0 отдаёт то список, то словарь с `results` — обе формы у них в ходу.

    ФОРМА ФАКТА ЗАМЕРЕНА (задача 5.16): `{id, memory, hash, metadata: {channel},
    created_at, updated_at, user_id, agent_id, role}`. Поля `session` в ней НЕТ —
    провайдер пишет в метаданные только канал (`_write_metadata`), и спека
    исправлена по этому замеру."""
    items = raw.get("results", []) if isinstance(raw, dict) else raw
    out = []
    for item in items or []:
        metadata = item.get("metadata") or {}
        out.append(
            {
                "id": item.get("id", "") or "",
                "text": item.get("memory", "") or "",
                "created_at": item.get("created_at", "") or "",
                "channel": metadata.get("channel", "") or "",
            }
        )
    return out


def error_in(answer: Any) -> str | None:
    """Их инструменты отвечают СТРОКОЙ JSON, и отказ лежит в поле `error`. Без
    разбора человек увидел бы в окне сырой JSON вместо фразы. `None` — отказа нет."""
    try:
        parsed = json.loads(str(answer))
    except ValueError:
        return None
    if isinstance(parsed, dict) and parsed.get("error"):
        return str(parsed["error"])
    return None


def reason_from(provider: Any) -> str:
    """Почему списка нет — ИХ словами. Замер задачи 5.16: когда папку хранилища
    держит другой процесс, провайдер НЕ бросает и `is_available()` отвечает True —
    `_backend` просто остаётся None. Свой текст в этом месте врал бы (например, про
    версию mem0), а их обработчик поиска несёт настоящую причину: «Storage folder …
    is already accessed by another instance of Qdrant client»."""
    try:
        answer = provider.handle_tool_call("mem0_search", {"query": "факт"})
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return error_in(answer) or "список фактов недоступен: " + str(answer)[:200]


def open_provider(hermes_home: str | None = None) -> Any:
    """Провайдер mem0 профиля. Без `hermes_home` — профиль, который ядро привязало
    к этому вызову (`_session_home_scope` шлюза)."""
    from plugins.memory import load_memory_provider

    if hermes_home is None:
        from hermes_constants import get_hermes_home

        hermes_home = str(get_hermes_home())

    provider = load_memory_provider("mem0", register_skills=False)
    if provider is None:
        raise RuntimeError("провайдер памяти mem0 не найден")
    provider.initialize(
        session_id=COMMAND,
        platform="tui",
        hermes_home=hermes_home,
        agent_context="primary",
    )
    return provider


def run(command: str, ident: str, provider: Any) -> dict:
    if command == "list":
        # ПОЛНЫЙ СПИСОК ИХ ИНСТРУМЕНТОМ НЕ БЕРЁТСЯ: `mem0_search` требует запрос и
        # отдаёт максимум 50 совпадений (`plugins/memory/mem0/__init__.py`) — это
        # поиск, а не инвентарь. Поэтому список идёт у самого mem0 через их же
        # backend: перевод настройки остаётся их, а `user_id` — тот, которым
        # разделены проекты (задача 5.2).
        backend = getattr(provider, "_backend", None)
        if backend is None:
            raise RuntimeError(reason_from(provider))
        memory = getattr(backend, "_memory", None)
        if memory is None or not hasattr(memory, "get_all"):
            raise RuntimeError("список фактов есть только у локального mem0 (mode: oss)")
        return {
            "ok": True,
            "user_id": provider._user_id,
            # ФОРМА ФИЛЬТРА ЗАМЕРЕНА, А НЕ УГАДАНА: `get_all(user_id=...)` в mem0
            # 2.0.10 отвечает отказом «Top-level entity parameters … are not
            # supported … Use filters={...}», и их собственный поиск зовётся так же.
            "facts": facts_of(memory.get_all(filters={"user_id": provider._user_id})),
        }

    if command == "delete":
        if not ident:
            raise RuntimeError("не сказано, какой факт удалить")
        # Удаление — ИХ инструментом: форма записи и её журнал остаются их.
        problem = error_in(provider.handle_tool_call("mem0_delete", {"memory_id": ident}))
        answer = {"ok": problem is None, "deleted": ident}
        if problem is not None:
            answer["error"] = problem[:300]
            return answer
        # D-171: без этого факт возвращается — mem0 заново извлекает его из своего
        # журнала реплик проекта (`mem0_turns.py`). Сбой здесь не отменяет
        # удаления, поэтому в ответ не идёт: ответ — о факте.
        try:
            from .mem0_turns import forget_scope_turns

            forget_scope_turns(getattr(provider._backend, "_memory", None), provider._user_id)
        except Exception as error:
            logger.warning("aec-memory-facts: журнал реплик не очищен (%s)", type(error).__name__)
        return answer

    return {"ok": False, "error": "неизвестная команда"}


def profile_scope() -> Any:
    """Привязка главного профиля на время команды (задача 3I.3, D-195).

    С двух профилей ядро в мультиплексе, и `get_secret` вне привязки профиля
    бросает `UnscopedSecretError` — так страница «Память» получала отказ на
    `MEM0_MODE`: `command.dispatch` шлюза привязки не ставит. Их шов
    `launch_profile_scope_if_multiplexed` собирает секреты главного профиля вместе
    с окружением запуска, то есть с ключом провайдера для эмбеддингов Mem0; пока
    профиль один, он ничего не делает. Уже привязанный вызов не трогаем. Без ядра
    (тесты, `runtime/memory-facts.py`) привязывать нечего."""
    try:
        from agent.secret_scope import current_secret_scope
        from tui_gateway.launch_profile_policy import launch_profile_scope_if_multiplexed
    except ImportError:
        return contextlib.nullcontext()
    if current_secret_scope() is not None:
        return contextlib.nullcontext()
    return launch_profile_scope_if_multiplexed()


def handle(raw_args: str) -> str:
    """Обработчик `/aec-memory-facts`: `list` или `delete <id>` — строка JSON."""
    parts = (raw_args or "").split()
    command = parts[0] if parts else ""
    ident = parts[1] if len(parts) > 1 else ""
    try:
        with profile_scope():
            provider = None
            try:
                provider = open_provider()
                answer = run(command, ident, provider)
            finally:
                if provider is not None:
                    try:
                        # Отпускает аренду общего клиента, а не сам клиент: живые
                        # сессии продолжают писать в ту же папку (их счётчик `users`, T20.6).
                        provider.shutdown()
                    except Exception:
                        pass
    except Exception as error:
        text, _found = redact_secrets(type(error).__name__ + ": " + str(error))
        answer = {"ok": False, "error": text[:300]}
    if "error" in answer:
        answer["error"], _found = redact_secrets(answer["error"])
    return json.dumps(answer, ensure_ascii=False)
