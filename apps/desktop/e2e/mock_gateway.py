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

TWO WIRES, chosen by the handshake as the core chooses them (owner's decision
2026-11-20, closing the T53 debt). A client that offers the subprotocol
`hermes-gateway-v1` with a one-use ticket (`hermes-gateway-ticket.<t>`) gets the
single gateway's CANONICAL wire — what the installed app speaks to its own
core: `gateway.ready` says `session_authority`, the session verbs follow the
core's closed contracts (`tui_gateway/contracts/canonical_sessions.py`),
`prompt.submit` answers an admission receipt, and every session event carries
`replay_epoch`/`seq` (and, inside a turn, `authority_epoch`,
`execution_generation`, `admission_id`) — shapes taken from the frames the core
itself captured (`apps/desktop/src/lib/execution-authority.frames.json` in
their tree). Requests are checked against the PINNED core's own contract
registry, imported from the core checkout, and so are this mock's own answers:
a lifted pin that changes a contract fails here, not in the person's hands. A
client that offers no subprotocol gets the LEGACY wire of `hermes serve`, which
the server role, a remote and an SSH connection still speak.

Usage: <venv python> mock_gateway.py [port]  (default port 18790)
"""

import asyncio
import contextvars
import json
import queue
import sys
import time
import uuid
from datetime import datetime
from pathlib import Path

from mock_rest import (
    FORM_PAGE_SERVED,
    PREVIEW_OPEN_REQUESTS,
    current_cwd,
    known_session,
    note_wire,
    register_session,
    remember_message,
    rollback_mode,
    serve_in_thread,
    spend_ticket,
    transcript_messages,
    visible_sessions,
)
from websockets.asyncio.server import ServerConnection, serve
from websockets.datastructures import Headers
from websockets.exceptions import ConnectionClosed
from websockets.http11 import Request, Response

# The first session — the one the REST half lists as «e2e» from the start.
# Every `session.create` after it mints the next id (`e2e-2`, …), so a test can
# hold two chats and switch between them (position 10.3.1). Events carry the
# session the window last created, resumed or prompted in.
SESSION_ID = "e2e-1"
ACTIVE_SESSION = SESSION_ID
# `e2e-1` — заготовленная строка списка («e2e», mock_rest.LIVE_SESSION_ID), не
# новая сессия: новые нумеруются с `e2e-2`, как у ядра — каждой своя строка.
# До D-178 номер `e2e-1` съедала сессия, которую главный процесс заводил ради
# списка моделей, и первая сессия окна случайно получала свою строку.
_session_count = 1


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
    print(f"{label} " + json.dumps(result.get("value") or ""), flush=True)


# --- The canonical wire (the single gateway) --------------------------------

CANONICAL_PROTOCOL = "hermes-gateway-v1"
TICKET_PROTOCOL_PREFIX = "hermes-gateway-ticket."
# One owner run: the replay epoch a reconnecting window compares, and the
# authority epoch every turn frame carries.
REPLAY_EPOCH = uuid.uuid4().hex
AUTHORITY_EPOCH = 1
INSTANCE_ID = "mock-gateway"


def _load_contracts() -> dict:
    """The pinned core's contract registry — the same tables its dispatcher
    checks (`gateway/session_controls.py::dispatch`). Imported from the core
    checkout this venv installs; it writes nothing and reads no profile."""
    from tui_gateway.contracts.registry import (
        CANONICAL_METHODS,
        METHODS,
        canonical_param_problems,
    )

    return {"methods": CANONICAL_METHODS, "legacy": METHODS, "problems": canonical_param_problems}


CONTRACTS = _load_contracts()

# The 15 legacy verbs the gateway does not serve (T53.1, `ws_legacy_fallback.py`):
# it holds the sessions itself and answers -32601. The donor's canonical adapter
# translates or survives each of them; one that still arrives is a finding.
NOT_SERVED = frozenset(
    {
        "session.activate",
        "session.archive",
        "session.branch",
        "session.branch_stored",
        "session.branch_whole",
        "session.close",
        "session.compress",
        "session.cwd.set",
        "session.delete",
        "session.status",
        "session.title",
        "session.undo",
        "session.usage",
        "session.workspace.move",
        "agents.list",
    }
)

# Methods the core serves on both wires that the mock does not model yet: the
# window gets -32601 and takes its fallback (a gap older than the canonical wire,
# measured over the whole fast run on 2026-11-20). Kept as an explicit list so a
# method the window starts calling later is a visible MOCK_UNKNOWN_METHOD.
NOT_MODELLED = frozenset(
    {
        "client.capabilities",
        "command.dispatch",
        "commands.catalog",
        "complete.path",
        "config.get",
        "file.attach",
        "free_tier.status",
        "mcp.servers.status",
        "plugins.manage",
        "process.list",
        "profiles.list",
        "projects.list",
        "reload.mcp",
        "session.control.read",
        "setup.runtime_check",
        "setup.status",
        "slash.exec",
        "subagent.list",
        "subagent.roster",
    }
)

# Per stored session: the CAS revision, the execution generation, its title and
# archive flag (what `session.mutate` edits), the event stream's last sequence
# and the frames it carried (`session.events.since` replays them).
STATE: dict[str, dict] = {}
# Per session: the admission of the turn now running.
TURNS: dict[str, dict] = {}
_admissions = 0
_subscriptions = 0


# The session a turn's frames belong to. Set inside each turn's task, so a
# `session.resume` of another chat while a turn streams (or waits on a person)
# cannot re-address its frames — the global `ACTIVE_SESSION` could (review of
# 9fb6fdc). Outside a turn, the session the window last named.
TURN_SESSION: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "turn_session", default=None
)


def current_session() -> str:
    return TURN_SESSION.get() or ACTIVE_SESSION


# Per session: the FIFO the owner keeps (one turn runs, the next waits), and
# the task of the running turn — a `session.interrupt` cancels it.
LOCKS: dict[str, asyncio.Lock] = {}
TURN_TASKS: dict[str, asyncio.Task] = {}
# A turn waiting on the person's `connection.respond` (the MCP consent card).
CONSENTS: dict[str, asyncio.Event] = {}


def session_state(session_id: str) -> dict:
    return STATE.setdefault(
        session_id,
        {
            # The captured frames: a fresh session sits at revision 0.
            "revision": 0,
            "generation": 0,
            "title": None,
            "archived": False,
            "seq": 0,
            "frames": [],
        },
    )


def is_canonical(connection: ServerConnection) -> bool:
    return connection.subprotocol == CANONICAL_PROTOCOL


def _offered_protocols(headers: Headers) -> list[str]:
    return [
        item.strip()
        for value in headers.get_all("Sec-WebSocket-Protocol")
        for item in value.split(",")
        if item.strip()
    ]


def check_handshake(connection: ServerConnection, request: Request) -> Response | None:
    """The gateway's door (T53.1): a canonical dial without a ticket does not
    open, and a ticket opens one socket only. A dial offering no subprotocol is
    the legacy `serve` wire and opens as before."""
    offered = _offered_protocols(request.headers)
    if CANONICAL_PROTOCOL not in offered:
        return None
    tickets = [
        p[len(TICKET_PROTOCOL_PREFIX) :] for p in offered if p.startswith(TICKET_PROTOCOL_PREFIX)
    ]
    if len(tickets) != 1 or not tickets[0]:
        print("MOCK_WS_REFUSED no ticket", flush=True)
        return connection.respond(401, "gateway ticket required\n")
    if not spend_ticket(tickets[0]):
        print("MOCK_WS_REFUSED ticket reused", flush=True)
        return connection.respond(401, "gateway ticket already used\n")
    return None


async def send_result(connection: ServerConnection, request_id, result) -> None:
    await connection.send(json.dumps({"jsonrpc": "2.0", "id": request_id, "result": result}))


async def send_error(
    connection: ServerConnection, request_id, code: int, message: str, data=None
) -> None:
    error: dict = {"code": code, "message": message}
    if data is not None:
        error["data"] = data
    await connection.send(json.dumps({"jsonrpc": "2.0", "id": request_id, "error": error}))


async def refuse(
    connection: ServerConnection, request_id, method: str, reason: str, **data
) -> None:
    """A typed refusal as the owner sends it: code 4001, the reason as the
    message and in `data` (`session_controls._refusal_data`)."""
    print(
        f"MOCK_CANONICAL_REFUSED {method} {reason} {json.dumps(data, ensure_ascii=False)}",
        flush=True,
    )
    await send_error(connection, request_id, 4001, reason, {"reason": reason, **data})


async def checked_result(connection: ServerConnection, request_id, method: str, result) -> None:
    """Answer — after checking the answer against the core's result model. A
    mock that drifts from the contract would teach the window a shape the
    gateway never sends; the line makes that drift a failure to read."""
    contract = CONTRACTS["methods"].get(method) or CONTRACTS["legacy"].get(method)
    if contract is not None:
        try:
            contract.result.model_validate(result)
        except Exception as exc:  # pydantic.ValidationError
            first = str(exc).splitlines()[:3]
            print(f"MOCK_CONTRACT_DRIFT result of {method}: {' | '.join(first)}", flush=True)
    await send_result(connection, request_id, result)


def canonical_info(session_id: str) -> dict:
    """`CanonicalSnapshotInfo`: the protocol stamp the donor reports instead of
    the legacy `desktop_contract`, and the session's title."""
    info: dict = {
        "desktop_protocol": CANONICAL_PROTOCOL,
        "model": "mock-model",
        "profile_name": "default",
    }
    title = session_state(session_id)["title"]
    if title:
        info["title"] = title
    return info


