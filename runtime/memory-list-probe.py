"""Зонд задачи 3H.20 (D-190): факты памяти без остановки ядра.

Вопросы спеки (`specs/agent-memory.md`, ревизия 3H):
  1. читается ли КОПИЯ папки хранилища, пока живой клиент держит оригинал;
  2. отдаёт ли наша команда ядра `/aec-memory-facts` список, когда папку держит
     живая сессия того же процесса, и удаляет ли факт так, что живая сессия
     перестаёт его находить сразу.

Без трат: эмбеддер подменяется детерминированной функцией, LLM не зовётся
(`infer=False`), ключи — пустышки. Профиль — временная папка. Запуск
интерпретатором ядра:

    runtime/.hermes-venv/Scripts/python.exe runtime/memory-list-probe.py
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

HERMES_SRC = Path(__file__).resolve().parent / ".hermes-src"
sys.path.insert(0, str(HERMES_SRC))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "plugins"))
os.environ["MEM0_TELEMETRY"] = "False"

DIMS = 8
USER = "aec-project-probe"


def fake_embed(text, memory_action=None):  # noqa: ARG001 — их сигнатура
    digest = hashlib.sha256(str(text).encode()).digest()
    return [b / 255 for b in digest[:DIMS]]


def oss(path: str) -> dict:
    return {
        "vector_store": {"provider": "qdrant", "config": {"path": path, "collection_name": "mem0"}},
        "llm": {
            "provider": "openai",
            "config": {"api_key": "probe-not-a-key", "model": "gpt-4o-mini"},
        },
        "embedder": {
            "provider": "openai",
            "config": {
                "api_key": "probe-not-a-key",
                "model": "text-embedding-3-small",
                "embedding_dims": DIMS,
            },
        },
    }


def main() -> int:
    home = Path(tempfile.mkdtemp(prefix="aec-mem0-list-probe-"))
    os.environ["HERMES_HOME"] = str(home)
    os.environ["MEM0_DIR"] = str(home / "mem0")
    store = str(home / "mem0_qdrant")
    (home / "mem0.json").write_text(
        json.dumps({"mode": "oss", "user_id": USER, "oss": oss(store)}), encoding="utf-8"
    )

    from plugins.memory import import_provider_module

    backend_mod = import_provider_module("mem0", "_backend")
    original = backend_mod.OSSBackend

    def with_fake_embed(config: dict):
        made = original(config)
        made._memory.embedding_model.embed = fake_embed  # noqa: SLF001 — зонд
        return made

    backend_mod.OSSBackend = with_fake_embed
    from aec_secret_filter import memory_facts
    from aec_secret_filter.mem0_shared import install_shared_mem0_client

    print("shared client installed:", install_shared_mem0_client())

    # «Живая сессия» ядра: провайдер, который держит папку.
    live = memory_facts.open_provider(str(home))
    for text in ("Заказчик — ГБУ", "Срок — декабрь", "Схема — ЭОМ"):
        live._backend.add([{"role": "user", "content": text}], user_id=USER, agent_id="hermes")
    print("live facts:", len(live._backend.search("факт", filters={"user_id": USER}, top_k=50)))

    # 1. Копия папки рядом с живым клиентом.
    copy = str(home / "mem0_qdrant_copy")
    try:
        shutil.copytree(store, copy, ignore=shutil.ignore_patterns(".lock"))
        reader = original(oss(copy))
        reader._memory.embedding_model.embed = fake_embed  # noqa: SLF001
        listed = reader._memory.get_all(filters={"user_id": USER})
        items = listed.get("results", []) if isinstance(listed, dict) else listed
        print(f"1 COPY READ: ok, facts={len(items)}")
        reader.close()
    except Exception as error:
        print(f"1 COPY READ: FAILED — {type(error).__name__}: {str(error)[:160]}")

    # 2. Команда ядра на общем клиенте, пока живая сессия держит папку.
    answer = json.loads(memory_facts.handle("list"))
    print(
        f"2 COMMAND LIST: ok={answer['ok']} facts={len(answer.get('facts', []))} "
        f"error={answer.get('error', '')[:120]}"
    )
    if answer["ok"] and answer["facts"]:
        victim = answer["facts"][0]
        deleted = json.loads(memory_facts.handle(f"delete {victim['id']}"))
        print(f"2 COMMAND DELETE: {deleted}")
        after = live._backend._memory.get_all(filters={"user_id": USER})
        rows = after.get("results", []) if isinstance(after, dict) else after
        still = [row for row in rows if row.get("id") == victim["id"]]
        print(f"2 LIVE SESSION AFTER DELETE: facts={len(rows)} victim_present={bool(still)}")
        # Живая сессия продолжает писать после того, как команда отпустила клиента.
        live._backend.add(
            [{"role": "user", "content": "после команды"}], user_id=USER, agent_id="hermes"
        )
        print("2 LIVE WRITE AFTER COMMAND: ok")

    live.shutdown()
    shutil.rmtree(home, ignore_errors=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
