"""Minimal mock of tui_gateway's JSON-RPC 2.0 / WebSocket protocol, used by
the Playwright e2e smoke test (task 0.16). Not a real gateway — just enough
of the wire protocol to drive the chat panel through one full turn:

  connect -> gateway.ready event
  session.create -> {session_id}
  prompt.submit -> {status: "streaming"}, then a streamed "PONG" reply
  session.close -> {closed: true}

Usage: <venv python> mock_gateway.py [port]  (default port 18790)
"""

import asyncio
import json
import sys

from websockets.asyncio.server import ServerConnection, serve

SESSION_ID = "e2e-1"


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
                json.dumps(
                    {"jsonrpc": "2.0", "id": request_id, "result": {"status": "streaming"}}
                )
            )
            await stream_pong(connection)
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


async def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 18790
    async with serve(handle, "127.0.0.1", port):
        print(f"MOCK_READY {port}", flush=True)
        await asyncio.Future()  # run forever, until the process is killed


if __name__ == "__main__":
    asyncio.run(main())
