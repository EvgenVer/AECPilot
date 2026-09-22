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
  prompt "say: <text>" -> a turn whose answer is <text> verbatim (task 3F.4)
  prompt "edit: <relpath>" -> a turn that REALLY rewrites that file under the
    stamped vault (first line replaced) through a `write_file` tool call, and
    files a checkpoint for it: rollback.list/diff/restore then work on it,
    restore writing the old content back (task 3F.6, blocks 8 and 25)
  the agent's questions to the window (read_preview, drive_preview, the
    tour, setup_mcp) are SERVER->CLIENT REQUESTS, the hermes 0.21.3 shape
    (task 3.B5в, `tui_gateway/server_requests.py`): a frame with a string
    id and a method, answered by a response frame carrying that id. The
    window's answers are printed on stdout for the test to read
    (task 3.4: read_preview must be ANSWERED for an artifact tab)

The sidebar's session list does NOT travel this socket — it is REST. That
half lives in `mock_rest.py` and starts on its own port here (task 3.16).

Usage: <venv python> mock_gateway.py [port]  (default port 18790)
"""

import asyncio
import json
import queue
import sys
from datetime import datetime
from pathlib import Path

from mock_rest import (
    FORM_PAGE_SERVED,
    PREVIEW_OPEN_REQUESTS,
    current_cwd,
    register_session,
    remember_message,
    rollback_mode,
    serve_in_thread,
    transcript_messages,
    visible_sessions,
)
from websockets.asyncio.server import ServerConnection, serve

# The first session — the one the REST half lists as «e2e» from the start.
# Every `session.create` after it mints the next id (`e2e-2`, …), so a test can
# hold two chats and switch between them (position 10.3.1). Events carry the
# session the window last created, resumed or prompted in.
SESSION_ID = "e2e-1"
ACTIVE_SESSION = SESSION_ID
_session_count = 0


def new_session_id() -> str:
    global _session_count, ACTIVE_SESSION
    _session_count += 1
    ACTIVE_SESSION = f"e2e-{_session_count}"
    register_session(ACTIVE_SESSION)
    return ACTIVE_SESSION


def session_result(session_id: str) -> dict:
    """`SessionCreateResult`: both ids the contract names, the contract stamp,
    and the stored history — a session that already has turns comes back with
    them, as it does from a live core (task 3F.5, position 10.3.1)."""
    messages = transcript_messages(session_id)
    return {
        **SESSION_RESULT,
        "session_id": session_id,
        "stored_session_id": session_id,
        "message_count": len(messages),
        "messages": messages,
    }


# What a live core puts into `session.info`: `DESKTOP_BACKEND_CONTRACT = 7`
# (tui_gateway/server.py at the 0.21.3 pin). An empty `info` made the window
# post a PERSISTENT «backend older than this build» warning that a real core
# never shows — and its toast sat on top of the transcript, swallowing clicks
# (task 3F.4, position 16.1.1).
SESSION_INFO = {"desktop_contract": 7}
# `session.create`/`session.resume` answer with BOTH ids the contract names
# (`SessionCreateResult`): the runtime `session_id` and the durable
# `stored_session_id`. Without the stored id the window has no route for the
# chat, keys the composer by the runtime id, and its drift guard reads the
# second send as "the user switched chats" and drops it on the floor
# (`[submit-drift-abort] composer:e2e-1->null`, task 3F.4). One id for both —
# the REST half lists the same `e2e-1` row, so the sidebar and the route agree.
SESSION_RESULT = {
    "session_id": SESSION_ID,
    "stored_session_id": SESSION_ID,
    "message_count": 0,
    "messages": [],
    "info": SESSION_INFO,
}
BT = "```"
NL = "\n"

# Server->client requests in flight: id -> method. The answer frame carries
# only the id, so the label the test greps for is looked up here.
OPEN_SERVER_REQUESTS: dict[str, str] = {}
_next_request = 0

ANSWER_LABELS = {
    "preview.read": "PREVIEW_READ_RESPOND",
    "preview.act": "PREVIEW_ACT_RESPOND",
    "tour": "TOUR_RESPOND",
    "mcp.setup": "MCP_SETUP_RESPOND",
}


async def ask(connection: ServerConnection, method: str, params: dict) -> str:
    """Send one server->client request the way the real core does
    (`server_requests.send`): string id so it can never collide with the
    window's integer ids, `session_id` inside params. Returns the id."""
    global _next_request
    _next_request += 1
    request_id = f"srq-{_next_request:012x}"
    OPEN_SERVER_REQUESTS[request_id] = method
    await connection.send(
        json.dumps(
            {
                "jsonrpc": "2.0",
                "id": request_id,
                "method": method,
                "params": {"session_id": ACTIVE_SESSION, **params},
            }
        )
    )
    return request_id


