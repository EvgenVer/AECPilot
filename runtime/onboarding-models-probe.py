"""Зонд задачи 3H.26 (D-188): почему после кнопки «OpenAI» в окне первого запуска нет
шага выбора модели, а после Gemini — есть (D-177).

Окно донора после ключа зовёт `model.options` с `include_unconfigured` и показывает шаг
модели, только если у провайдера есть хоть одна модель (`fetchProviderDefaultModel`).
Обычное открытие у ядра — `non_blocking_catalogs`: каталог только из дискового кэша.
Зонд меряет число моделей у строк `openai` и `gemini` на ЧИСТОМ профиле (кэша нет) —
ровно состояние первого запуска.

Ключи фиктивные: сеть не нужна, чтобы увидеть, что отдаёт кэш. Запуск интерпретатором
ядра:  runtime/.hermes-venv/Scripts/python.exe runtime/onboarding-models-probe.py
"""

from __future__ import annotations

import os
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / ".hermes-src"))

home = Path(tempfile.mkdtemp(prefix="aec-onboarding-models-"))
os.environ["HERMES_HOME"] = str(home)
os.environ["OPENAI_API_KEY"] = "sk-probe-not-a-key"


def rows(refresh: bool) -> dict[str, int]:
    from hermes_cli.inventory import build_model_options_payload, load_picker_context

    payload = build_model_options_payload(
        load_picker_context(), include_unconfigured=True, refresh=refresh
    )
    out = {}
    for row in payload["providers"]:
        slug = str(row.get("slug", ""))
        if slug in ("openai", "openai-api", "gemini", "google"):
            out[slug] = len(row.get("models") or [])
    return out


def head(n: int = 4) -> list[tuple[str, int, bool]]:
    from hermes_cli.inventory import build_model_options_payload, load_picker_context

    payload = build_model_options_payload(load_picker_context(), include_unconfigured=True)
    return [
        (str(r.get("slug")), len(r.get("models") or []), bool(r.get("authenticated", True)))
        for r in payload["providers"][:n]
    ]


start = time.time()
print("first open (cache only):", rows(False), f"{time.time() - start:.1f}s")
# Что донор возьмёт, не найдя «openai»: `providers[0]`.
print("first rows (slug, models, authenticated):", head())


def donor_pick(label: str) -> tuple[str, int]:
    """Повтор `fetchProviderDefaultModel` донора: кандидаты — префикс ключа и надпись строки."""
    from hermes_cli.inventory import build_model_options_payload, load_picker_context

    providers = build_model_options_payload(load_picker_context(), include_unconfigured=True)[
        "providers"
    ]
    wanted = ["openai", label.lower()]
    row = next((p for p in providers if str(p.get("slug", "")).lower() in wanted), providers[0])
    return str(row.get("slug")), len(row.get("models") or [])


# D-188: шаг модели показан, только если у выбранной строки есть модели.
for label in ("OpenAI", "OpenAI-API"):
    print(f"donor picks for label {label!r} (slug, models):", donor_pick(label))
