// The window on the single core gateway, measured before the move (task T53.1, decision 0017).
//
// Today the window talks to `hermes serve` on a fixed port with a token. Their Desktop 0.23
// asks the system for the gateway instead (`hermes gateway ensure --json`), mints a one-use
// ticket per request over the owner-only control channel (a named pipe on Windows, through
// their Python client: `apps/desktop/electron/local-gateway-python.ts`) and dials the
// gateway's own loopback listener with it. Hermes warns that this path does not yet serve
// every method a Desktop calls (`apps/desktop/docs/canonical-gateway-protocol.md`, «Cutover
// limits»). This probe measures what the gateway serves for OUR window:
//
//   1. `gateway ensure --json`: the endpoint, how long a cold start takes to READY, how long
//      a second ensure of a running gateway takes;
//   2. tickets through their Python client: interactive (socket) and native-http (REST);
//      whether a ticket is single-use;
//   3. every JSON-RPC method our main process and the donor name, classified by the core's
//      own dispatch tables (`single-gateway-classify.py`) and checked live on the socket —
//      except the methods with an outside effect (a model call, the microphone, a network
//      sign-up), which are only classified;
//   4. REST routes with a native-http ticket header, and without one;
//   5. a chat without a model: session.create → session.list → session.close;
//   6. `gateway stop`: how long it takes, and that no `gateway run` of this profile is left.
//
// No model call — free. Run it on a temporary copy of runtime/e2e-profile only:
//   AEC_HERMES_HOME=<copy> node runtime/single-gateway-probe.mjs [--json <report.json>]
// Exit codes: 0 = measured (read the printed lines); 3 = could not measure.

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  HERMES_BIN,
  HERMES_SRC_DIR,
  PYTHON_ARGS,
  PYTHON_BIN,
  RUNTIME_DIR,
  gatewayLockDir,
  withOurHermesOnPath,
} from "./hermes-env.mjs";

const REPO_DIR_FOR_PROBES = path.resolve(RUNTIME_DIR, "..");

const HOME = process.env.AEC_HERMES_HOME ? path.resolve(process.env.AEC_HERMES_HOME) : "";
const tmpRoot = path.resolve(os.tmpdir());
if (!HOME || !HOME.toLowerCase().startsWith(tmpRoot.toLowerCase() + path.sep)) {
  console.error(`refusing: AEC_HERMES_HOME must be a temporary copy of runtime/e2e-profile under ${tmpRoot}`);
  process.exit(3);
}
const JSON_OUT = (() => {
  const at = process.argv.indexOf("--json");
  return at === -1 ? null : path.resolve(process.argv[at + 1]);
})();

// Methods that reach outside the machine or into a device, or start an agent turn, even with
// empty params: they are classified from the tables, never called.
const NOT_CALLED = new Set([
  "image.generate", "llm.oneshot", "prompt.submit", "prompt.background", "prompt.btw",
  "wake.start", "wake.resume", "wake.feed", "free_tier.provision", "free_tier.claim_nudge",
  "onboarding.start", "cli.exec", "handoff.request", "plugins.manage", "skills.manage",
  "browser.manage", "preview.restart", "process.kill", "process.stop", "clipboard.paste",
  "shared_metrics.set", "shared_metrics.update_run", "shared_metrics.slash_command",
  "shared_metrics.startup_latency", "slash.exec", "command.dispatch", "session.steer",
]);

