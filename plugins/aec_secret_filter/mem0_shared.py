"""Бэкенд Mem0 с ключом по имени переменной (задачи 3G.4/D-157, 3F.D2/D-111, T20.6).

ЧТО ЗДЕСЬ БЫЛО И ПОЧЕМУ ЧАСТИ ЭТОГО БОЛЬШЕ НЕТ. До ядра 0.22 плагин Mem0 заводил
`OSSBackend` — а с ним встроенный qdrant — на КАЖДОГО агента, и второй агент
процесса получал «Storage folder … is already accessed by another instance of
Qdrant client» (D-111, замерено 2026-09-23 и 2026-09-28). Здесь стояла наша
фабрика: один клиент на папку, закрытие по счётчику. С плагина `mem0ai/mem0` 1.3.0
(ядро 0.22, задача T20.6) то же делают они сами: `_backend._LOCAL_QDRANT_MEMORIES`
держит одного владельца на путь, `users` — счётчик, вызовы идут под его замком
(замерено `runtime/mem0-shared-client-probe.py`: второй клиент открывается без
конфликта, 50 записей из потоков без ошибок). Наша фабрика поверх их класса
ломала его: их код зовёт `OSSBackend._reject_dimension_mismatch` атрибутом
модуля, а там была функция. Поэтому деления больше нет.

ЧТО ОСТАЛОСЬ — КЛЮЧ ПО ИМЕНИ ПЕРЕМЕННОЙ. Их LLM и эмбеддер для Mem0 берут ключ
только из `OPENAI_API_KEY` (`_backend.OSSBackend._provider_block`,
`_openai_llm.DirectOpenAILLM`), имя переменной не настраивается. Адрес подменить
можно (`openai_base_url`), ключ — нет. Поэтому `mem0.json` несёт ИМЯ переменной
(`api_key_env`), а ключ подставляется здесь, в памяти процесса, через их область
секретов профиля (`agent.secret_scope.get_secret`). Нет ключа — отказ с именем
переменной: иначе эмбеддер молча взял бы `OPENAI_API_KEY` и отправил ключ OpenAI
на адрес другого провайдера.

Точка подмены — `_backend.OSSBackend`, который их `Mem0MemoryProvider.
_create_backend` берёт атрибутом модуля в момент вызова. Кладётся туда наследник,
а не функция: их код внутри модуля обращается к статическим методам класса по
имени. Точку сверяет `runtime/mem0-shared-client-contract.test.mjs`.
"""

from __future__ import annotations

import logging
import os
from collections.abc import Callable
from typing import Any

logger = logging.getLogger(__name__)

_GUARD_FLAG = "_aec_keyed_mem0_backend"


def storage_key(oss_config: dict) -> str | None:
    """Путь папки встроенного qdrant (нормализованный); None — хранилище сервером."""
    vector_store = (oss_config or {}).get("vector_store") or {}
    path = (vector_store.get("config") or {}).get("path")
    if not path:
        return None
    return os.path.normcase(os.path.abspath(os.path.expanduser(str(path))))


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


def keyed_backend(original: type) -> type:
    """Наследник их `OSSBackend`, подставляющий ключ по имени переменной."""

    class KeyedOSSBackend(original):  # type: ignore[misc, valid-type]
        def __init__(self, oss_config: dict, *args: Any, **kwargs: Any) -> None:
            super().__init__(with_keys_from_env(oss_config), *args, **kwargs)

    KeyedOSSBackend.__name__ = original.__name__
    KeyedOSSBackend.__qualname__ = original.__qualname__
    setattr(KeyedOSSBackend, _GUARD_FLAG, True)
    return KeyedOSSBackend


def install_mem0_backend() -> bool:
    """Ставит наследника на место их `OSSBackend`. Возвращает, встал ли он."""
    try:
        from plugins.memory import import_provider_module

        backend_mod = import_provider_module("mem0", "_backend")
    except Exception as error:
        logger.warning(
            "aec-secret-filter: нет модуля бэкенда mem0 (%s) — ключ по имени не встал", error
        )
        return False
    original = getattr(backend_mod, "OSSBackend", None)
    if not isinstance(original, type):
        logger.warning("aec-secret-filter: у mem0 нет класса OSSBackend — ключ по имени не встал")
        return False
    if not hasattr(backend_mod, "_LOCAL_QDRANT_MEMORIES"):
        # Их общий клиент на папку исчез — D-111 вернётся: вторая сессия процесса
        # потеряет память. Сверять при подъёме пина плагина.
        logger.warning("aec-secret-filter: у mem0 нет общего клиента на папку — D-111 вернётся")
    if getattr(original, _GUARD_FLAG, False):
        return True
    backend_mod.OSSBackend = keyed_backend(original)
    return True
