"""Задачи 3G.4 (D-157) и T20.6: ключ памяти по имени переменной, наследником их OSSBackend."""

from __future__ import annotations

import pytest
from aec_secret_filter.mem0_shared import keyed_backend, storage_key, with_keys_from_env


class FakeBackend:
    def __init__(self, oss_config: dict) -> None:
        self.config = oss_config

    @staticmethod
    def _reject_dimension_mismatch(*_args) -> str:
        return "static"


def cfg(path: str | None) -> dict:
    return {
        "vector_store": {
            "provider": "qdrant",
            "config": {"path": path} if path else {"url": "http://x"},
        }
    }


def test_storage_key_normalises_the_path(tmp_path) -> None:
    raw = str(tmp_path / "q")
    assert storage_key(cfg(raw)) == storage_key(cfg(raw + "/"))
    assert storage_key(cfg(None)) is None


# Задача 3G.4 (D-157): ключ провайдера памяти — по имени переменной.
def keyed(name: str | None) -> dict:
    llm = {"model": "m", "openai_base_url": "https://g/"}
    if name:
        llm["api_key_env"] = name
    return {
        "llm": {"provider": "openai", "config": llm},
        "embedder": {"provider": "openai", "config": dict(llm)},
        "vector_store": {"provider": "qdrant", "config": {"path": "/q"}},
    }


def test_key_is_taken_by_variable_name_into_both_blocks() -> None:
    resolved = with_keys_from_env(keyed("GEMINI_API_KEY"), secret={"GEMINI_API_KEY": "g-1"}.get)
    for section in ("llm", "embedder"):
        config = resolved[section]["config"]
        assert config["api_key"] == "g-1"
        assert "api_key_env" not in config  # их классы лишнего поля не примут


def test_config_on_disk_is_not_changed() -> None:
    original = keyed("GEMINI_API_KEY")
    with_keys_from_env(original, secret={"GEMINI_API_KEY": "g-1"}.get)
    assert "api_key" not in original["llm"]["config"]
    assert original["llm"]["config"]["api_key_env"] == "GEMINI_API_KEY"


def test_missing_key_is_refused_by_name_not_replaced_with_openai() -> None:
    with pytest.raises(ValueError, match="GEMINI_API_KEY"):
        with_keys_from_env(keyed("GEMINI_API_KEY"), secret=lambda _name: "")


def test_config_without_a_variable_name_passes_as_is() -> None:
    plain = keyed(None)
    assert with_keys_from_env(plain, secret=lambda _name: "x") == plain


# Задача T20.6: на месте их класса — наследник, а не функция. Их модуль зовёт
# статические методы `OSSBackend.<имя>`; функция на этом месте роняла Mem0.
def test_keyed_backend_is_a_subclass_with_their_static_methods(monkeypatch) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "g-2")
    keyed_cls = keyed_backend(FakeBackend)
    assert issubclass(keyed_cls, FakeBackend)
    assert keyed_cls.__name__ == "FakeBackend"
    assert keyed_cls._reject_dimension_mismatch() == "static"
    made = keyed_cls(keyed("GEMINI_API_KEY"))
    assert made.config["llm"]["config"]["api_key"] == "g-2"
    assert "api_key_env" not in made.config["embedder"]["config"]
