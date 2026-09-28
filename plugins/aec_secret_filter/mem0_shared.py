"""Один клиент Mem0 на процесс ядра (задача 3F.D2, D-111, вариант A PLAN).

ЗАМЕРЕНО 2026-09-23 (приёмка 3F.8) и 2026-09-28 (`runtime/mem0-shared-client-probe.py`):
их плагин Mem0 заводит `OSSBackend` — а с ним встроенный qdrant — на КАЖДОГО
агента, то есть на каждую сессию шлюза. Встроенный qdrant держит папку
исключительно даже внутри одного процесса, и второй агент получает «Storage
folder … is already accessed by another instance of Qdrant client»: память
работает у одной сессии из многих. Зонд тем же числом показал, что ОДИН клиент
выдерживает запись и поиск из четырёх потоков разом без ошибок.

ПОЭТОМУ ЗДЕСЬ ПОДМЕНА ИХ ФАБРИКИ, А НЕ ПРАВКА ИХ ФАЙЛА. `Mem0MemoryProvider.
_create_backend` берёт `_backend.OSSBackend` атрибутом модуля в момент вызова, и
мы кладём туда кэш по пути хранилища: первый агент открывает клиента, остальные
получают его же. Закрытие — по счётчику: клиент закрывается, когда его отпустил
последний агент, иначе конец одной сессии отнял бы память у всех прочих.
Клиент без пути (qdrant сервером) не кэшируется — там конфликта нет.

Точка подмены — `plugins.memory.mem0._backend.OSSBackend`: при подъёме ядра её
сверяют в обязательном диффе контрактов. Не встала — предупреждение в лог, и
ядро ведёт себя по-своему (как до починки), а не падает.
"""

from __future__ import annotations

import logging
import os
import threading
from collections.abc import Callable
from typing import Any

logger = logging.getLogger(__name__)

_GUARD_FLAG = "_aec_shared_mem0_client"


def storage_key(oss_config: dict) -> str | None:
    """Путь папки встроенного qdrant — ключ общего клиента; None — не делить."""
    vector_store = (oss_config or {}).get("vector_store") or {}
    path = (vector_store.get("config") or {}).get("path")
    if not path:
        return None
    return os.path.normcase(os.path.abspath(os.path.expanduser(str(path))))


class _Lease:
    """Доступ агента к общему клиенту: всё — клиенту, кроме `close`."""

    def __init__(self, backend: Any, release: Callable[[], None]) -> None:
        self._aec_backend = backend
        self._aec_release = release
        self._aec_closed = False

    def __getattr__(self, name: str) -> Any:
        return getattr(self._aec_backend, name)

    def close(self) -> None:
        if self._aec_closed:
            return
        self._aec_closed = True
        self._aec_release()


def shared_factory(original: Callable[[dict], Any]) -> Callable[[dict], Any]:
    """Фабрика на месте их `OSSBackend`: один клиент на папку хранилища."""
    lock = threading.Lock()
    shared: dict[str, list] = {}  # ключ -> [клиент, число агентов]

    def factory(oss_config: dict) -> Any:
        key = storage_key(oss_config)
        if key is None:
            return original(oss_config)
        with lock:
            entry = shared.get(key)
            if entry is None:
                entry = [original(oss_config), 0]
                shared[key] = entry
            entry[1] += 1

        def release() -> None:
            with lock:
                entry[1] -= 1
                if entry[1] > 0 or shared.get(key) is not entry:
                    return
                del shared[key]
            entry[0].close()

        return _Lease(entry[0], release)

    setattr(factory, _GUARD_FLAG, True)
    return factory


def install_shared_mem0_client() -> bool:
    """Ставит общую фабрику. Возвращает, встала ли она."""
    try:
        from plugins.memory import import_provider_module

        backend_mod = import_provider_module("mem0", "_backend")
    except Exception as error:
        logger.warning(
            "aec-secret-filter: нет модуля бэкенда mem0 (%s) — общий клиент не встал", error
        )
        return False
    original = getattr(backend_mod, "OSSBackend", None)
    if original is None:
        logger.warning("aec-secret-filter: у mem0 нет OSSBackend — общий клиент не встал")
        return False
    if getattr(original, _GUARD_FLAG, False):
        return True
    backend_mod.OSSBackend = shared_factory(original)
    return True
