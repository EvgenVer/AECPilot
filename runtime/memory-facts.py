# Список фактов памяти проекта и их удаление, КОГДА ЯДРО НЕ ЗАПУЩЕНО (задачи 5.16, 3H.20).
#
# С живым ядром список идёт его командой `/aec-memory-facts` (наш плагин,
# `plugins/aec_secret_filter/memory_facts.py`): ядро уже держит папку хранилища,
# и второй процесс получил бы отказ. Этот процесс — для случая, когда ядра нет и
# держать папку некому. Код списка и удаления ОДИН — модуль плагина; здесь только
# окружение отдельного процесса: `.env` профиля и чистка значений из отказа.
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


def open_provider(home):
    src = os.environ.get("AEC_HERMES_SRC")
    if src and src not in sys.path:
        sys.path.insert(0, src)
    # Задача 3G.4 (D-157): `mem0.json` несёт ИМЯ переменной ключа (`api_key_env`), а
    # ключ подставляет наш плагин ядра. Этот процесс плагины ядра не грузит — ставим
    # ту же подмену сами, из исходника плагина рядом.
    plugins_dir = str(Path(__file__).resolve().parents[1] / "plugins")
    if plugins_dir not in sys.path:
        sys.path.insert(0, plugins_dir)
    from aec_secret_filter.mem0_shared import install_shared_mem0_client
    from aec_secret_filter.memory_facts import open_provider as open_mem0

    install_shared_mem0_client()
    return open_mem0(home)


def run(command, ident, provider):
    from aec_secret_filter.memory_facts import run as run_facts

    answer = run_facts(command, ident, provider)
    if "error" in answer:
        answer["error"] = clean(answer["error"])
    return answer


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
