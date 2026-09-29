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


# ── КЛЮЧ ПО ИМЕНИ ПЕРЕМЕННОЙ (задача 3G.4, D-157, решение владельца (в)) ──────────
# Их LLM для Mem0 (`_openai_llm.DirectOpenAILLM`) берёт ключ из `OPENAI_API_KEY`, а
# эмбеддер библиотеки — тоже из `OPENAI_API_KEY`; имя переменной не настраивается.
# Адрес подменить можно (`openai_base_url`), ключ — нет. Поэтому `mem0.json` несёт
# ИМЯ переменной (`api_key_env`), а ключ подставляется здесь, в памяти процесса,
# через их область секретов профиля (`agent.secret_scope.get_secret` — так читает и
# их LLM). Оба их класса ключ из конфига принимают (`self.config.api_key or …`), так
# что наследники не нужны. Нет ключа — отказ с именем переменной: иначе эмбеддер
# молча взял бы `OPENAI_API_KEY` и отправил ключ OpenAI на адрес другого провайдера.


def _secret(name: str) -> str:
    try:
        from agent.secret_scope import get_secret
    except Exception:  # вне ядра (тесты) — окружение процесса
        return os.environ.get(name, "")
    return get_secret(name, "") or ""


def with_keys_from_env(oss_config: dict, secret: Callable[[str], str] = _secret) -> dict:
    """Копия конфига, где `api_key_env` блоков llm/embedder заменён ключом."""
    if not isinstance(oss_config, dict):
        return oss_config
    out = dict(oss_config)
    for section in ("llm", "embedder"):
        block = out.get(section)
        if not isinstance(block, dict) or not isinstance(block.get("config"), dict):
            continue
        config = dict(block["config"])
        name = config.pop("api_key_env", None)
        if not name:
            continue
        if not config.get("api_key"):
            value = secret(str(name))
            if not value:
                raise ValueError(f"нет ключа провайдера памяти: переменная {name} не задана")
            config["api_key"] = value
        out[section] = {**block, "config": config}
    return out


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
        oss_config = with_keys_from_env(oss_config)
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