async def take_answer(connection: ServerConnection, frame: dict) -> None:
    """A response frame from the window: the answer to one of our requests.
    Printed under the request's label so the test can prove the round trip;
    the `value` is the JSON string their handler serializes (`_ask` in the
    core reads exactly that field)."""
    request_id = frame.get("id")
    method = OPEN_SERVER_REQUESTS.pop(request_id, None)
    label = ANSWER_LABELS.get(method or "", "SERVER_REQUEST_RESPOND")
    if "error" in frame:
        print(f"{label} ERROR " + json.dumps(frame["error"]), flush=True)
        return
    result = frame.get("result") or {}
    if method == "mcp.setup":
        # The consent card's answer (task 3.8, SPEC UR23). Printed with the id
        # so the test can prove the app sent NOTHING until the person answered.
        print(f"{label} " + json.dumps({"id": request_id, "result": result}), flush=True)
        await connection.send(
            json.dumps(
                {
                    "jsonrpc": "2.0",
                    "method": "event",
                    "params": {
                        "type": "message.complete",
                        "session_id": ACTIVE_SESSION,
                        "payload": {"text": "", "status": "complete"},
                    },
                }
            )
        )
        await settle_turn(connection, "")
        return
    print(f"{label} " + json.dumps(result.get("value") or ""), flush=True)