// Read-only REST routes the window uses (main and donor). Writes are measured once below.
const REST_GETS = [
  "/api/status", "/api/sessions", "/api/skills", "/api/profiles", "/api/env", "/api/mcp/servers",
  "/api/memory", "/api/memory/providers", "/api/curator", "/api/learning/graph", "/api/config",
  "/api/config/defaults", "/api/config/schema", "/api/cron/jobs", "/api/plugins", "/api/model/info",
  "/api/model/options", "/api/model/auxiliary", "/api/tools/toolsets", "/api/messaging/platforms",
  "/api/logs", "/api/analytics/usage", "/api/ui-preferences", "/api/fs/default-cwd",
  "/api/profiles/sessions/sidebar", "/api/delegation/routing", "/api/webhooks", "/api/auth/me",
  "/api/local-models/status", "/api/skills/hub/sources", "/api/desktop-plugins", "/api/actions",
  // A native-http grant refuses these two without an explicit profile of its own
  // (`hermes_cli/dashboard_auth/native_http.py`, `_check_profile_scope`).
  "/api/cron/jobs?profile=default", "/api/profiles/sessions/sidebar?recents_profile=default",
];

const report = { home: HOME, startedAt: new Date().toISOString() };

function env() {
  return {
    ...withOurHermesOnPath(process.env),
    HERMES_HOME: HOME,
    MEM0_TELEMETRY: "false",
    MEM0_DIR: path.join(HOME, "mem0"),
    GATEWAY_MULTIPLEX_PROFILES: "true",
    HERMES_GATEWAY_LOCK_DIR: gatewayLockDir(HOME),
    PYTHONIOENCODING: "utf-8",
  };
}

function runHermes(args, timeoutMs = 120_000) {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(HERMES_BIN, args, { env: env(), windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr = (stderr + d).slice(-4000)));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, ms: Date.now() - started });
    });
  });
}

// --- tickets: their Python client, verbatim (local-gateway-python.ts, TICKET_SCRIPT) ---------

const TICKET_SCRIPT = `
import json, os, sys
from contextlib import redirect_stdout
from pathlib import Path
from types import SimpleNamespace
with redirect_stdout(sys.stderr):
    from hermes_cli.gateway_client import _session_ticket
    from hermes_cli.gateway_runtime_discovery import DiscoveryError, _private_node
while True:
    line = sys.stdin.buffer.readline(65537)
    if not line:
        break
    if len(line) > 65536 or not line.endswith(b'\\n'):
        break
    request = json.loads(line)
    try:
        with redirect_stdout(sys.stderr):
            endpoint = SimpleNamespace(**{'control_home': None, **request['endpoint']})
            home = Path(endpoint.profile_id)
            if str(home.resolve()) != endpoint.profile_id or endpoint.runtime_protocol != 1:
                raise ValueError('invalid ticket endpoint')
            if os.name != 'nt':
                _private_node(home, kind='directory', home=True)
            ticket = _session_ticket(home, endpoint, purpose=request['purpose'],
                                     scope='host' if request['purpose'] == 'interactive' else None)
        reply = {'id': request['id'], 'ticket': ticket}
    except DiscoveryError as exc:
        reply = {'id': request['id'], 'error': exc.reason}
    except Exception as exc:
        reply = {'id': request['id'], 'error': 'ticket_failed: ' + type(exc).__name__}
    print(json.dumps(reply), flush=True)
`;

class TicketBridge {
  constructor(endpoint) {
    this.endpoint = endpoint;
    this.child = spawn(PYTHON_BIN, ["-u", ...PYTHON_ARGS, "-c", TICKET_SCRIPT], {
      cwd: HERMES_SRC_DIR,
      env: { ...env(), HERMES_HOME: endpoint.profile_id, PYTHONUTF8: "1" },
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.pending = new Map();
    this.seq = 0;
    this.out = "";
    this.err = "";
    this.child.stderr.on("data", (d) => (this.err = (this.err + d).slice(-2000)));
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (d) => {
      this.out += d;
      let end;
      while ((end = this.out.indexOf("\n")) >= 0) {
        const line = this.out.slice(0, end);
        this.out = this.out.slice(end + 1);
        try {
          const reply = JSON.parse(line);
          const waiter = this.pending.get(reply.id);
          this.pending.delete(reply.id);
          waiter?.(reply);
        } catch {
          /* not protocol */
        }
      }
    });
  }

  mint(purpose) {
    const started = Date.now();
    const id = ++this.seq;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ error: `timeout; stderr: ${this.err.slice(-300)}`, ms: Date.now() - started });
      }, 30_000);
      this.pending.set(id, (reply) => {
        clearTimeout(timer);
        resolve({ ...reply, ms: Date.now() - started });
      });
      const { profile_id, instance_id, runtime_protocol, control_home } = this.endpoint;
      this.child.stdin.write(
        JSON.stringify({ id, endpoint: { profile_id, instance_id, runtime_protocol, control_home }, purpose }) + "\n",
      );
    });
  }

  close() {
    this.child.stdin.end();
    setTimeout(() => this.child.kill(), 2000).unref();
  }
}

