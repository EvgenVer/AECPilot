"""REST half of the e2e mock (task 3.16).

WHY THIS EXISTS. The sidebar's whole session list — dividers by date, sort,
archive, unread, density — travels over REST, not the socket:
`api/sessions.ts` builds `/api/profiles/sessions/sidebar` and friends and hands
them to `hermesApi`, which goes renderer → main → HTTP. The socket-only mock
therefore left every one of those surfaces with an empty list, and no test
could tell "the feature works" from "the list never arrived".

So this serves just enough of the core's HTTP surface for the sidebar to have
something to group, sort, archive and mark read. It is NOT a core: rows live in
memory, filters are the three the sidebar actually sends, and anything else
answers 404 the way a real backend does for an unknown route.

Rows carry SECONDS, not milliseconds — `lib/session-date-groups.ts` multiplies
by 1000 itself.

Usage: imported by mock_gateway.py, which starts it on its own port and prints
`MOCK_REST_READY <port>`.
"""

import json
import queue
import re
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

DAY = 86400

# A page with something to click and something to type into — the target for
# `drive_preview` and `tour` in the e2e (task 3E.12, UR36). Deliberately plain:
# one input, one button, and an echo the button writes. That echo is the proof
# a test can read from the OUTSIDE — it appears only if a real key event
# reached the field and a real click reached the button.
# Ставится, когда гость запросил страницу ниже (задача 3E.12).
FORM_PAGE_SERVED = threading.Event()

# Задача 3E.25. Просьбы теста открыть предпросмотр местного файла. Ручкой, а не
# подсказкой в промпте, по двум причинам: их инструмент `open_preview` шлёт
# СОБЫТИЕ, а не текст ответа, и тест тогда не занимает очередь композера тесту
# после себя (замерено: ход, отправленный сразу после открытия панели, до мока
# не дошёл).
PREVIEW_OPEN_REQUESTS: "queue.Queue[str]" = queue.Queue()

FORM_PAGE = """<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Zayavka</title></head>
<body>
<h1>Zayavka na zamer</h1>
<label for="obj">Obyekt</label>
<input id="obj" name="obj" placeholder="nomer obyekta">
<button id="go" type="button">Otpravit</button>
<p id="echo"></p>
<script>
document.getElementById('go').addEventListener('click', function () {
  document.getElementById('echo').textContent =
    'PRINYATO: ' + document.getElementById('obj').value;
});
</script>
</body></html>
"""

_RUNTIME = Path(__file__).resolve().parents[3] / "runtime"


def _pinned_config_defaults() -> dict:
    """The core's own `DEFAULT_CONFIG`, replayed from our contract snapshot.

    `/api/config` and `/api/config/defaults` return the whole merged config, and
    the app's boot does not finish without them. Hand-writing 800 keys would be
    inventing a contract; the snapshot (`runtime/contract-snapshot.mjs`) already
    MEASURED them off the pinned core, so this replays a fact instead.

    The snapshot stores dotted keys; the routes return them nested.
    """
    version = re.search(
        r'HERMES_VERSION\s*=\s*"([^"]+)"',
        (_RUNTIME / "hermes-env.mjs").read_text(encoding="utf-8"),
    )
    if not version:
        return {}

    snapshot = _RUNTIME / "contracts" / f"hermes-{version.group(1)}.json"
    if not snapshot.exists():
        return {}

    flat = json.loads(snapshot.read_text(encoding="utf-8")).get("configDefaults", {})
    nested: dict = {}

    for dotted, value in flat.items():
        parts = dotted.split(".")
        node = nested
        for part in parts[:-1]:
            existing = node.get(part)
            if not isinstance(existing, dict):
                existing = {}
                node[part] = existing
            node = existing
        node[parts[-1]] = value

    return nested


_CONFIG = _pinned_config_defaults()

# Must match mock_gateway.SESSION_ID: the row for the session the socket half
# actually serves has to be in this list, or their sidebar drops the open
# conversation.
LIVE_SESSION_ID = "e2e-1"