async def handle(connection: ServerConnection) -> None:
    global ACTIVE_SESSION
    await connection.send(
        json.dumps({"jsonrpc": "2.0", "method": "event", "params": {"type": "gateway.ready"}})
    )

    asyncio.create_task(stream_drive_turn(connection))
    asyncio.create_task(push_preview_open(connection))

    async for raw in connection:
        request = json.loads(raw)
        if "method" not in request:
            await take_answer(connection, request)
            continue
        request_id = request["id"]
        method = request["method"]
        # Every RPC by name, so a failed test's stdout shows what the window
        # actually asked (the polling `session.active_list` excluded). With the
        # session it names and the command/text it carries: several sessions
        # live in this mock at once (task 3F.5), and a turn that lands nowhere
        # is unreadable without the id.
        if method != "session.active_list":
            params = request.get("params") or {}
            detail = " ".join(
                f"{key}={str(params[key])[:40]!r}"
                for key in ("session_id", "command", "text")
                if isinstance(params.get(key), str)
            )
            print(f"MOCK_RPC {method} {detail}".rstrip(), flush=True)

        if method == "session.create":
            response = {
                "jsonrpc": "2.0",
                "id": request_id,
                "result": session_result(new_session_id()),
            }
            await connection.send(json.dumps(response))
        elif method == "session.resume":
            # Added 2026-09-08 after a FLAKE, not a theory: with no handler here
            # the window answered `-32601 method not found`, the chat pane fell
            # into "Couldn't load this session" and every later test that needs
            # the composer died — while the run before and after passed on the
            # same build. The window asks this whenever it loses the live
            # runtime ref (a reconnect, a renderer crash, a timed-out request),
            # so a mock without it makes the suite flaky by construction. A real
            # gateway rebinds the stored session; nothing to rebuild here — the
            # transcript lives in the window.
            wanted = (request.get("params") or {}).get("session_id")
            if isinstance(wanted, str) and wanted:
                ACTIVE_SESSION = wanted
            await connection.send(
                json.dumps(
                    {
                        "jsonrpc": "2.0",
                        "id": request_id,
                        "result": session_result(ACTIVE_SESSION),
                    }
                )
            )
        elif method == "session.activate":
            # Switching to a session that is still LIVE in the gateway (their
            # sidebar asks this, not `session.resume`, for a row it knows is
            # running or was just left). Same answer: the ids and the history.
            wanted = (request.get("params") or {}).get("session_id")
            if isinstance(wanted, str) and wanted:
                ACTIVE_SESSION = wanted
            await connection.send(
                json.dumps(
                    {
                        "jsonrpc": "2.0",
                        "id": request_id,
                        "result": session_result(ACTIVE_SESSION),
                    }
                )
            )
        elif method == "prompt.submit":
            await connection.send(
                json.dumps({"jsonrpc": "2.0", "id": request_id, "result": {"status": "streaming"}})
            )
            text = (request.get("params") or {}).get("text") or ""
            target = (request.get("params") or {}).get("session_id")
            if isinstance(target, str) and target:
                ACTIVE_SESSION = target
            remember_message(ACTIVE_SESSION, "user", text)
            if text.startswith("slow:"):
                # The person sends and walks away mid-turn (block 27): the
                # answer lands three seconds later, in whatever state the
                # window is in by then.
                await asyncio.sleep(3)
                text = text[5:].strip()
            if text.startswith("turn"):
                await stream_full_turn(connection, text)
            elif text.startswith("artifact"):
                await stream_artifact_turn(connection)
            elif text.startswith("mcp"):
                await stream_mcp_setup(connection)
            elif text.startswith("say:"):
                await stream_say(connection, text[4:].strip())
            elif text.startswith("edit:"):
                await stream_edit_turn(connection, text[5:].strip())
            else:
                await stream_pong(connection)
        elif method == "rollback.list":
            # Newest first — the shape `list_checkpoints` gives THROUGH the
            # gateway: hash, timestamp, and an always-empty message (their
            # handler drops the core's reason/files_changed). The snapshots an
            # `edit:` prompt took come before the static pair; the test's
            # `PUT /api/_mock/rollback` can empty the list or switch it off.
            mode = rollback_mode()
            if mode == "disabled":
                result = {"enabled": False, "checkpoints": []}
            elif mode == "empty":
                result = {"enabled": True, "checkpoints": []}
            else:
                result = {
                    "enabled": True,
                    "checkpoints": [
                        {"hash": edit["hash"], "timestamp": edit["timestamp"], "message": ""}
                        for edit in reversed(EDITS)
                    ]
                    + STATIC_CHECKPOINTS,
                }
            await connection.send(
                json.dumps({"jsonrpc": "2.0", "id": request_id, "result": result})
            )
        elif method == "rollback.diff":
            wanted = (request.get("params") or {}).get("hash")
            edit = next((item for item in EDITS if item["hash"] == wanted), None)
            if edit is None:
                result = {"stat": STATIC_STAT, "diff": STATIC_DIFF}
            else:
                result = {"stat": edit["stat"], "diff": edit["diff"]}
            await connection.send(
                json.dumps({"jsonrpc": "2.0", "id": request_id, "result": result})
            )
        elif method == "rollback.restore":
            # The way back (positions 8.4.1, 25.4.2): the snapshot's content
            # goes back on disk — for the whole snapshot or for the one file
            # `file_path` names. The manager's own verdict travels as
            # `success`, a refusal as `success: false` with `error`, exactly as
            # the contract has it (specs/checkpoints-rollback.md).
            params = request.get("params") or {}
            wanted = params.get("hash")
            file_path = params.get("file_path")
            edit = next((item for item in EDITS if item["hash"] == wanted), None)
            if edit is None and any(item["hash"] == wanted for item in STATIC_CHECKPOINTS):
                result = {"success": True, "restored_to": str(wanted)[:8], "reason": ""}
            elif edit is None:
                result = {"success": False, "error": f"Checkpoint '{wanted}' not found"}
            elif file_path is not None and file_path.replace("\\", "/") != edit["path"]:
                result = {"success": False, "error": f"File '{file_path}' not in checkpoint"}
            else:
                Path(edit["abs_path"]).write_text(edit["before"], encoding="utf-8", newline="\n")
                result = {
                    "success": True,
                    "restored_to": edit["hash"][:8],
                    "reason": "",
                    **({} if file_path is None else {"file": file_path}),
                }
            print(f"MOCK_RESTORE {json.dumps(result, ensure_ascii=False)}", flush=True)
            await connection.send(
                json.dumps({"jsonrpc": "2.0", "id": request_id, "result": result})
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
                        "result": {"sessions": visible_sessions()},
                    }
                )
            )
        elif method == "model.options":
            # Тот же довод, что и у REST-половины: неотвеченный метод превращался
            # в поток уведомлений об ошибке поверх боковой панели.
            await connection.send(
                json.dumps(
                    {
                        "jsonrpc": "2.0",
                        "id": request_id,
                        "result": {"model": "mock-model", "provider": "mock", "providers": []},
                    }
                )
            )
        elif method == "profiles.create":
            # Задача 5.14. Мок печатает SOUL, с которым пришёл вызов: окно
            # дописывает в него строку языка на проходе моста, и проверить это
            # можно только с той стороны, куда вызов уехал.
            created = request.get("params") or {}
            print(
                "MOCK_PROFILE_SOUL " + json.dumps(created.get("soul", ""), ensure_ascii=False),
                flush=True,
            )
            await connection.send(
                json.dumps(
                    {
                        "jsonrpc": "2.0",
                        "id": request_id,
                        "result": {"name": created.get("name", ""), "created": True},
                    }
                )
            )
        elif method == "session.close":
            await connection.send(
                json.dumps({"jsonrpc": "2.0", "id": request_id, "result": {"closed": True}})
            )
        else:
            # Диагностика подъёма пина: раньше неизвестный метод оставался БЕЗ
            # ОТВЕТА, и их клиент ждал его вечно — экран поднимался, но первый
            # же вызов нового метода вешал цепочку. Печатаем имя и отвечаем
            # ошибкой, как отвечает настоящий шлюз.
            print("MOCK_UNKNOWN_METHOD " + method, flush=True)
            await connection.send(
                json.dumps(
                    {
                        "jsonrpc": "2.0",
                        "id": request_id,
                        "error": {"code": -32601, "message": f"method not found: {method}"},
                    }
                )
            )


