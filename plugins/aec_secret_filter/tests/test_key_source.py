"""Задача 3I.2 (D-195): что источник ключей отдаёт ядру.

Сам класс по их контракту `SecretSource` проверяет зонд на настоящем ядре
(`runtime/multiplex-secrets-probe.py`) — здесь venv без ядра. Здесь — правило
отбора: только перечисленные приложением имена, только непустые значения.
"""

from __future__ import annotations

from aec_secret_filter.key_source import NAMES_ENV, listed_keys


def test_gives_only_the_names_the_app_listed():
    environ = {
        NAMES_ENV: "GEMINI_API_KEY,OPENAI_API_KEY",
        "GEMINI_API_KEY": "g-fake",
        "OPENAI_API_KEY": "o-fake",
        "GITHUB_TOKEN": "not-ours",
    }

    assert listed_keys(environ) == {"GEMINI_API_KEY": "g-fake", "OPENAI_API_KEY": "o-fake"}


def test_without_the_list_gives_nothing_even_when_keys_are_in_the_environment():
    assert listed_keys({"GEMINI_API_KEY": "g-fake"}) == {}


def test_skips_empty_and_missing_values_and_stray_separators():
    environ = {
        NAMES_ENV: " GEMINI_API_KEY , ,MISSING_KEY,EMPTY_KEY,",
        "GEMINI_API_KEY": "g",
        "EMPTY_KEY": "",
    }

    assert listed_keys(environ) == {"GEMINI_API_KEY": "g"}
