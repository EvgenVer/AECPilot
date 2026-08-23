"""Сам инструмент: что видит агент и что получает в ответ (задача 3C.7).

Ядро здесь не поднимается — запуск подменён. Проверяется поверхность: как
инструмент называется, сколько их всего и что возвращается человеку, когда
имени в роестре нет.
"""

from __future__ import annotations

import json

import pytest
from aec_roster import server as server_module
from aec_roster.ask import AskError, Reply
from aec_roster.server import build_server
from mcp_harness import connected_session

HERMES = "hermes"


@pytest.fixture
def roster_file(tmp_path):
    path = tmp_path / "roster.json"
    path.write_text(
        json.dumps({"specialists": [{"name": "smeta", "title": "Смета"}]}, ensure_ascii=False),
        encoding="utf-8",
    )
    return str(path)


def text_of(result) -> str:
    return "\n".join(block.text for block in result.content if getattr(block, "text", None))


@pytest.mark.anyio
async def test_the_agent_is_given_exactly_one_action(roster_file) -> None:
    async with connected_session(build_server(roster_file, HERMES)) as client:
        tools = (await client.list_tools()).tools

    assert [tool.name for tool in tools] == ["ask_specialist"]


@pytest.mark.anyio
async def test_the_answer_says_who_gave_it(roster_file, monkeypatch) -> None:
    monkeypatch.setattr(
        server_module, "ask", lambda *_: Reply(answer="Считаю по ГЭСН", session_id="с-1")
    )

    async with connected_session(build_server(roster_file, HERMES)) as client:
        result = await client.call_tool("ask_specialist", {"name": "@Смета", "question": "почём"})

    assert not result.is_error
    assert text_of(result).startswith("Смета отвечает:")
    assert "Считаю по ГЭСН" in text_of(result)


@pytest.mark.anyio
async def test_only_the_roster_name_reaches_the_command(roster_file, monkeypatch) -> None:
    seen: list[str] = []
    monkeypatch.setattr(
        server_module,
        "ask",
        lambda _bin, profile, _q: seen.append(profile) or Reply(answer="да", session_id=""),
    )

    async with connected_session(build_server(roster_file, HERMES)) as client:
        await client.call_tool("ask_specialist", {"name": "Смета", "question": "?"})

    # Не «Смета» и не то, что придумала модель, — имя профиля из снимка.
    assert seen == ["smeta"]


@pytest.mark.anyio
async def test_unknown_name_comes_back_as_an_answerable_error(roster_file) -> None:
    async with connected_session(build_server(roster_file, HERMES)) as client:
        result = await client.call_tool("ask_specialist", {"name": "Бухгалтерия", "question": "?"})

    assert result.is_error
    # Список в тексте ошибки — чтобы модель позвала правильного, а не гадала.
    assert "Смета" in text_of(result)


@pytest.mark.anyio
async def test_a_failed_talk_names_the_specialist(roster_file, monkeypatch) -> None:
    def refuse(*_):
        raise AskError("не ответил за 600 с")

    monkeypatch.setattr(server_module, "ask", refuse)

    async with connected_session(build_server(roster_file, HERMES)) as client:
        result = await client.call_tool("ask_specialist", {"name": "Смета", "question": "?"})

    assert result.is_error
    assert "Смета: не ответил" in text_of(result)