async def settle_turn(connection: ServerConnection, answer: str) -> None:
    """What a live core sends AFTER `message.complete`: the end-of-turn
    `session.info` with `running: false` (`_emit_settled_session_info`,
    tui_gateway/session_workdir.py at the 0.21.3 pin). The answer is also
    written into the stored transcript the REST half serves.

    The window releases `busy` on THIS event, not on `message.complete`. A mock
    that stopped at `message.complete` left the window busy forever, and every
    later message went down the steer path — accepted by nothing, shown
    nowhere, the text still sitting in the composer (task 3F.4: no second
    prompt in one session ever reached the mock).
    """
    if answer:
        remember_message(ACTIVE_SESSION, "assistant", answer)
    await connection.send(
        json.dumps(
            {
                "jsonrpc": "2.0",
                "method": "event",
                "params": {
                    "type": "session.info",
                    "session_id": ACTIVE_SESSION,
                    "payload": {"running": False, **SESSION_INFO},
                },
            }
        )
    )
    await asyncio.sleep(0.03)


async def stream_pong(connection: ServerConnection) -> None:
    async def push(event_type: str, payload: dict | None = None) -> None:
        params: dict = {"type": event_type, "session_id": ACTIVE_SESSION}
        if payload is not None:
            params["payload"] = payload
        await connection.send(json.dumps({"jsonrpc": "2.0", "method": "event", "params": params}))
        await asyncio.sleep(0.03)

    await push("message.start")
    await push("message.delta", {"text": "PO"})
    await push("message.delta", {"text": "NG"})
    await push("message.complete", {"text": "PONG", "status": "complete"})
    await settle_turn(connection, "PONG")


