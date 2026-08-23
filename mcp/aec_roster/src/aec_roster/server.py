"""MCP-сервер `aec-roster` — одно действие: спросить специалиста.

ПОЧЕМУ ЭТО ИНСТРУМЕНТ АГЕНТА, А НЕ КНОПКА. Ответ на `@имя` обязан появиться в
той же переписке, где задан вопрос. Транскрипт переписки строится из ходов
агента, и вставить туда реплику снаружи нечем — у ядра нет «добавить сообщение
в сессию». Значит спрашивает сам агент, а вызов и ответ видны в ленте как
обычный ход (specs/agent-roster.md §Р6, решение владельца 2026-08-22).

ОДНО ДЕЙСТВИЕ И НИЧЕГО БОЛЬШЕ. Ни «список специалистов», ни «выполни команду»:
чем меньше поверхность, тем меньше того, во что модель может быть уговорена
чужим текстом. Список приходит в тексте ошибки, когда имя не найдено, — там он
нужен, и только там.
"""

from __future__ import annotations

from mcp.server import MCPServer
from mcp.server.mcpserver.exceptions import ToolError

from aec_roster.ask import AskError, signed
from aec_roster.roster import load, resolve
from aec_roster.runner import ask, busy


def build_server(roster_path: str, hermes: str) -> MCPServer:
    """Собирает сервер с единственным инструментом.

    ``roster_path`` — снимок роестра, который ведёт приложение;
    ``hermes`` — исполняемый файл ядра (его путь известен приложению, а на
    PATH ядра может не быть: у нас оно стоит в отдельном venv).
    """
    server = MCPServer(name="aec-roster")

    @server.tool(
        description=(
            "Задать вопрос другому специалисту по имени и дождаться его ответа. "
            "Вызывай, когда человек обратился к специалисту через @имя или "
            "попросил спросить/передать кому-то из роестра. Ответ вернётся с "
            "подписью того, кто ответил, — приведи его человеку и укажи автора. "
            "Специалист отвечает в своём постоянном чате и помнит прошлые "
            "разговоры. Ход может занять минуты."
        )
    )
    def ask_specialist(name: str, question: str) -> str:
        try:
            specialist = resolve(load(roster_path), name)
        except AskError as exc:
            raise ToolError(str(exc)) from exc

        try:
            with busy(specialist.name):
                reply = ask(hermes, specialist.name, question)
        except AskError as exc:
            raise ToolError(f"{specialist.shown}: {exc}") from exc

        return signed(reply.answer, specialist.name, specialist.title)

    return server
