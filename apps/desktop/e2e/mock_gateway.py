"""Minimal mock of tui_gateway's JSON-RPC 2.0 / WebSocket protocol, used by
the Playwright e2e smoke test (task 0.16). Not a real gateway — just enough
of the wire protocol to drive the chat panel through one full turn:

  connect -> gateway.ready event
  session.create -> {session_id}
  prompt.submit -> {status: "streaming"}, then a streamed "PONG" reply
  session.close -> {closed: true}
  rollback.list / rollback.diff -> two snapshots and one file's difference
    (task 3.3: the change-history pane is what Ctrl+G opens)
  prompt "artifact" -> a turn whose answer carries an HTML artifact fence
  prompt "readpreview" -> a preview.read.request event; the app's
    preview.read.respond is printed on stdout for the test to read
    (task 3.4: read_preview must be ANSWERED for an artifact tab)

Usage: <venv python> mock_gateway.py [port]  (default port 18790)
"""

import asyncio
import json
import sys

from websockets.asyncio.server import ServerConnection, serve

SESSION_ID = "e2e-1"
BT = "```"
NL = "\n"


async def handle(connection: ServerConnection) -> None:
    await connection.send(
        json.dumps({"jsonrpc": "2.0", "method": "event", "params": {"type": "gateway.ready"}})
    )

    async for raw in connection:
        request = json.loads(raw)
        request_id = request["id"]
        method = request["method"]

        if method == "session.create":
            result = {"session_id": SESSION_ID, "messages": [], "info": {}}
            response = {"jsonrpc": "2.0", "id": request_id, "result": result}
            await connection.send(json.dumps(response))
        elif method == "prompt.submit":
            await connection.send(
                json.dumps({"jsonrpc": "2.0", "id": request_id, "result": {"status": "streaming"}})
            )
            text = (request.get("params") or {}).get("text") or ""
            if text.startswith("turn"):
                await stream_full_turn(connection, text)
            elif text.startswith("artifact"):
                await stream_artifact_turn(connection)
            elif text.startswith("mcp"):
                await stream_mcp_setup(connection)
            else:
                await stream_pong(connection)
        elif method == "rollback.list":
            # Two snapshots, newest first — the shape `list_checkpoints` gives
            # THROUGH the gateway: hash, timestamp, and an always-empty message
            # (their handler drops the core's reason/files_changed).
            result = {
                "enabled": True,
                "checkpoints": [
                    {
                        "hash": "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
                        "timestamp": "2026-08-06T10:00:00+03:00",
                        "message": "",
                    },
                    {
                        "hash": "b2c3d4e5f60718293a4b5c6d7e8f90123456789a",
                        "timestamp": "2026-08-06T09:00:00+03:00",
                        "message": "",
                    },
                ],
            }
            await connection.send(
                json.dumps({"jsonrpc": "2.0", "id": request_id, "result": result})
            )
        elif method == "rollback.diff":
            result = {
                "stat": " wiki/smeta.md | 2 +-",
                "diff": (
                    "diff --git a/wiki/smeta.md b/wiki/smeta.md\n"
                    "--- a/wiki/smeta.md\n"
                    "+++ b/wiki/smeta.md\n"
                    "@@ -1 +1 @@\n"
                    "-staroe znachenie\n"
                    "+novoe znachenie\n"
                ),
            }
            await connection.send(
                json.dumps({"jsonrpc": "2.0", "id": request_id, "result": result})
            )
        elif method == "preview.read.respond":
            # The app's answer to read_preview. Printed so the test can read it
            # from stdout: proving the round trip is the point of task 3.4.
            answer = (request.get("params") or {}).get("text") or ""
            print("PREVIEW_READ_RESPOND " + json.dumps(answer), flush=True)
            await connection.send(
                json.dumps({"jsonrpc": "2.0", "id": request_id, "result": {"ok": True}})
            )
        elif method == "session.list":
            # The app asks this after the machine wakes up, to find out whether
            # the socket is still alive (task 3.28). A real gateway answers it,
            # so the mock must too — otherwise every resume looks like a dead
            # connection and the app re-dials for nothing.
            # The list must contain the session this mock actually serves. An
            # empty answer is not "no data" to the app — it is "the session you
            # are in does not exist", and their sidebar drops it.
            await connection.send(
                json.dumps(
                    {
                        "jsonrpc": "2.0",
                        "id": request_id,
                        "result": {
                            "sessions": [
                                {
                                    "id": SESSION_ID,
                                    "title": "e2e",
                                    "preview": "",
                                    "started_at": 0,
                                    "message_count": 0,
                                    "source": "desktop",
                                }
                            ]
                        },
                    }
                )
            )
        elif method == "mcp.setup.respond":
            # The consent card's answer (task 3.8, SPEC UR23). Printed so the
            # test can prove the app sent NOTHING until the person answered.
            print("MCP_SETUP_RESPOND " + json.dumps(request.get("params") or {}), flush=True)
            await connection.send(
                json.dumps({"jsonrpc": "2.0", "id": request_id, "result": {"status": "ok"}})
            )
            await connection.send(
                json.dumps(
                    {
                        "jsonrpc": "2.0",
                        "method": "event",
                        "params": {
                            "type": "message.complete",
                            "session_id": SESSION_ID,
                            "payload": {"text": "", "status": "complete"},
                        },
                    }
                )
            )
        elif method == "session.close":
            await connection.send(
                json.dumps({"jsonrpc": "2.0", "id": request_id, "result": {"closed": True}})
            )