async def stream_say(connection: ServerConnection, answer: str) -> None:
    """Answer with the prompt's own text, verbatim (task 3F.4).

    The acceptance run needs answers that CITE the sample documents —
    `[src: <source_id>/ведомость.xlsx#Ведомость!C5]` — and the source id is
    minted by the app when the folder is connected, so no canned answer can
    carry it. The test composes the answer and sends it as `say: …`; this mock
    just streams it back through the same three events a real turn uses.
    """

    async def push(event_type: str, payload: dict | None = None) -> None:
        params: dict = {"type": event_type, "session_id": ACTIVE_SESSION}
        if payload is not None:
            params["payload"] = payload
        await connection.send(json.dumps({"jsonrpc": "2.0", "method": "event", "params": params}))
        await asyncio.sleep(0.03)

    await push("message.start")
    await push("message.delta", {"text": answer})
    await push("message.complete", {"text": answer, "status": "complete"})
    await settle_turn(connection, answer)


async def stream_mcp_setup(connection: ServerConnection) -> None:
    """The `setup_mcp` tool's blocking request (task 3.8, SPEC UR23).

    The real core blocks inside the tool until the window answers the
    `mcp.setup` request, so the turn deliberately stays open here: the test's
    whole point is that the app installs nothing while it waits for a person.
    """

    async def push(event_type: str, payload: dict | None = None) -> None:
        params: dict = {"type": event_type, "session_id": ACTIVE_SESSION}
        if payload is not None:
            params["payload"] = payload
        await connection.send(json.dumps({"jsonrpc": "2.0", "method": "event", "params": params}))
        await asyncio.sleep(0.03)

    await push("message.start")
    await ask(
        connection,
        "mcp.setup",
        {"server": "filesystem", "action": "install", "reason": "нужен доступ к файлам сметы"},
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
        params: dict = {"type": event_type, "session_id": ACTIVE_SESSION}
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
    await settle_turn(connection, f"Готово: расхождение найдено ({prompt}).")


# The two snapshots every earlier test knows (smoke «Ctrl+G», block 7): the
# fixed dates make the list independent of the clock.
STATIC_CHECKPOINTS = [
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
]
STATIC_STAT = " wiki/smeta.md | 2 +-"
STATIC_DIFF = (
    "diff --git a/wiki/smeta.md b/wiki/smeta.md\n"
    "--- a/wiki/smeta.md\n"
    "+++ b/wiki/smeta.md\n"
    "@@ -1 +1 @@\n"
    "-staroe znachenie\n"
    "+novoe znachenie\n"
)

# Snapshots the `edit:` prompt took, oldest first: what `rollback.list` shows
# on top of the static pair and what `rollback.restore` writes back.
EDITS: list[dict] = []

# What the agent writes in place of the file's first line.
EDITED_LINE = "строка после правки агента"


def _edit_diff(path: str, before: str, after: str) -> str:
    """A unified diff of ONE replaced line — the shape git prints, which is
    what the pane's parser reads (`parseDiffFiles`/`parseDiffLines`)."""
    old_line = before.split("\n", 1)[0]
    new_line = after.split("\n", 1)[0]
    return (
        f"diff --git a/{path} b/{path}\n"
        f"--- a/{path}\n"
        f"+++ b/{path}\n"
        "@@ -1 +1 @@\n"
        f"-{old_line}\n"
        f"+{new_line}\n"
    )


async def stream_edit_turn(connection: ServerConnection, relpath: str) -> None:
    """A turn that REALLY edits a vault file (task 3F.6, blocks 8 and 25).

    The core snapshots the directory BEFORE a file-edit tool runs and then
    writes; the window learns of the edit from the tool events — `write_file`
    with `args.path` and a result carrying `inline_diff` is what their
    transcript folds into the «N файлов изменено» card (`changed-files.ts`,
    `FILE_EDIT_TOOL_NAMES`). Both halves happen here: the file on disk changes
    (first line replaced), and a checkpoint with the old content is filed so
    `rollback.*` can show and undo exactly this edit.
    """

    async def push(event_type: str, payload: dict | None = None) -> None:
        params: dict = {"type": event_type, "session_id": ACTIVE_SESSION}
        if payload is not None:
            params["payload"] = payload
        await connection.send(json.dumps({"jsonrpc": "2.0", "method": "event", "params": params}))
        await asyncio.sleep(0.03)

    cwd = current_cwd()
    path = relpath.replace("\\", "/")
    if not cwd or not path or path.startswith("/") or ".." in path.split("/"):
        await stream_say(connection, f"Не могу править {relpath!r}: нет открытого проекта.")
        return

    target = Path(cwd) / path
    target.parent.mkdir(parents=True, exist_ok=True)
    before = target.read_text(encoding="utf-8") if target.exists() else ""
    rest = before.split("\n", 1)
    after = EDITED_LINE + ("\n" + rest[1] if len(rest) > 1 else "\n")
    diff = _edit_diff(path, before, after)
    stamp = datetime.now().astimezone().replace(microsecond=0).isoformat()
    number = len(EDITS) + 1
    edit = {
        "hash": f"{number:08x}" + "e" * 32,
        "timestamp": stamp,
        "path": path,
        "abs_path": str(target),
        "before": before,
        "after": after,
        "diff": diff,
        "stat": f" {path} | 2 +-",
    }
    EDITS.append(edit)

    tool_id = f"call_edit_{number}"
    await push("tool.start", {"tool_id": tool_id, "name": "write_file", "context": path})
    # `newline`: the bytes the test wrote, not Windows line endings.
    target.write_text(after, encoding="utf-8", newline="\n")
    await push(
        "tool.complete",
        {
            "tool_id": tool_id,
            "name": "write_file",
            "args": {"path": path, "content": after},
            "duration_s": 0.11,
            "result": json.dumps(
                {"success": True, "path": path, "inline_diff": diff}, ensure_ascii=False
            ),
        },
    )
    answer = f"Готово: файл {path} изменён."
    await push("message.delta", {"text": answer})
    await push("message.complete", {"text": answer, "status": "complete"})
    await settle_turn(connection, answer)


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
        params: dict = {"type": event_type, "session_id": ACTIVE_SESSION}
        if payload is not None:
            params["payload"] = payload
        await connection.send(json.dumps({"jsonrpc": "2.0", "method": "event", "params": params}))
        await asyncio.sleep(0.03)

    await push("message.start")
    await push("message.delta", {"text": ARTIFACT_ANSWER})
    await push("message.complete", {"text": ARTIFACT_ANSWER, "status": "complete"})
    await settle_turn(connection, ARTIFACT_ANSWER)
    asyncio.create_task(poll_preview_reads(connection))


async def push_preview_open(connection: ServerConnection) -> None:
    """Open a LOCAL FILE in the preview pane (task 3E.25, UR22).

    `preview.open` is what their `open_preview` tool emits through the desktop_ui
    bridge (`tools/open_preview_tool.py`), and the path stays RELATIVE on purpose:
    resolving it against the session cwd is the half of the job that belongs to
    the main process. No label — the pane then names the tab after the file, which
    is what the test looks for.

    Driven by the REST half rather than by a prompt, like `stream_drive_turn`:
    the real tool emits an EVENT, not answer text, and the test then spends none
    of the composer's queue on itself.
    """
    while True:
        try:
            url = PREVIEW_OPEN_REQUESTS.get_nowait()
        except queue.Empty:
            await asyncio.sleep(0.2)
            continue

        try:
            await connection.send(
                json.dumps(
                    {
                        "jsonrpc": "2.0",
                        "method": "event",
                        "params": {
                            "type": "preview.open",
                            "session_id": ACTIVE_SESSION,
                            "payload": {"url": url},
                        },
                    }
                )
            )
        except Exception:
            return


async def stream_drive_turn(connection: ServerConnection) -> None:
    """The agent using the page open in the preview pane (task 3E.12, UR36).

    Started by the REST half the moment the guest asks for `/page/form`, not by
    a prompt: once a preview pane is open the composer stops delivering a second
    turn to this mock (measured 2026-09-12 — the text stays in the box and the
    session shows "Waking up default…"), while this signal comes from the guest
    itself and cannot be wrong about whether the page is there.

    Actions address the page by CSS SELECTOR rather than by a ref from the
    inventory, on purpose: a ref would make every later step depend on the
    order the first one answered in, and a hung test would then say "click
    failed" when what really failed was `elements`. Their tool takes either.

    The tour runs on the same guest page (`surface="preview"`), which is the
    half that proves driver.js really got injected into someone else's page.
    """

    async def push(method: str, params: dict, pause: float = 1.5) -> None:
        await ask(connection, method, params)
        # Each request blocks the real core until the window answers; here the
        # pause just keeps the steps in order and lets the page settle.
        await asyncio.sleep(pause)

    # Repeated for the same reason `poll_preview_reads` repeats: the page the
    # actions need is several UI steps away, and early rounds simply answer
    # "no live page". Every step is idempotent — typing re-types, clicking
    # re-clicks, and the echo the test reads says the same thing either way.
    while not FORM_PAGE_SERVED.is_set():
        await asyncio.sleep(0.5)

    # Rounds, not one shot: the test after the drive one changes the window zoom
    # and waits for the hand to hit the same button again (task 3E.24), so the
    # loop has to outlive both tests.
    for _ in range(16):
        await asyncio.sleep(3)
        try:
            await push(
                "preview.act",
                {"action": "elements"},
            )
            await push(
                "preview.act",
                {
                    "action": "type",
                    "selector": "#obj",
                    "text": "AR-12",
                },
            )
            await push("preview.act", {"action": "click", "selector": "#go"})
            await push(
                "tour",
                {
                    "action": "targets",
                    "surface": "preview",
                },
            )
            await push(
                "tour",
                {
                    "action": "show",
                    "surface": "preview",
                    "selector": "#go",
                    "title": "Otpravka",
                    "text": "Zdes zayavka uhodit zamerschiku.",
                },
            )
        except Exception:
            return


async def poll_preview_reads(connection: ServerConnection) -> None:
    """Keep asking read_preview, the way the agent could at any moment.

    Repeating instead of asking once removes the race the test would otherwise
    have to win: the answer is only interesting once a preview tab is open, and
    opening it is several UI steps away. Early answers are empty and simply not
    the line the test waits for.
    """
    for _ in range(20):
        await asyncio.sleep(3)
        try:
            await ask(connection, "preview.read", {})
        except Exception:
            return


async def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 18790
    # The REST half (task 3.16). A separate port rather than one socket serving
    # both: the real core multiplexes them, but doing that here would mean
    # hand-rolling HTTP inside the websockets handshake — cost with no bearing
    # on what the tests prove, since the app is told both addresses anyway.
    rest_port = serve_in_thread()
    async with serve(handle, "127.0.0.1", port):
        print(f"MOCK_REST_READY {rest_port}", flush=True)
        print(f"MOCK_READY {port}", flush=True)
        await asyncio.Future()  # run forever, until the process is killed


if __name__ == "__main__":
    asyncio.run(main())