// --- socket ----------------------------------------------------------------------------------

function dial(origin, ticket) {
  const url = `${origin.replace(/^http/, "ws")}/api/ws`;
  const protocols = ticket ? ["hermes-gateway-v1", `hermes-gateway-ticket.${ticket}`] : [];
  return new Promise((resolve) => {
    const ws = new WebSocket(url, protocols);
    const frames = [];
    const timer = setTimeout(() => {
      // Neither admitted nor refused: the upgrade is left hanging.
      try { ws.close(); } catch { /* not open */ }
      resolve({ ok: false, reason: "no answer in 15 s", ws });
    }, 15_000);
    ws.addEventListener("message", (e) => frames.push(e.data));
    ws.addEventListener("open", () => {
      // The first frame, if the gateway sends one on its own.
      setTimeout(() => {
        clearTimeout(timer);
        resolve({ ok: true, ws, protocol: ws.protocol, firstFrames: frames.slice(0, 2) });
      }, 1500);
    });
    ws.addEventListener("close", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, reason: `close ${e.code} ${e.reason}`, ws });
    });
    ws.addEventListener("error", () => {});
  });
}

let rpcSeq = 0;
function rpc(ws, method, params = {}, timeoutMs = 30_000) {
  const id = `t531-${++rpcSeq}`;
  const started = Date.now();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      ws.removeEventListener("message", onMessage);
      resolve({ timeout: true, ms: Date.now() - started });
    }, timeoutMs);
    function onMessage(event) {
      let frame;
      try {
        frame = JSON.parse(event.data);
      } catch {
        return;
      }
      if (frame.id !== id) return;
      clearTimeout(timer);
      ws.removeEventListener("message", onMessage);
      resolve({ ...frame, ms: Date.now() - started });
    }
    ws.addEventListener("message", onMessage);
    ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
  });
}

// --- what the window calls -------------------------------------------------------------------