async def stream_pong(connection: ServerConnection) -> None:
    async def push(event_type: str, payload: dict | None = None) -> None:
        params: dict = {"type": event_type, "session_id": SESSION_ID}
        if payload is not None:
            params["payload"] = payload
        await connection.send(json.dumps({"jsonrpc": "2.0", "method": "event", "params": params}))
        await asyncio.sleep(0.03)

    await push("message.start")
    await push("message.delta", {"text": "PO"})
    await push("message.delta", {"text": "NG"})
    await push("message.complete", {"text": "PONG", "status": "complete"})


async def stream_mcp_setup(connection: ServerConnection) -> None:
    """The `setup_mcp` tool's blocking request (task 3.8, SPEC UR23).

    The real core blocks inside the tool until `mcp.setup.respond` arrives, so
    the turn deliberately stays open here: the test's whole point is that the
    app installs nothing while it waits for a person.
    """
    async def push(event_type: str, payload: dict | None = None) -> None:
        params: dict = {"type": event_type, "session_id": SESSION_ID}
        if payload is not None:
            params["payload"] = payload
        await connection.send(json.dumps({"jsonrpc": "2.0", "method": "event", "params": params}))
        await asyncio.sleep(0.03)

    await push("message.start")
    await push(
        "mcp.setup.request",
        {
            "request_id": "mcp-req-1",
            "server": "filesystem",
            "action": "install",
            "reason": "нужен доступ к файлам сметы",
        },
    )