def canonical_snapshot(session_id: str, *, omit_messages: bool = False) -> dict:
    """`CanonicalSnapshot` — what `session.create` and `session.resume` answer."""
    global _subscriptions
    _subscriptions += 1
    state = session_state(session_id)
    messages = transcript_messages(session_id)
    snapshot = {
        "session_id": session_id,
        "stored_session_id": session_id,
        "messages": [] if omit_messages else messages,
        "message_count": len(messages),
        "running": session_id in TURNS,
        "authority_epoch": AUTHORITY_EPOCH,
        "replay_epoch": REPLAY_EPOCH,
        "last_sequence": state["seq"],
        "subscription_id": f"sub-{_subscriptions}",
        "revision": state["revision"],
        "execution_generation": state["generation"],
        "pending": [],
        "prompts": [],
        "info": canonical_info(session_id),
    }
    if omit_messages:
        snapshot["messages_omitted"] = True
    return snapshot


def session_info_payload(session_id: str, *, running: bool, pending: list | None = None) -> dict:
    """The owner's `session.info` fanout (captured frames): the fences a viewer's
    next mutation must present, and whether a turn runs."""
    state = session_state(session_id)
    return {
        "stored_session_id": session_id,
        "pending": pending or [],
        "desktop_protocol": CANONICAL_PROTOCOL,
        "running": running,
        "execution_generation": state["generation"],
        "revision": state["revision"],
    }


