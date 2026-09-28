"""Задача 3F.D2 (D-111): один клиент Mem0 на папку хранилища, закрытие по счётчику."""

from __future__ import annotations

from aec_secret_filter.mem0_shared import shared_factory, storage_key


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