async def stream_full_turn(connection: ServerConnection, prompt: str) -> None:
    """A turn with reasoning and a tool call, in the order and payload shape
    the real gateway uses (task 1.6.2 — reproduction of "карточки хода
    пропадают после ответа" without a live model).

    Shapes taken from `tui_gateway/server.py`: `_on_tool_start` sends
    `{tool_id, name, context}`, `_on_tool_complete` sends `{tool_id, name,
    args, duration_s, result}`, and both are gated on the session's
    tool_progress mode (default "all", i.e. on).
    """

    async def push(event_type: str, payload: dict | None = None) -> None:
        params: dict = {"type": event_type, "session_id": SESSION_ID}
        if payload is not None:
            params["payload"] = payload
        await connection.send(json.dumps({"jsonrpc": "2.0", "method": "event", "params": params}))
        await asyncio.sleep(0.03)

    tool_id = f"call_{prompt[-1]}"
    await push("reasoning.delta", {"text": "**Проверяю источники**\n\nСверю отметки по ТЗ."})
    await push("tool.start", {"tool_id": tool_id, "name": "read_file", "context": "ТЗ-2024.pdf"})
    await push(
        "tool.complete",
        {
            "tool_id": tool_id,
            "name": "read_file",
            "args": {"path": "ТЗ-2024.pdf"},
            "duration_s": 0.42,
            "result": "отметка низа ростверка -2.400",
        },
    )
    await push("message.delta", {"text": "Готово: "})
    await push("message.delta", {"text": f"расхождение найдено ({prompt})."})
    await push(
        "message.complete",
        {"text": f"Готово: расхождение найдено ({prompt}).", "status": "complete"},
    )


ARTIFACT_HTML = (
    "<!doctype html>\n"
    "<html><head><title>Vedomost</title></head>\n"
    "<body><h1>Vedomost peremychek</h1>\n"
    "<table><tr><td>PR-1</td><td>12</td></tr>\n"
    "<tr><td>PR-2</td><td>7</td></tr></table>\n"
    "<p>Sgenerirovano agentom dlya proverki predprosmotra.</p>\n"
    "</body></html>"
)

# The answer carries two things at once: the fenced document their transcript
# turns into an artifact card, and an explicit preview link to an EXTERNAL
# address — the path SPEC HX13 closes. One turn, both halves of task 3.4.
# The address stays UNENCODED on purpose: their message only looks for preview
# links when the text itself contains "https://" or "file://"
# (`assistant-message.tsx`), so a percent-encoded href renders nothing.
EXTERNAL_PREVIEW_LINK = (
    "[Preview: vneshnyaya-stranica](#preview/https://example.com/vneshnyaya-stranica)"
)

ARTIFACT_ANSWER = (
    "Vot vedomost:"
    + NL
    + NL
    + BT
    + "html"
    + NL
    + ARTIFACT_HTML
    + NL
    + BT
    + NL
    + NL
    + EXTERNAL_PREVIEW_LINK
    + NL
)


async def stream_artifact_turn(connection: ServerConnection) -> None:
    """An answer carrying a fenced HTML document — what their transcript turns
    into an artifact card, and the card into a sandboxed preview tab (UR22)."""

    async def push(event_type: str, payload: dict | None = None) -> None:
        params: dict = {"type": event_type, "session_id": SESSION_ID}
        if payload is not None:
            params["payload"] = payload
        await connection.send(json.dumps({"jsonrpc": "2.0", "method": "event", "params": params}))
        await asyncio.sleep(0.03)

    await push("message.start")
    await push("message.delta", {"text": ARTIFACT_ANSWER})
    await push("message.complete", {"text": ARTIFACT_ANSWER, "status": "complete"})
    asyncio.create_task(poll_preview_reads(connection))


async def poll_preview_reads(connection: ServerConnection) -> None:
    """Keep asking read_preview, the way the agent could at any moment.

    Repeating instead of asking once removes the race the test would otherwise
    have to win: the answer is only interesting once a preview tab is open, and
    opening it is several UI steps away. Early answers are empty and simply not
    the line the test waits for.
    """
    for index in range(20):
        await asyncio.sleep(3)
        try:
            await connection.send(
                json.dumps(
                    {
                        "jsonrpc": "2.0",
                        "method": "event",
                        "params": {
                            "type": "preview.read.request",
                            "session_id": SESSION_ID,
                            "payload": {"request_id": f"preview-read-{index}"},
                        },
                    }
                )
            )
        except Exception:
            return


async def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 18790
    async with serve(handle, "127.0.0.1", port):
        print(f"MOCK_READY {port}", flush=True)
        await asyncio.Future()  # run forever, until the process is killed


if __name__ == "__main__":
    asyncio.run(main())