async def emit(
    connection: ServerConnection,
    event_type: str,
    payload: dict | None = None,
    *,
    session_id: str | None = None,
    pause: float = 0.03,
) -> None:
    """One event to the window, in the wire this connection speaks. Canonical
    frames carry the session stream's epoch and sequence, and a turn's frames
    its admission and generation — the window fences on both."""
    sid = session_id or current_session()
    params: dict = {"type": event_type, "session_id": sid}
    if payload is not None:
        params["payload"] = payload
    if is_canonical(connection):
        state = session_state(sid)
        turn = TURNS.get(sid)
        if turn is not None and event_type == "message.complete" and payload is not None:
            # The owner's completion names its admission and outcome, and
            # carries the text as `content` too (captured frames).
            params["payload"] = {
                "content": payload.get("text", ""),
                "admission_id": turn["admission_id"],
                "outcome": "interrupted" if payload.get("status") == "interrupted" else "completed",
                **payload,
            }
        if turn is not None:
            params = {
                "authority_epoch": AUTHORITY_EPOCH,
                "execution_generation": turn["generation"],
                "admission_id": turn["admission_id"],
                **params,
            }
        state["seq"] += 1
        params["replay_epoch"] = REPLAY_EPOCH
        params["seq"] = state["seq"]
        state["frames"].append(params)
    await connection.send(json.dumps({"jsonrpc": "2.0", "method": "event", "params": params}))
    if pause:
        await asyncio.sleep(pause)


