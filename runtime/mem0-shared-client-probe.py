"""Зонд задачи 3F.D2 (D-111): переживает ли ОДИН клиент Mem0 две сессии разом.

Что меряется. Их плагин Mem0 заводит `OSSBackend` (а с ним встроенный qdrant) на
каждого агента, и второй агент процесса падает на «Storage folder … is already
accessed». Починка — один клиент на процесс. Этот зонд отвечает на два вопроса:
  1. воспроизводится ли отказ второго клиента на той же папке (без починки);
  2. выдерживает ли общий клиент запись и поиск из двух потоков одновременно.

Без трат: эмбеддер подменяется детерминированной функцией, LLM не зовётся
(`infer=False`), ключи — пустышки. Запуск интерпретатором ядра:

    runtime/.hermes-venv/Scripts/python.exe runtime/mem0-shared-client-probe.py
"""

from __future__ import annotations

import hashlib
import os
import sys
import tempfile
import threading
from pathlib import Path

HERMES_SRC = Path(__file__).resolve().parent / ".hermes-src"
sys.path.insert(0, str(HERMES_SRC))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "plugins"))
# Зонд не шлёт телеметрию mem0 наружу — как и продукт.
os.environ["MEM0_TELEMETRY"] = "False"

DIMS = 8


def fake_embed(text, memory_action=None):  # noqa: ARG001 — их сигнатура
    digest = hashlib.sha256(str(text).encode()).digest()
    return [b / 255 for b in digest[:DIMS]]


def config(path: str) -> dict:
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


def backend(backend_mod, path: str):
    made = backend_mod.OSSBackend(config(path))
    made._memory.embedding_model.embed = fake_embed  # noqa: SLF001 — зонд
    return made


def main() -> int:
    from plugins.memory import import_provider_module

    if "--with-fix" in sys.argv:
        from aec_secret_filter.mem0_shared import install_shared_mem0_client

        print("FIX installed:", install_shared_mem0_client())
    backend_mod = import_provider_module("mem0", "_backend")
    home = tempfile.mkdtemp(prefix="aec-mem0-probe-")
    path = str(Path(home) / "mem0_qdrant")

    # 1. Воспроизведение D-111: второй клиент на той же папке.
    first = backend(backend_mod, path)
    second = None
    try:
        second = backend(backend_mod, path)
        print("1 SECOND CLIENT: opened (no conflict)")
    except Exception as error:  # ожидаемо до починки
        print(f"1 SECOND CLIENT: FAILED — {type(error).__name__}: {str(error)[:120]}")

    # 2. Один клиент, два потока: запись и поиск разом.
    errors: list[str] = []

    def writer(tag: str) -> None:
        for i in range(25):
            try:
                first.add(
                    [{"role": "user", "content": f"{tag} факт {i}"}], user_id="u", agent_id=tag
                )
            except Exception as error:
                errors.append(f"add {tag}: {type(error).__name__}: {error}")

    def reader(tag: str) -> None:
        for _ in range(25):
            try:
                first.search("факт", filters={"user_id": "u"}, top_k=5)
            except Exception as error:
                errors.append(f"search {tag}: {type(error).__name__}: {error}")

    threads = [
        threading.Thread(target=writer, args=("a",)),
        threading.Thread(target=reader, args=("b",)),
        threading.Thread(target=writer, args=("c",)),
        threading.Thread(target=reader, args=("d",)),
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    found = first.search("факт", filters={"user_id": "u"}, top_k=100)
    print(f"2 SHARED CLIENT: errors={len(errors)} stored={len(found)}")
    for line in errors[:5]:
        print("   " + line[:160])
    first.close()
    if second is not None:
        # Первый агент закрылся — второй всё ещё пишет и находит.
        second.add(
            [{"role": "user", "content": "после закрытия первого"}], user_id="u", agent_id="z"
        )
        after = second.search("факт", filters={"user_id": "u"}, top_k=100)
        print(f"3 AFTER FIRST CLOSED: stored={len(after)}")
        second.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