function classify() {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "aec-t531-classify-"));
  const answer = path.join(scratch, "routes.json");
  const out = spawnSync(PYTHON_BIN, [...PYTHON_ARGS, path.join(RUNTIME_DIR, "single-gateway-classify.py"), answer], {
    cwd: HERMES_SRC_DIR,
    env: { ...process.env, HERMES_HOME: scratch, PYTHONIOENCODING: "utf-8" },
    encoding: "utf-8",
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  const routes = out.status === 0 && fs.existsSync(answer) ? fs.readFileSync(answer, "utf-8") : null;
  fs.rmSync(scratch, { recursive: true, force: true });
  if (!routes) throw new Error(`classify failed (${out.status}): ${(out.stderr ?? "").slice(-1500)}`);
  return JSON.parse(routes);
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    // Their generated contract lists every method of the core, called or not: it is not a call site.
    else if (/\.(ts|tsx|mjs|js)$/.test(entry.name) && !/\.(test|generated)\.(ts|tsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}

/** Every registry method named as a string literal in our window's source, with the side that
 *  names it: `main` (our bridge), `donor` (their vendored renderer), `aec` (our surfaces). */
function windowMethods(registry) {
  const src = path.join(REPO_DIR_FOR_PROBES, "apps", "desktop", "src");
  const sides = { main: [path.join(src, "main"), path.join(src, "preload")],
    donor: [path.join(src, "renderer", "src", "donor")], aec: [path.join(src, "renderer", "src", "aec")] };
  const used = {};
  for (const [side, dirs] of Object.entries(sides)) {
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue;
      for (const file of walk(dir)) {
        const text = fs.readFileSync(file, "utf-8");
        for (const m of text.matchAll(/['"`]([a-z_]+(?:\.[a-z_]+)+)['"`]/g)) {
          if (!(m[1] in registry)) continue;
          (used[m[1]] ??= new Set()).add(side);
        }
      }
    }
  }
  return Object.fromEntries(Object.entries(used).sort().map(([k, v]) => [k, [...v].sort()]));
}

// --- processes -------------------------------------------------------------------------------

/** `gateway run` processes started from THIS checkout's core (never the owner's own Hermes). */
function ourGatewayProcesses() {
  const root = path.join(RUNTIME_DIR, "core").toLowerCase().replace(/'/g, "''");
  const script =
    "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'gateway' -and $_.CommandLine -match ' run' } | " +
    "ForEach-Object { \"$($_.ProcessId)|$($_.WorkingSetSize)|$($_.ExecutablePath)|$($_.CommandLine)\" }";
  const out = spawnSync("powershell", ["-NoProfile", "-Command", script], { encoding: "utf-8", windowsHide: true }).stdout ?? "";
  return out
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [pid, ws, exe, ...cmd] = line.split("|");
      return { pid: Number(pid), mb: Math.round(Number(ws) / 1048576), exe, cmd: cmd.join("|") };
    })
    .filter((p) => (p.exe ?? "").toLowerCase().startsWith(root));
}

function listeningPorts(pids) {
  const out = spawnSync("netstat", ["-ano", "-p", "TCP"], { encoding: "utf-8" }).stdout ?? "";
  return out
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .filter((c) => c.length >= 5 && c[3] === "LISTENING" && pids.has(Number(c[4])))
    .map((c) => c[1]);
}

// --- main ------------------------------------------------------------------------------------

async function main() {
  const before = ourGatewayProcesses();
  report.gatewaysBefore = before.length;

  // 1. ensure
  const ensure1 = await runHermes(["gateway", "ensure", "--json"]);
  let payload;
  try {
    payload = JSON.parse(ensure1.stdout);
  } catch {
    throw new Error(`ensure gave no JSON (exit ${ensure1.code}): ${ensure1.stderr.slice(-600)}`);
  }
  report.ensureCold = { ms: ensure1.ms, code: ensure1.code, state: payload.state, reason: payload.reason_code ?? null };
  const endpoint = payload.endpoint;
  report.endpoint = endpoint ? { ...endpoint } : null;
  report.ensurePayloadKeys = Object.keys(payload);
  console.log(`ensure (cold): ${ensure1.ms} ms, exit ${ensure1.code}, state ${payload.state}`);
  if (!endpoint) throw new Error(`no endpoint: ${JSON.stringify(payload).slice(0, 600)}`);
  console.log(`endpoint: ${endpoint.api_origin} capabilities=${endpoint.capabilities} supervisor=${endpoint.supervisor}`);

  const ensure2 = await runHermes(["gateway", "ensure", "--json"]);
  const payload2 = JSON.parse(ensure2.stdout || "{}");
  report.ensureWarm = { ms: ensure2.ms, state: payload2.state, sameInstance: payload2.endpoint?.instance_id === endpoint.instance_id };
  console.log(`ensure (running): ${ensure2.ms} ms, same instance ${report.ensureWarm.sameInstance}`);

  const procs = ourGatewayProcesses().filter((p) => !before.some((b) => b.pid === p.pid));
  report.gatewayProcesses = procs.map(({ pid, mb, cmd }) => ({ pid, mb, cmd: cmd.slice(0, 200) }));
  report.listening = listeningPorts(new Set(procs.map((p) => p.pid)));
  report.lockDirUsed = fs.existsSync(gatewayLockDir(HOME)) ? fs.readdirSync(gatewayLockDir(HOME)) : [];
  console.log(`gateway processes: ${procs.length} (${procs.map((p) => `${p.mb} MB`).join(", ")}); listening ${report.listening.join(", ")}`);

  // 2. tickets
  const bridge = new TicketBridge(endpoint);
  const t1 = await bridge.mint("interactive");
  const t2 = await bridge.mint("native-http");
  report.tickets = { interactiveMs: t1.ms, interactiveError: t1.error ?? null, nativeHttpMs: t2.ms, nativeHttpError: t2.error ?? null,
    ticketLength: t1.ticket?.length ?? 0 };
  console.log(`tickets: interactive ${t1.ticket ? "ok" : t1.error} (${t1.ms} ms), native-http ${t2.ticket ? "ok" : t2.error} (${t2.ms} ms)`);
  if (!t1.ticket) throw new Error(`no interactive ticket: ${t1.error}`);

  // 3. socket
  const socket = await dial(endpoint.api_origin, t1.ticket);
  report.socket = { ok: socket.ok, reason: socket.reason ?? null, protocol: socket.protocol ?? null,
    firstFrames: (socket.firstFrames ?? []).map((f) => String(f).slice(0, 300)) };
  console.log(`socket: ${socket.ok ? `open, protocol ${socket.protocol}` : socket.reason}; first frames ${report.socket.firstFrames.length}`);
  const reuse = await dial(endpoint.api_origin, t1.ticket);
  report.ticketReuse = reuse.ok ? "accepted again" : reuse.reason;
  if (reuse.ok) reuse.ws.close();
  console.log(`same ticket again: ${report.ticketReuse}`);
  const noTicket = await dial(endpoint.api_origin, "");
  report.socketWithoutTicket = noTicket.ok ? "open" : noTicket.reason;
  if (noTicket.ok) noTicket.ws.close();

  const registry = classify();
  const used = windowMethods(registry);
  const methods = {};
  if (socket.ok) {
    for (const [method, sides] of Object.entries(used)) {
      const predicted = registry[method];
      if (NOT_CALLED.has(method)) {
        methods[method] = { sides, predicted, live: "not called" };
        continue;
      }
      const reply = await rpc(socket.ws, method, {}, 20_000);
      const live = reply.timeout ? "timeout"
        : reply.error?.code === -32601 ? "unknown method"
          : reply.error ? `error ${reply.error.code} ${String(reply.error.message).slice(0, 80)}` : "result";
      methods[method] = { sides, predicted, live, ms: reply.ms };
    }
  }
  report.methods = methods;

  // 5. a chat without a model
  if (socket.ok) {
    const created = await rpc(socket.ws, "session.create", {});
    const sid = created.result?.session_id ?? created.result?.id ?? null;
    const listed = await rpc(socket.ws, "session.list", {});
    const closed = sid ? await rpc(socket.ws, "session.close", { session_id: sid }) : null;
    report.chatWithoutModel = {
      create: created.error ? `error ${created.error.code} ${created.error.message}` : `ok (${created.ms} ms)`,
      createResultKeys: created.result ? Object.keys(created.result) : [],
      list: listed.error ? `error ${listed.error.code}` : `ok, ${JSON.stringify(listed.result).length} chars`,
      close: closed ? (closed.error ? `error ${closed.error.code} ${closed.error.message}` : "ok") : "skipped",
    };
    console.log(`chat without model: ${JSON.stringify(report.chatWithoutModel)}`);
    const caps = await rpc(socket.ws, "groups.capabilities", {});
    report.groupsCapabilities = caps.error ? `error ${caps.error.code} ${caps.error.message}`
      : { driver: caps.result?.driver, methods: caps.result?.methods?.length ?? null };
    socket.ws.close();
  }

  // 4. REST
  const rest = {};
  // `/api/status` is public; the others need a credential.
  const noHeader = {};
  for (const route of ["/api/status", "/api/sessions", "/api/config", "/api/env"]) {
    noHeader[route] = await fetch(`${endpoint.api_origin}${route}`).then((r) => r.status).catch((e) => String(e));
  }
  report.restWithoutTicket = noHeader;
  for (const route of REST_GETS) {
    const t = await bridge.mint("native-http");
    const started = Date.now();
    const status = await fetch(`${endpoint.api_origin}${route}`, { headers: { "X-Hermes-Gateway-Ticket": t.ticket ?? "" } })
      .then(async (r) => { await r.arrayBuffer(); return r.status; })
      .catch((e) => String(e));
    rest[route] = { status, ms: Date.now() - started };
  }
  // A write the bridge makes (server requests, decision sheets): POST /api/fs/write-text.
  const probeFile = path.join(HOME, "t531-write-probe.txt");
  {
    const t = await bridge.mint("native-http");
    rest["POST /api/fs/write-text"] = {
      status: await fetch(`${endpoint.api_origin}/api/fs/write-text`, {
        method: "POST",
        headers: { "X-Hermes-Gateway-Ticket": t.ticket ?? "", "Content-Type": "application/json" },
        body: JSON.stringify({ path: probeFile, content: "t531" }),
      }).then((r) => r.status).catch((e) => String(e)),
      written: fs.existsSync(probeFile),
    };
    const t2r = await bridge.mint("native-http");
    const sameTwice = [];
    for (let i = 0; i < 2; i += 1) {
      sameTwice.push(await fetch(`${endpoint.api_origin}/api/status`, { headers: { "X-Hermes-Gateway-Ticket": t2r.ticket ?? "" } })
        .then((r) => r.status).catch((e) => String(e)));
    }
    report.restTicketReuse = sameTwice;
  }
  report.rest = rest;
  console.log(`REST without ticket: ${JSON.stringify(noHeader)}; same native-http ticket twice: ${report.restTicketReuse.join(", ")}`);
  bridge.close();

  // 6. stop
  const stop = await runHermes(["gateway", "stop"], 120_000);
  await new Promise((r) => setTimeout(r, 3000));
  const left = ourGatewayProcesses().filter((p) => procs.some((q) => q.pid === p.pid));
  report.stop = { ms: stop.ms, code: stop.code, left: left.length, tail: stop.stdout.slice(-300) + stop.stderr.slice(-300) };
  const logTail = (() => {
    const log = path.join(HOME, "logs", "gateway.log");
    if (!fs.existsSync(log)) return [];
    return fs.readFileSync(log, "utf-8").split(/\r?\n/).filter((l) => /UNCLEAN|shutdown|stopp|drain/i.test(l)).slice(-6);
  })();
  report.stopLog = logTail.map((l) => l.slice(0, 200));
  console.log(`gateway stop: ${stop.ms} ms, exit ${stop.code}, gateway processes left: ${left.length}`);
}

try {
  await main();
} catch (error) {
  report.failure = String(error?.stack ?? error);
  console.error(`could not measure: ${error?.message ?? error}`);
  // Never leave this profile's gateway running (AGENTS.md, «No orphans»).
  const stop = await runHermes(["gateway", "stop"], 120_000);
  console.error(`gateway stop after the failure: exit ${stop.code}`);
}
report.finishedAt = new Date().toISOString();
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 2));
const tally = {};
for (const m of Object.values(report.methods ?? {})) {
  const key = `${m.predicted} / ${m.live.startsWith("error") ? "error" : m.live}`;
  tally[key] = (tally[key] ?? 0) + 1;
}
console.log(`methods: ${JSON.stringify(tally)}`);
process.exit(report.failure ? 3 : 0);