def admission(session_id: str, admission_id: str, sequence: int, status: str, generation) -> dict:
    """`AdmissionStatus` (`gateway/session_contract.py::AdmissionReceipt`)."""
    return {
        "admission_id": admission_id,
        "ref": {"profile_id": "default", "session_id": session_id},
        "sequence": sequence,
        "status": status,
        "outcome": None,
        "authority_epoch": AUTHORITY_EPOCH,
        "execution_generation": generation,
    }


def pending_row(session_id: str, turn: dict, status: str, generation) -> dict:
    return {
        **admission(session_id, turn["admission_id"], turn["sequence"], status, generation),
        "input_id": turn["input_id"],
        "text": turn["text"],
    }


async def canonical_turn(connection: ServerConnection, session_id: str, turn: dict) -> None:
    """One admitted turn, as the owner runs it — off the socket's read loop, so
    the window can interrupt it, answer a prompt or edit metadata meanwhile.
    The session's FIFO keeps a second submit queued behind the first."""
    TURN_SESSION.set(session_id)
    lock = LOCKS.setdefault(session_id, asyncio.Lock())
    try:
        async with lock:
            state = session_state(session_id)
            turn["generation"] = state["generation"] + 1
            state["generation"] = turn["generation"]
            TURNS[session_id] = turn
            TURN_TASKS[session_id] = asyncio.current_task()
            try:
                # Captured order: the turn's first frame, then the owner's
                # `session.info` that shows it running with its admission started.
                await emit(connection, "message.start")
                await emit(
                    connection,
                    "session.info",
                    session_info_payload(
                        session_id,
                        running=True,
                        pending=[pending_row(session_id, turn, "started", turn["generation"])],
                    ),
                )
                print(
                    f"MOCK_TURN_STARTED session_id={session_id!r} generation={turn['generation']}",
                    flush=True,
                )
                await run_turn(connection, turn["text"], started=True)
            except asyncio.CancelledError:
                # `session.interrupt`: the turn ends where it stood.
                print(f"MOCK_TURN_INTERRUPTED session_id={session_id!r}", flush=True)
                await emit(connection, "message.complete", {"text": "", "status": "interrupted"})
                await settle_turn(connection, "")
    except Exception as exc:  # the socket went away mid-turn
        print(f"MOCK_TURN_ABORTED session_id={session_id!r} {type(exc).__name__}", flush=True)
    finally:
        if TURNS.get(session_id) is turn:
            TURNS.pop(session_id, None)
        if TURN_TASKS.get(session_id) is asyncio.current_task():
            TURN_TASKS.pop(session_id, None)