def _session(
    session_id: str,
    title: str,
    age_seconds: float,
    *,
    created_age_seconds: float | None = None,
    archived: bool = False,
    unread: bool = False,
    messages: int = 2,
) -> dict:
    """One row in the shape `SessionInfo` declares (types/hermes.ts).

    `created_age_seconds` is deliberately separate from `age_seconds`: their
    sidebar offers both "Updated" and "Created" orderings, and rows whose two
    stamps are equal rank IDENTICALLY under both — a sort test over such a
    fixture passes without the sort doing anything.
    """
    stamp = time.time() - age_seconds
    created = time.time() - (age_seconds if created_age_seconds is None else created_age_seconds)
    return {
        "archived": archived,
        "cwd": None,
        "ended_at": None,
        "id": session_id,
        "input_tokens": 10,
        "is_active": False,
        "last_active": stamp,
        "message_count": messages,
        "model": "mock-model",
        "output_tokens": 20,
        "pinned": False,
        "preview": f"{title} — предпросмотр",
        "profile": "default",
        "is_default_profile": True,
        "source": "desktop",
        "started_at": created,
        "title": title,
        "tool_call_count": 0,
        "unread": unread,
    }


def _initial_sessions() -> list[dict]:
    """Four rows chosen so each list feature has something to act on.

    Ages are deliberately mid-bucket (2h, 30h, 4d) rather than on a boundary:
    a row placed exactly at "yesterday" flips buckets depending on what time of
    day the suite runs, and a test that fails at midnight is worse than no test.
    """
    return [
        _session(LIVE_SESSION_ID, "e2e", 2 * 3600),
        _session("e2e-yesterday", "Вчерашний разговор", 30 * 3600, unread=True),
        _session("e2e-week", "Разговор на неделе", 4 * DAY),
        _session("e2e-archived", "Убранный в архив", 6 * DAY, archived=True),
    ]


_LOCK = threading.Lock()
_SESSIONS: list[dict] = _initial_sessions()

# The vault the app has open. Their sidebar is PROJECT-SCOPED: with a project
# open it shows only rows whose `cwd` belongs to it and prints "No sessions yet"
# for everything else — which is what the first run of this mock produced, rows
# served and none displayed. The test stamps the path here right after it
# creates the project, over plain HTTP; the app is not involved and never calls
# this route.
_CWD: str | None = None

SESSION_PATH = re.compile(r"^/api/sessions/([^/]+)$")
MESSAGES_PATH = re.compile(r"^/api/sessions/([^/]+)/messages$")


def _visible(archived_filter: str) -> list[dict]:
    """The `archived` query the sidebar sends: exclude | include | only."""
    with _LOCK:
        rows = [dict(row, cwd=_CWD) for row in _SESSIONS]

    if archived_filter == "only":
        rows = [row for row in rows if row["archived"]]
    elif archived_filter != "include":
        rows = [row for row in rows if not row["archived"]]

    # Recency order — the sidebar's default. Its own sort menu re-orders what it
    # is given, so serving anything else here would test the mock, not the menu.
    rows.sort(key=lambda row: row["last_active"], reverse=True)
    return rows


def _page(rows: list[dict], limit: int) -> dict:
    return {"limit": limit, "offset": 0, "sessions": rows[:limit], "total": len(rows)}


