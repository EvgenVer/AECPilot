"""Задача 3H.20 (D-190): факты памяти — командой внутри ядра, без его остановки."""

from __future__ import annotations

import json

import pytest
from aec_secret_filter import memory_facts


class FakeMemory:
    def __init__(self) -> None:
        self.filters: dict | None = None

    def get_all(self, *, filters: dict) -> dict:
        self.filters = filters
        return {
            "results": [
                {
                    "id": "f1",
                    "memory": "Заказчик — ГБУ",
                    "created_at": "2026-10-07",
                    "metadata": {"channel": "tui"},
                }
            ]
        }


class FakeProvider:
    def __init__(self, tool_answer: str = '{"result": "Memory deleted."}') -> None:
        self._backend = type("B", (), {"_memory": FakeMemory()})()
        self._user_id = "proj-x"
        self.calls: list[tuple[str, dict]] = []
        self.tool_answer = tool_answer
        self.closed = False

    def handle_tool_call(self, name: str, args: dict) -> str:
        self.calls.append((name, args))
        return self.tool_answer

    def shutdown(self) -> None:
        self.closed = True


def test_список_фактов_проекта_по_его_user_id() -> None:
    provider = FakeProvider()
    answer = memory_facts.run("list", "", provider)

    assert answer["ok"] is True
    assert answer["user_id"] == "proj-x"
    assert answer["facts"] == [
        {"id": "f1", "text": "Заказчик — ГБУ", "created_at": "2026-10-07", "channel": "tui"}
    ]
    assert provider._backend._memory.filters == {"user_id": "proj-x"}


def test_удаление_их_инструментом_и_чистка_журнала(monkeypatch: pytest.MonkeyPatch) -> None:
    from aec_secret_filter import mem0_turns

    forgotten: list[str] = []
    monkeypatch.setattr(mem0_turns, "forget_scope_turns", lambda _m, user: forgotten.append(user))
    provider = FakeProvider()

    assert memory_facts.run("delete", "f1", provider) == {"ok": True, "deleted": "f1"}
    assert provider.calls == [("mem0_delete", {"memory_id": "f1"})]
    assert forgotten == ["proj-x"]


def test_отказ_удаления_их_словами() -> None:
    provider = FakeProvider('{"error": "Memory not found: f9"}')
    answer = memory_facts.run("delete", "f9", provider)
    assert answer == {"ok": False, "deleted": "f9", "error": "Memory not found: f9"}


def test_без_backend_причина_их_словами() -> None:
    provider = FakeProvider('{"error": "Storage folder q is already accessed"}')
    provider._backend = None
    with pytest.raises(RuntimeError, match="already accessed"):
        memory_facts.run("list", "", provider)


def test_команда_отвечает_одной_строкой_json_и_отпускает_клиента(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = FakeProvider()
    monkeypatch.setattr(memory_facts, "open_provider", lambda *_: provider)

    answer = json.loads(memory_facts.handle("list"))

    assert answer["ok"] is True
    assert [fact["id"] for fact in answer["facts"]] == ["f1"]
    assert provider.closed is True


def test_команда_не_бросает_и_вычищает_секрет(monkeypatch: pytest.MonkeyPatch) -> None:
    secret = "sk-proj-" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6"

    def broken(*_: object) -> None:
        raise ValueError(f"bad key {secret}")

    monkeypatch.setattr(memory_facts, "open_provider", broken)
    answer = json.loads(memory_facts.handle("list"))

    assert answer["ok"] is False
    assert secret not in answer["error"]


def test_команда_регистрируется_в_ядре(monkeypatch: pytest.MonkeyPatch) -> None:
    import aec_secret_filter

    monkeypatch.setattr(aec_secret_filter, "install_sync_guard", lambda: True)
    commands: dict[str, object] = {}

    class Ctx:
        def register_hook(self, name: str, fn) -> None:  # noqa: ANN001
            pass

        def register_command(self, name: str, handler, **_kw) -> None:  # noqa: ANN001
            commands[name] = handler

    aec_secret_filter.register(Ctx())
    assert commands == {"aec-memory-facts": memory_facts.handle}