async def handle_canonical(connection: ServerConnection, request: dict, attached: set[str]) -> bool:
    """The session verbs the gateway serves itself. True when answered here;
    False sends the request on to the shared handlers — the legacy fallback
    the gateway keeps for everything else (rollback, models, projects, …)."""
    global ACTIVE_SESSION, _admissions
    request_id = request["id"]
    method = request["method"]
    params = request.get("params") or {}

    if method in NOT_SERVED:
        print(f"MOCK_CANONICAL_NOT_SERVED {method}", flush=True)
        await send_error(
            connection,
            request_id,
            -32601,
            f"unknown method: {method}",
            {"reason": "unknown_method"},
        )
        return True

    contract = CONTRACTS["methods"].get(method)
    if contract is None:
        return False
    # The owner's own home is implicit for the strict verbs (`_PROFILE_IMPLICIT`):
    # the window always names its profile, and only `default` lives here.
    checked = dict(params)
    if checked.get("profile") in ("default", None):
        checked.pop("profile", None)
    elif method in (
        "session.create",
        "session.resume",
        "prompt.submit",
        "session.list",
        "session.mutate",
    ):
        await refuse(connection, request_id, method, "profile_mismatch", field="profile")
        return True
    problems = CONTRACTS["problems"](contract, checked)
    if problems:
        await refuse(connection, request_id, method, "invalid_params", fields=problems)
        return True

    sid = checked.get("session_id")
    if method == "session.create":
        # The window's create in the owner's closed shape — `source: gui` and a
        # `request_id`, which only their canonical adapter sends.
        print(
            f"MOCK_RPC session.create wire=canonical source={checked.get('source')!r} "
            f"request_id={'yes' if checked.get('request_id') else 'no'}",
            flush=True,
        )
        session_id = new_session_id()
        session_state(session_id)
        attached.add(session_id)
        if checked.get("title"):
            session_state(session_id)["title"] = checked["title"]
        await checked_result(connection, request_id, method, canonical_snapshot(session_id))
        return True

    if method == "session.resume":
        if not isinstance(sid, str) or not sid:
            await refuse(connection, request_id, method, "invalid_params", fields=["session_id"])
            return True
        if not known_session(sid):
            await refuse(connection, request_id, method, "not_found")
            return True
        ACTIVE_SESSION = sid
        register_session(sid)
        attached.add(sid)
        snapshot = canonical_snapshot(sid, omit_messages=checked.get("omit_messages") is True)
        await checked_result(connection, request_id, method, snapshot)
        return True

    if method == "session.list":
        rows = [
            {
                "session_id": row["id"],
                "id": row["id"],
                "title": row.get("title") or "",
                "source": row.get("source"),
                "started_at": row.get("started_at"),
                "message_count": row.get("message_count", 0),
                "running": row["id"] in TURNS,
            }
            for row in visible_sessions()
            # `live`: what the owner holds now — sessions created or attached
            # this run; `stored`: every row of the database.
            if checked.get("scope", "live") == "stored" or row["id"] in STATE
        ]
        await checked_result(
            connection,
            request_id,
            method,
            {"sessions": rows, "scope": checked.get("scope", "live")},
        )
        return True

    if method == "prompt.submit":
        # `session_controls.submission`: a stranger to the session is refused,
        # and so is input without an identity — the owner admits identified
        # input only (a retry must be recognisable as the same send).
        if sid not in attached:
            await refuse(connection, request_id, method, "permission_denied")
            return True
        input_id = checked.get("submission_id") or checked.get("input_id")
        if not isinstance(input_id, str) or not input_id:
            await refuse(connection, request_id, method, "invalid_params", fields=["submission_id"])
            return True
        _admissions += 1
        text = checked.get("text") or ""
        turn = {
            "admission_id": uuid.uuid4().hex,
            "sequence": _admissions,
            "input_id": input_id,
            "text": text,
        }
        ACTIVE_SESSION = sid
        await checked_result(
            connection,
            request_id,
            method,
            admission(sid, turn["admission_id"], turn["sequence"], "queued", None),
        )
        print(f"MOCK_RPC prompt.submit session_id={sid!r} text={text[:40]!r}", flush=True)
        print(f"MOCK_ADMISSION queued session_id={sid!r}", flush=True)
        # Captured order: the owner shows the admission queued before it runs.
        await emit(
            connection,
            "session.info",
            session_info_payload(
                sid, running=sid in TURNS, pending=[pending_row(sid, turn, "queued", None)]
            ),
            session_id=sid,
        )
        asyncio.create_task(canonical_turn(connection, sid, turn))
        return True

    if method == "session.mutate":
        state = session_state(sid) if isinstance(sid, str) else None
        if state is None or sid not in attached:
            await refuse(connection, request_id, method, "permission_denied")
            return True
        if checked["expected_revision"] != state["revision"]:
            await refuse(
                connection,
                request_id,
                method,
                "revision_conflict",
                revision=state["revision"],
                execution_generation=state["generation"],
            )
            return True
        expected_generation = checked.get("expected_generation")
        if expected_generation is not None and expected_generation != state["generation"]:
            await refuse(
                connection,
                request_id,
                method,
                "stale_generation",
                revision=state["revision"],
                execution_generation=state["generation"],
            )
            return True
        operation = checked["operation"]
        if operation == "workspace" and sid in TURNS:
            # Moving a running session is refused mid-turn (contract doc).
            await refuse(connection, request_id, method, "session_busy")
            return True
        payload = checked.get("payload") or {}
        projection: dict = {}
        if operation == "rename":
            state["title"] = str(payload.get("title") or "")
            projection = {"title": state["title"]}
        elif operation == "archive":
            state["archived"] = bool(payload.get("archived"))
            projection = {"archived": state["archived"]}
        elif operation in ("model", "reasoning", "workspace"):
            projection = dict(payload)
        else:
            print(f"MOCK_CANONICAL_UNSUPPORTED session.mutate {operation}", flush=True)
            await refuse(connection, request_id, method, "unsupported_control", field="operation")
            return True
        state["revision"] += 1
        receipt = {
            "session_id": sid,
            "operation": operation,
            "revision": state["revision"],
            **projection,
        }
        print(f"MOCK_RPC session.mutate session_id={sid!r} operation={operation!r}", flush=True)
        await checked_result(connection, request_id, method, receipt)
        await emit(connection, "session.updated", dict(receipt), session_id=sid, pause=0)
        return True

    if method == "session.interrupt":
        state = session_state(sid)
        turn = TURNS.get(sid)
        if turn is not None and checked["execution_generation"] != turn["generation"]:
            print(
                f"MOCK_INTERRUPT_FENCE sent={checked['execution_generation']} "
                f"current={turn['generation']}",
                flush=True,
            )
            await refuse(
                connection,
                request_id,
                method,
                "stale_generation",
                execution_generation=turn["generation"],
            )
            return True
        handle = {
            "ref": {"profile_id": "default", "session_id": sid},
            "instance_id": INSTANCE_ID,
            "authority_epoch": AUTHORITY_EPOCH,
            "revision": state["revision"],
            "execution_generation": state["generation"],
            "execution_state": "running" if turn else "idle",
        }
        print(
            f"MOCK_RPC session.interrupt session_id={sid!r} "
            f"generation={checked['execution_generation']} running={turn is not None}",
            flush=True,
        )
        await checked_result(connection, request_id, method, handle)
        task = TURN_TASKS.get(sid)
        if task is not None:
            task.cancel()
        return True

    if method == "session.events.since":
        # Replay of the session's stream after the window's cursor — what a
        # reconnecting window asks before it trusts its transcript.
        state = session_state(sid)
        epoch = checked.get("replay_epoch")
        after = checked.get("last_sequence") or checked.get("last_seen") or 0
        same_epoch = epoch in (None, REPLAY_EPOCH)
        events = [frame for frame in state["frames"] if frame["seq"] > after] if same_epoch else []
        replay = {
            "events": events,
            "latest_seq": state["seq"],
            "last_sequence": state["seq"],
            "epoch": REPLAY_EPOCH,
            "replay_epoch": REPLAY_EPOCH,
            "truncated": False,
            "snapshot_required": not same_epoch,
            "count": len(events),
        }
        print(
            f"MOCK_RPC session.events.since session_id={sid!r} after={after} count={len(events)}",
            flush=True,
        )
        await checked_result(connection, request_id, method, replay)
        return True

    if method in ("approval.respond", "clarify.respond"):
        generation = session_state(sid)["generation"] if isinstance(sid, str) else None
        if checked.get("execution_generation") != generation:
            await refuse(
                connection,
                request_id,
                method,
                "stale_generation",
                execution_generation=generation,
            )
            return True
        print(f"MOCK_RPC {method} " + json.dumps(checked, ensure_ascii=False), flush=True)
        await checked_result(
            connection,
            request_id,
            method,
            {"status": "resolved", "prompt_id": checked["prompt_id"]},
        )
        return True

    # A canonical verb this mock does not serve: its params passed the core's
    # check; the shared handlers answer it or name it.
    return False


