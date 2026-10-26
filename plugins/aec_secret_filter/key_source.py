"""Ключи провайдеров для каждого профиля ядра — внешний источник секретов (задача 3I.2, D-195).

ПОЧЕМУ ИСТОЧНИК, А НЕ ОКРУЖЕНИЕ. Приложение кладёт ключи из своего хранилища
(safeStorage, SPEC C10) в окружение процесса ядра. Пока профиль один, ядро так их
и читает. С двух профилей (главный + специалист) ядро 0.21.5 включает мультиплекс,
и `get_secret` читает только секреты профиля: его `.env` и внешние источники.
Окружение процесса для MCP-серверов и профилей специалистов закрыто — `${env:KEY}`
у `aec-rag` оставался строкой, и Gemini отвечал «Please pass a valid API key».

Этот класс — их же контракт `agent/secret_sources/base.py::SecretSource`, тот, по
которому подключаются 1Password и Bitwarden. Ядро зовёт его для каждого профиля,
у которого в `config.yaml` есть `secrets.aecpilot.enabled: true` (раздел пишет
приложение), и кладёт ответ в секреты профиля. На диск ничего не пишется.

Что отдаётся: значения переменных, чьи ИМЕНА приложение перечислило в
`AEC_PROVIDER_KEY_NAMES` (через запятую). Чужие переменные окружения источник не
трогает: перечня нет — нет и ключей. `.env` профиля главнее (их правило: источник
без `override_existing` только заполняет пробелы) — как и до мультиплекса.
Замер — `runtime/multiplex-secrets-probe.py`, docs/plan-details.md §«Приёмка владельца 2026-10-09».
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from typing import Any

NAME = "aecpilot"
NAMES_ENV = "AEC_PROVIDER_KEY_NAMES"


def listed_keys(environ: Mapping[str, str]) -> dict[str, str]:
    """Перечисленные приложением ключи с непустым значением."""
    names = [name.strip() for name in environ.get(NAMES_ENV, "").split(",")]
    return {name: environ[name] for name in names if name and environ.get(name)}


def build_source() -> Any:
    """Источник по их контракту. Класс собирается здесь, а не на уровне модуля:
    тесты плагина идут в venv без ядра, а `agent.secret_sources` есть только в
    процессе ядра. Сам класс проверяет `runtime/multiplex-secrets-probe.py`."""
    from agent.secret_sources.base import FetchResult, SecretSource

    class AecPilotKeySource(SecretSource):
        name = NAME
        label = "AECPilot"
        shape = "bulk"

        def fetch(self, cfg: dict, home_path: Any) -> FetchResult:
            return FetchResult(secrets=listed_keys(os.environ))

    return AecPilotKeySource()
