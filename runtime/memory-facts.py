# Список фактов памяти проекта и их удаление — для окна памяти (задача 5.16).
#
# ПОЧЕМУ ЭТО ОТДЕЛЬНЫЙ ПРОЦЕСС, А НЕ КОД ПРИЛОЖЕНИЯ. Хранилище слоя 2 — встроенный
# qdrant, и открыть его умеет только python ядра: у приложения нет ни клиента к
# нему, ни перевода настройки `mem0.json` в конфиг mem0. Читает тот же код,
# который пишет, — иначе форма факта разъехалась бы с формой записи.
#
# ЗАПУСКАТЬ ТОЛЬКО ПРИ ОСТАНОВЛЕННОМ ЯДРЕ: живое ядро держит папку хранилища
# исключительно (замер `runtime/memory-store-access-probe.mjs`, задача 5.4), и
# второй клиент получает отказ вместо списка.
#
# НА STDOUT — РОВНО ОДНА СТРОКА JSON. Значения из окружения профиля в неё не
# попадают: в тексте отказа они заменяются на «[скрыто]».
#
# Запуск: <python venv ядра> runtime/memory-facts.py list
#         <python venv ядра> runtime/memory-facts.py delete <id факта>

import json
import os
import sys
from pathlib import Path

SECRETS = []


def load_env(home):
    """Доливает `$HERMES_HOME/.env` в окружение процесса — ровно то, что делает
    ядро при старте. Без этого mem0 не соберёт клиента эмбеддера. Значения
    никуда не печатаются; список нужен, чтобы вычистить их из текста отказа."""
    try:
        text = (Path(home) / ".env").read_text(encoding="utf-8")
    except OSError:
        return
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if not key or not value:
            continue
        os.environ.setdefault(key, value)
        SECRETS.append(value)


def clean(text):
    for value in SECRETS:
        if len(value) > 7:
            text = text.replace(value, "[скрыто]")
    return text


def facts_of(raw):
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


def error_in(answer):
    """Их инструменты отвечают СТРОКОЙ JSON, и отказ лежит в поле `error`. Без
    разбора человек увидел бы в окне сырой JSON вместо фразы. `None` — отказа нет."""
    try:
        parsed = json.loads(str(answer))
    except ValueError:
        return None
    if isinstance(parsed, dict) and parsed.get("error"):
        return str(parsed["error"])
    return None


def reason_from(provider):
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


def open_provider(home):
    src = os.environ.get("AEC_HERMES_SRC")
    if src and src not in sys.path:
        sys.path.insert(0, src)
    from plugins.memory import load_memory_provider

    # Задача 3G.4 (D-157): `mem0.json` несёт ИМЯ переменной ключа (`api_key_env`), а
    # ключ подставляет наш плагин ядра. Этот процесс плагины ядра не грузит — ставим
    # ту же подмену сами, из исходника плагина рядом.
    plugins_dir = str(Path(__file__).resolve().parents[1] / "plugins")
    if plugins_dir not in sys.path:
        sys.path.insert(0, plugins_dir)
    from aec_secret_filter.mem0_shared import install_shared_mem0_client

    install_shared_mem0_client()

    provider = load_memory_provider("mem0", register_skills=False)
    provider.initialize(
        session_id="aec-memory-facts",
        platform="tui",
        hermes_home=home,
        agent_context="primary",
    )
    return provider


def run(command, ident, provider):
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
            answer["error"] = clean(problem)[:300]
        return answer

    return {"ok": False, "error": "неизвестная команда"}


def main():
    command = sys.argv[1] if len(sys.argv) > 1 else ""
    ident = sys.argv[2] if len(sys.argv) > 2 else ""
    home = os.environ.get("HERMES_HOME", "")
    if not home:
        print(json.dumps({"ok": False, "error": "HERMES_HOME не задан"}, ensure_ascii=False))
        return 0

    load_env(home)
    os.environ["MEM0_TELEMETRY"] = "false"
    # D-85: журнал mem0 — в профиле, а не в ~/.mem0 (см. runtime/memory-config.mjs).
    os.environ.setdefault("MEM0_DIR", os.path.join(home, "mem0"))

    provider = None
    try:
        provider = open_provider(home)
        answer = run(command, ident, provider)
    except Exception as error:
        answer = {"ok": False, "error": clean(type(error).__name__ + ": " + str(error))[:300]}
    finally:
        if provider is not None:
            try:
                provider.shutdown()
            except Exception:
                pass

    print(json.dumps(answer, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