# A canonical turn emits its own `message.start` before the started
# `session.info` (captured order); the scripted streams then skip theirs.
TURN_STARTED: contextvars.ContextVar[bool] = contextvars.ContextVar("turn_started", default=False)


async def run_turn(connection: ServerConnection, text: str, *, started: bool = False) -> None:
    """The scripted answers, by the prompt's first word — one table for both
    wires. `started`: the canonical turn already sent its `message.start`."""
    remember_message(current_session(), "user", text)
    TURN_STARTED.set(started)
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


async def handle(connection: ServerConnection) -> None:
    global ACTIVE_SESSION
    canonical = is_canonical(connection)
    wire = "canonical" if canonical else "legacy"
    note_wire(wire)
    print(f"MOCK_WIRE {wire}", flush=True)
    # Sessions attached over THIS socket: the gateway refuses a submit into a
    # session the connection never created or resumed.
    attached: set[str] = set()
    ready: dict = {"type": "gateway.ready"}
    if canonical:
        # `tui_gateway/ws.py`: the authority-bound socket's first frame.
        ready["payload"] = {
            "skin": {},
            "change_events": True,
            "heartbeat": True,
            "replay_epoch": REPLAY_EPOCH,
            "session_authority": True,
        }
    await connection.send(json.dumps({"jsonrpc": "2.0", "method": "event", "params": ready}))

    asyncio.create_task(stream_drive_turn(connection))
    asyncio.create_task(push_preview_open(connection))

    async for raw in connection:
        request_id = None
        try:
            request = json.loads(raw)
            if "method" not in request:
                await take_answer(connection, request)
                continue
            request_id = request["id"]
            method = request["method"]
            if canonical and await handle_canonical(connection, request, attached):
                continue
            # Every RPC by name, so a failed test's stdout shows what the window
            # actually asked (the polling `session.active_list` excluded). With the
            # session it names and the command/text it carries: several sessions
            # live in this mock at once (task 3F.5), and a turn that lands nowhere
            # is unreadable without the id.
            # Core v0.23.0 legacy contract (task T52): params are extra="forbid"
            # (`tui_gateway/contracts/base.py`), and `PromptSubmitParams` has no
            # `submission_id`, so the donor's id is refused with 4000. The donor
            # retries identityless on exactly this refusal (`submit.ts`
            # `isPreAdmissionRefusal`) and only then accepts {"status": "streaming"}.
            # Answering the first try directly made it drop the user bubble and put
            # the text back into the composer.
            if method == "prompt.submit" and "submission_id" in (request.get("params") or {}):
                print("MOCK_RPC_REFUSED prompt.submit submission_id", flush=True)
                await connection.send(
                    json.dumps(
                        {
                            "jsonrpc": "2.0",
                            "id": request_id,
                            "error": {
                                "code": 4000,
                                "message": "invalid params for prompt.submit: submission_id: "
                                "Extra inputs are not permitted",
                            },
                        }
                    )
                )
                continue

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
                    json.dumps(
                        {"jsonrpc": "2.0", "id": request_id, "result": {"status": "streaming"}}
                    )
                )
                text = (request.get("params") or {}).get("text") or ""
                target = (request.get("params") or {}).get("session_id")
                if isinstance(target, str) and target:
                    ACTIVE_SESSION = target
                await run_turn(connection, text)
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
                # the contract has it (docs/history/specs/checkpoints-rollback.md).
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
                    Path(edit["abs_path"]).write_text(
                        edit["before"], encoding="utf-8", newline="\n"
                    )
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
            elif method in ("projects.tree", "projects.project_sessions"):
                # Their project grouping (0.21.5 sidebar): the stand has no core
                # projects, and says so the way the core does — an empty tree and
                # no project — instead of -32601, which their drill-in reads as
                # "the session list failed to load".
                result = {"projects": []} if method == "projects.tree" else {"project": None}
                reply = {"jsonrpc": "2.0", "id": request_id, "result": result}
                await connection.send(json.dumps(reply))
            elif method == "connection.respond":
                # The consent card's answer (SPEC UR23), printed so the test can
                # prove the refusal travelled; then the turn the core held open ends.
                answer = request.get("params") or {}
                print("CONNECTION_RESPOND " + json.dumps(answer, ensure_ascii=False), flush=True)
                await connection.send(
                    json.dumps(
                        {
                            "jsonrpc": "2.0",
                            "id": request_id,
                            "result": {"status": "ok", "settled": True},
                        }
                    )
                )
                consent = CONSENTS.get(str(answer.get("op_id")))
                if consent is not None:
                    consent.set()
                else:
                    await emit(
                        connection, "message.complete", {"text": "", "status": "complete"}, pause=0
                    )
                    await settle_turn(connection, "")
            elif method == "gateway.ping":
                # The heartbeat, answered by the socket itself (`tui_gateway/ws.py`).
                await checked_result(connection, request_id, method, {"ok": True})
            elif method == "approval.pending":
                await checked_result(connection, request_id, method, {"approvals": []})
            elif method == "session.active_list":
                await checked_result(connection, request_id, method, {"sessions": []})
            elif method in NOT_MODELLED:
                # A method the core serves (on both wires) that this mock knowingly
                # leaves unanswered — the window takes its -32601 fallback here,
                # which it never takes against the core. Listed, so a NEW method the
                # window starts calling shows up as MOCK_UNKNOWN_METHOD instead.
                print("MOCK_NOT_MODELLED " + method, flush=True)
                await send_error(connection, request_id, -32601, f"method not found: {method}")
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
        except ConnectionClosed:
            raise
        except Exception as exc:  # a mock bug: answer this request, keep the socket
            print(f"MOCK_HANDLER_CRASH {type(exc).__name__}: {exc}", flush=True)
            if request_id is not None:
                await send_error(connection, request_id, -32603, f"mock crashed: {exc}")


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
    sid = current_session()
    if answer:
        remember_message(sid, "assistant", answer)
    if is_canonical(connection):
        # The captured frames: the turn's last frame is the owner's idle
        # `session.info` — the admission gone from `pending`, the revision one
        # up (a turn advances it without a `session.updated`).
        state = session_state(sid)
        state["revision"] += 1
        await emit(
            connection, "session.info", session_info_payload(sid, running=False), session_id=sid
        )
        TURNS.pop(sid, None)
        return
    await emit(connection, "session.info", {"running": False, **SESSION_INFO})