class Handler(BaseHTTPRequestHandler):
    # HTTP/1.1, not the stdlib default of 1.0. Under 1.0 every response closes
    # the connection, and main's `fetch` — which keeps sockets alive — reuses a
    # socket the server has already hung up on: the call rejects with a bare
    # "fetch failed", the sidebar's loader swallows it, and the list stays empty
    # while every request looks answered from the outside. Costs one rule:
    # every response must carry Content-Length, which `_send` does.
    protocol_version = "HTTP/1.1"

    # Silence the per-request stderr line: the suite reads this process's output
    # to find MOCK_ lines, and a request log per sidebar refresh buries them.
    def log_message(self, fmt: str, *args) -> None:  # noqa: A002 - stdlib signature
        return

    def _send(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_html(self, body: str) -> None:
        raw = body.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _body(self) -> dict:
        """Read the request body — ALWAYS, even when the answer is a refusal.

        Under keep-alive an unread body stays in the socket and becomes the
        first bytes of the NEXT request on it. The server then sees garbage and
        resets, and main reports a bare "fetch failed" on a call that had
        nothing to do with the one that left the bytes. That is what kept the
        sidebar empty while every request looked answered.
        """
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""
        try:
            parsed = json.loads(raw or b"{}")
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}

    def _query(self) -> dict[str, list[str]]:
        return parse_qs(urlparse(self.path).query)

    def _limit(self) -> int:
        raw = self._query().get("limit", ["40"])[0]
        try:
            return max(1, int(raw))
        except ValueError:
            return 40

    def _archived(self) -> str:
        return self._query().get("archived", ["exclude"])[0]

    def do_GET(self) -> None:  # noqa: N802 - stdlib signature
        route = urlparse(self.path).path
        # Printed so a test can tell "the app never asked" from "the app asked
        # and we answered nothing" — the two look identical in the sidebar, and
        # the first run of this fixture was exactly that confusion.
        print(f"MOCK_REST_GET {self.path}", flush=True)

        # Their readiness probe. The SHAPE matters: `StatusResponse`
        # (types/hermes.ts) is what the connection chip and the boot sequence
        # read, and an invented `{status: "ok"}` leaves the app sitting on
        # "Gateway checking" forever — which is what the first run of this
        # fixture did, with the sidebar refusing to publish the rows it had
        # already fetched.
        if route == "/page/form":
            # Флаг для сокетной половины: страница, которую агент будет
            # использовать, ТОЛЬКО ЧТО загрузилась в панели. Ход человека здесь
            # не годится — после открытия панели вторая отправка из композера
            # до мока не доезжает (замер 2026-09-12), а этот сигнал приходит от
            # самого гостя и врать не умеет.
            FORM_PAGE_SERVED.set()
            self._send_html(FORM_PAGE)
            return

        if route == "/api/status":
            self._send(
                200,
                {
                    "active_sessions": 1,
                    "config_path": "/mock/config.yaml",
                    "config_version": 39,
                    "env_path": "/mock/.env",
                    "gateway_exit_reason": None,
                    "gateway_health_url": None,
                    "gateway_pid": 1,
                    "gateway_platforms": {},
                    "gateway_running": True,
                    "gateway_state": "running",
                    "gateway_updated_at": None,
                    "hermes_home": "/mock/home",
                    "latest_config_version": 39,
                    "release_date": "2026-08-27",
                    "version": "0.20.6",
                },
            )
            return

        # The profile a session row belongs to. The sidebar refuses to publish a
        # page whose profile no longer matches the active scope, so an unknown
        # active profile drops rows that did arrive.
        if route == "/api/profiles/active":
            self._send(200, {"active": "default", "current": "default"})
            return

        if route == "/api/profiles":
            self._send(
                200,
                {
                    "profiles": [
                        {
                            "name": "default",
                            "path": "/mock/home",
                            "is_default": True,
                            "model": "mock-model",
                            "provider": "mock",
                            "has_env": False,
                            "skill_count": 0,
                            "gateway_running": True,
                            "description": "",
                            "description_auto": False,
                            "display_name": "",
                            "distribution_name": None,
                            "distribution_version": None,
                            "distribution_source": None,
                            "has_alias": False,
                        }
                    ]
                },
            )
            return

        if route == "/api/cron/jobs":
            self._send(200, {"jobs": []})
            return

        # Модельные маршруты. Отвечать на них надо не ради самих экранов
        # моделей: пока они отдавали 404, приложение раз за разом показывало
        # уведомление об ошибке, а всплывающие уведомления НАКРЫВАЮТ боковую
        # панель — щелчки по строкам списка перехватывались, и проверки списка
        # краснели через раз по причине, не имеющей к ним отношения.
        if route == "/api/model/info":
            self._send(
                200,
                {
                    "model": "mock-model",
                    "provider": "mock",
                    "effective_context_length": 200000,
                    "auto_context_length": 200000,
                    "capabilities": {},
                },
            )
            return

        if route == "/api/model/options":
            self._send(200, {"model": "mock-model", "provider": "mock", "providers": []})
            return

        # Экран «Навыки» держит НАВЫКИ И НАБОРЫ на одном запросе-предохранителе:
        # ветка «не загрузилось» стоит ВЫШЕ ветки вкладок (`app/skills/index.tsx`),
        # поэтому молчащий `/api/skills` гасит и вкладку наборов — замерено на
        # снимке падения, где вкладка переключалась, а панель отвечала «Skills
        # failed to load». Отвечаем как настоящее ядро: встроенные навыки есть.
        if route == "/api/skills":
            self._send(
                200,
                [
                    {
                        "category": "general",
                        "description": "Mock bundled skill",
                        "enabled": True,
                        "name": "mock-skill",
                        "provenance": "bundled",
                    }
                ],
            )
            return

        # Задача 3E.18. Панель наборов — ЕДИНСТВЕННАЯ дверь человека к выбору
        # провайдера чтения страниц: назначать его за него мы не стали (решение
        # владельца 2026-09-08 — повторить механизм донора целиком). Ответ
        # нарочно показывает НЕЗАВЕРШЁННОЕ состояние: поиск на `ddgs`,
        # извлечение не назначено, — то самое, что видит человек в жизни, пока
        # не выберет провайдера сам.
        if route == "/api/tools/toolsets":
            self._send(
                200,
                [
                    {
                        "configured": True,
                        "description": "Web search and page extraction",
                        "enabled": True,
                        "label": "Web",
                        "name": "web",
                        "tools": ["web_search", "web_extract"],
                    }
                ],
            )
            return

        if route == "/api/tools/toolsets/web/config":
            self._send(
                200,
                {
                    "active_extract_backend": None,
                    "active_provider": "DuckDuckGo",
                    "active_search_backend": "ddgs",
                    "has_category": True,
                    "providers": [
                        {
                            "badge": "free",
                            "capabilities": ["search"],
                            "env_vars": [],
                            "is_active": True,
                            "name": "DuckDuckGo",
                            "post_setup": None,
                            "requires_nous_auth": False,
                            "status": "ready",
                            "tag": "ddgs",
                            "web_backend": "ddgs",
                        },
                        {
                            "badge": "key",
                            "capabilities": ["search", "extract"],
                            "env_vars": [],
                            "is_active": False,
                            "name": "Firecrawl",
                            "post_setup": None,
                            "requires_nous_auth": False,
                            "status": "needs_keys",
                            "tag": "firecrawl",
                            "web_backend": "firecrawl",
                        },
                    ],
                },
            )
            return

        if route == "/api/config/defaults":
            self._send(200, _CONFIG)
            return

        if route == "/api/config":
            # Their route strips the internal `_`-prefixed keys before answering.
            self._send(200, {k: v for k, v in _CONFIG.items() if not k.startswith("_")})
            return

        if route == "/api/profiles/sessions/sidebar":
            rows = _visible("exclude")
            self._send(
                200,
                {
                    "recents": {"sessions": rows, "profiles_truncated": {"default": False}},
                    "cron": {"sessions": []},
                    "messaging": {"sessions": []},
                },
            )
            return

        if route in ("/api/sessions", "/api/profiles/sessions"):
            self._send(200, _page(_visible(self._archived()), self._limit()))
            return

        if MESSAGES_PATH.match(route):
            self._send(200, {"messages": []})
            return

        # ОДНА СЕССИЯ ПО ИДЕНТИФИКАТОРУ — НАСТОЯЩАЯ ПРИЧИНА ЗАМЕЧАНИЯ D-82.
        # Маршрута здесь не было, а у ядра он есть (`web_routers/sessions.py`,
        # `@manage_router.get("/api/sessions/{session_id}")`). Окно спрашивает
        # сессию всякий раз, когда теряет живую ссылку на неё — в том числе когда
        # рядом поднимается второе окно на ту же сессию (лента HUD). На 404 их
        # ограниченный автоповтор (`use-route-resume.ts`) сдаётся, панель
        # показывает «Couldn't load this session», и дальше падает НЕ тот тест,
        # который это вызвал, а следующий, которому нужен композер. Ответ — сама
        # запись, как у ядра: оно отдаёт объект сессии, а не обёртку.
        match = SESSION_PATH.match(route)

        if match:
            wanted = match.group(1)
            with _LOCK:
                row = next((dict(item) for item in _SESSIONS if item["id"] == wanted), None)

            if row is None:
                self._send(404, {"detail": "Session not found"})
                return
            row["cwd"] = _CWD
            row["profile"] = "default"
            row["is_default_profile"] = True
            self._send(200, row)
            return

        self._send(404, {"detail": f"No such API endpoint: {route}"})

    def do_PUT(self) -> None:  # noqa: N802 - stdlib signature
        """Test control, not part of the core's surface.

        `/api/_mock/cwd` tells the fixture which vault the app has open, so the
        rows land inside the project the sidebar is scoped to. Named with the
        `_mock` segment so it can never be mistaken for a route we are pretending
        the core has.
        """
        global _CWD

        body = self._body()

        if urlparse(self.path).path != "/api/_mock/cwd":
            self._send(404, {"detail": "No such API endpoint"})
            return
        with _LOCK:
            _CWD = body.get("cwd")
        self._send(200, {"ok": True, "cwd": _CWD})

    def do_PATCH(self) -> None:  # noqa: N802 - stdlib signature
        """Session mutations: archive, pin, unread.

        The verb matters. Until 2026-08-31 our own bridge rejected PATCH before
        it ever left the renderer, so every one of these silently did nothing —
        which is the defect task 3.16 was written to catch. Serving it here is
        what lets a test prove the fix rather than assert it.
        """
        route = urlparse(self.path).path
        body = self._body()
        match = SESSION_PATH.match(route)

        if not match:
            self._send(404, {"detail": f"No such API endpoint: {route}"})
            return
        session_id = match.group(1)
        print(f"MOCK_REST_PATCH {session_id} {json.dumps(body)}", flush=True)

        with _LOCK:
            for row in _SESSIONS:
                if row["id"] == session_id:
                    for field in ("archived", "pinned", "unread"):
                        if field in body:
                            row[field] = bool(body[field])
                    self._send(200, {"ok": True})
                    return

        self._send(404, {"detail": f"session not found: {session_id}"})

    def do_POST(self) -> None:  # noqa: N802 - stdlib signature
        """Anything the app POSTs. Nothing here needs to succeed for the list
        surfaces, but every one of them must be READ and answered — see
        `_body`."""
        route = urlparse(self.path).path
        body = self._body()
        print(f"MOCK_REST_POST {route}", flush=True)

        # Тестовая ручка (задача 3E.25), а не поверхность ядра: просит сокетную
        # половину послать `preview.open`. Сегмент `_mock` в пути — чтобы её
        # нельзя было принять за маршрут, который мы за ядро изображаем.
        if route == "/api/_mock/preview-open":
            PREVIEW_OPEN_REQUESTS.put(body.get("url") or "")
            self._send(200, {"ok": True})
            return

        if route == "/api/profiles/active":
            self._send(200, {"ok": True, "active": "default"})
            return

        self._send(404, {"detail": f"No such API endpoint: {route}"})

    def do_DELETE(self) -> None:  # noqa: N802 - stdlib signature
        self._body()
        self._send(404, {"detail": "No such API endpoint"})


def serve_in_thread(port: int = 0) -> int:
    """Start the REST half on its own port and return the port it got."""
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server.server_address[1]
