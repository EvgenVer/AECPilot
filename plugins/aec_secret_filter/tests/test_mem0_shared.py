"""Задача 3F.D2 (D-111): один клиент Mem0 на папку хранилища, закрытие по счётчику."""

from __future__ import annotations

import pytest
from aec_secret_filter.mem0_shared import shared_factory, storage_key, with_keys_from_env


class FakeBackend:
    opened = 0

    def __init__(self, oss_config: dict) -> None:
        FakeBackend.opened += 1
        self.config = oss_config
        self.closed = False

    def search(self, query: str) -> str:
        return f"found {query}"

    def close(self) -> None:
        self.closed = True


def cfg(path: str | None) -> dict:
    return {
        "vector_store": {
            "provider": "qdrant",
            "config": {"path": path} if path else {"url": "http://x"},
        }
    }


def setup_function() -> None:
    FakeBackend.opened = 0


def test_agents_on_one_folder_share_one_client(tmp_path) -> None:
    factory = shared_factory(FakeBackend)
    first = factory(cfg(str(tmp_path / "q")))
    second = factory(cfg(str(tmp_path / "q")))
    assert FakeBackend.opened == 1
    assert first.search("x") == "found x"
    assert second.config is first.config


def test_client_closes_only_when_the_last_agent_lets_go(tmp_path) -> None:
    factory = shared_factory(FakeBackend)
    first = factory(cfg(str(tmp_path / "q")))
    second = factory(cfg(str(tmp_path / "q")))
    backend = first._aec_backend
    first.close()
    first.close()  # повторное закрытие того же агента не считается дважды
    assert backend.closed is False
    second.close()
    assert backend.closed is True
    factory(cfg(str(tmp_path / "q")))
    assert FakeBackend.opened == 2  # после закрытия — новый клиент


def test_different_folders_and_servers_are_not_shared(tmp_path) -> None:
    factory = shared_factory(FakeBackend)
    factory(cfg(str(tmp_path / "a")))
    factory(cfg(str(tmp_path / "b")))
    server_one = factory(cfg(None))
    factory(cfg(None))
    assert FakeBackend.opened == 4
    assert isinstance(server_one, FakeBackend)  # без пути — их объект как есть


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