async def stream_pong(connection: ServerConnection) -> None:
    async def push(event_type: str, payload: dict | None = None) -> None:
        if event_type == "message.start" and TURN_STARTED.get():
            return
        await emit(connection, event_type, payload)

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
        if event_type == "message.start" and TURN_STARTED.get():
            return
        await emit(connection, event_type, payload)

    await push("message.start")
    await push("message.delta", {"text": answer})
    await push("message.complete", {"text": answer, "status": "complete"})
    await settle_turn(connection, answer)


async def stream_mcp_setup(connection: ServerConnection) -> None:
    """The agent's MCP install asking for a person (task 3.8, SPEC UR23).

    Since core 0.21.5 (task 3.B6) this is no longer an `mcp.setup` server
    request: the core opens a connection OPERATION — event `connection.request`
    with one row per target — and the card answers it with the RPC
    `connection.respond`. The turn deliberately stays open here: the app
    installs nothing while it waits for a person.
    """

    async def push(event_type: str, payload: dict | None = None) -> None:
        if event_type == "message.start" and TURN_STARTED.get():
            return
        await emit(connection, event_type, payload)

    await push("message.start")
    await push(
        "connection.request",
        {
            "op_id": "op-e2e-mcp",
            "seq": 1,
            "deadline_at": time.time() + 300,
            "timeout_seconds": 300,
            "targets": [
                {
                    "name": "filesystem",
                    "kind": "mcp",
                    "action": "install",
                    "state": "pending",
                    "detail": "нужен доступ к файлам сметы",
                }
            ],
        },
    )
    if is_canonical(connection):
        # The owner's turn stays open until the person answers the card; the
        # answer (`connection.respond`) releases it here, inside the turn.
        answered = CONSENTS.setdefault("op-e2e-mcp", asyncio.Event())
        await answered.wait()
        CONSENTS.pop("op-e2e-mcp", None)
        await emit(connection, "message.complete", {"text": "", "status": "complete"}, pause=0)
        await settle_turn(connection, "")


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
        if event_type == "message.start" and TURN_STARTED.get():
            return
        await emit(connection, event_type, payload)

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
        if event_type == "message.start" and TURN_STARTED.get():
            return
        await emit(connection, event_type, payload)

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
        if event_type == "message.start" and TURN_STARTED.get():
            return
        await emit(connection, event_type, payload)

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
            await emit(connection, "preview.open", {"url": url}, pause=0)
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
    # A client offering `hermes-gateway-v1` is answered with it (the canonical
    # wire); a client offering none opens without one (legacy). Not the
    # `subprotocols=` list: with it, websockets refuses a client offering none.
    async with serve(
        handle,
        "127.0.0.1",
        port,
        select_subprotocol=lambda _connection, offered: (
            CANONICAL_PROTOCOL if CANONICAL_PROTOCOL in offered else None
        ),
        process_request=check_handshake,
    ):
        print(f"MOCK_REST_READY {rest_port}", flush=True)
        print(f"MOCK_READY {port}", flush=True)
        await asyncio.Future()  # run forever, until the process is killed


if __name__ == "__main__":
    asyncio.run(main())
