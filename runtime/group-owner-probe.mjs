// Who owns group rooms (`groups.*`) on core 0.23 under our process layout (task T50).
//
// Our app runs `hermes serve --isolated` for the window and, when schedules are on,
// their messenger gateway `hermes gateway run` next to it (decision 0011,
// `apps/desktop/src/main/cron-runner.ts`). On 0.23 a standalone serve keeps rooms in
// the root `shared-state.db` only while no gateway serves the profile; a READY gateway
// becomes the owner, imports the standalone rooms once and every room call is
// forwarded to it (`tui_gateway/methods_groups_forward.py`). This probe measures that
// on our layout, with the same environment the cron runner gives the gateway:
//
//   A. serve alone: capabilities, list, create room A;
//   B. gateway started: when the core's own discovery sees it ready, capabilities and
//      list through serve, create room B, the TCP ports the gateway listens on;
//   C. gateway stopped the way the app stops it (`proc.kill()`): list, state of A and B,
//      create room C;
//   D. gateway started again: list, state of A and B.
//
// First run on 0.23.0 (task T50, 2026-11-07): `runtime/contracts/measure-0.23.0.md`.
// No model call; rooms get two members that never run a turn. A room seats only
// profiles local to its gateway, so the probe creates four specialist profiles in the
// profile it is given — run it on a temporary copy only.
//
// Usage: AEC_HERMES_HOME=<temporary profile copy> node runtime/group-owner-probe.mjs
// Exit codes: 0 = measured (read the printed lines); 3 = could not measure.

import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { HERMES_BIN, PYTHON_ARGS, PYTHON_BIN, RUNTIME_DIR, gatewayLockDir, withOurHermesOnPath } from "./hermes-env.mjs";
import { HERMES_HOME_DIR, hiddenChild, startServe, stopServe, waitHealthy } from "./serve.mjs";
import { connectWs, rpcCall } from "./gateway-client.mjs";

const READY_TIMEOUT_MS = 180_000;

function short(value, max = 300) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

async function call(ws, method, params = {}) {
  const started = Date.now();
  const response = await rpcCall(ws, method, params, { timeoutMs: 60_000 }).catch((err) => ({
    error: { message: String(err?.message ?? err) },
  }));
  return { ms: Date.now() - started, ...response };
}

// A room seats only profiles local to its gateway (code 5111 otherwise).
const PAIRS = { a: ["t50alpha", "t50beta"], b: ["t50gamma", "t50delta"], c: ["t50alpha", "t50gamma"] };

function ensureProfiles() {
  for (const profile of new Set(Object.values(PAIRS).flat())) {
    if (fs.existsSync(path.join(HERMES_HOME_DIR, "profiles", profile))) continue;
    // `--no-alias`: no wrapper script on the person's PATH.
    const made = spawnSync(HERMES_BIN, ["profile", "create", profile, "--no-alias", "--no-skills"], {
      env: { ...process.env, HERMES_HOME: HERMES_HOME_DIR, HERMES_GATEWAY_LOCK_DIR: gatewayLockDir(HERMES_HOME_DIR) },
      encoding: "utf-8",
      windowsHide: true,
    });
    if (made.status !== 0) throw new Error(`profile create ${profile}: ${(made.stderr ?? "").slice(-300)}`);
  }
}

function members(tag) {
  return PAIRS[tag].map((profile) => ({
    member_id: profile,
    profile,
    handle: profile,
    target: { kind: "local", profile },
  }));
}

function listeningPorts() {
  const out = spawnSync("netstat", ["-ano", "-p", "TCP"], { encoding: "utf-8" }).stdout ?? "";
  const ports = new Map();
  for (const line of out.split(/\r?\n/)) {
    const cols = line.trim().split(/\s+/);
    if (cols.length >= 5 && cols[3] === "LISTENING") ports.set(cols[1], cols[4]);
  }
  return ports;
}

function processTree(rootPid) {
  const out = spawnSync(
    "powershell",
    ["-NoProfile", "-Command", "Get-CimInstance Win32_Process | ForEach-Object { \"$($_.ProcessId) $($_.ParentProcessId)\" }"],
    { encoding: "utf-8" },
  ).stdout ?? "";
  const children = new Map();
  for (const line of out.split(/\r?\n/)) {
    const [pid, parent] = line.trim().split(/\s+/);
    if (!pid) continue;
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(pid);
  }
  const tree = new Set([String(rootPid)]);
  const queue = [String(rootPid)];
  while (queue.length) {
    for (const child of children.get(queue.shift()) ?? []) {
      if (!tree.has(child)) {
        tree.add(child);
        queue.push(child);
      }
    }
  }
  return tree;
}

function startGateway() {
  // The cron runner's environment (`cronRunnerSpawnEnv`, cron-runner-pure.ts).
  const env = {
    ...withOurHermesOnPath(process.env),
    HERMES_HOME: HERMES_HOME_DIR,
    MEM0_TELEMETRY: "false",
    MEM0_DIR: path.join(HERMES_HOME_DIR, "mem0"),
    GATEWAY_MULTIPLEX_PROFILES: "true",
    HERMES_GATEWAY_LOCK_DIR: gatewayLockDir(HERMES_HOME_DIR),
  };
  const log = fs.openSync(path.join(HERMES_HOME_DIR, "group-owner-probe-gateway.log"), "a");
  return spawn(HERMES_BIN, ["gateway", "run"], hiddenChild({ env, stdio: ["ignore", log, log] }));
}

function killTree(proc) {
  if (proc && proc.exitCode === null) spawnSync("taskkill", ["/PID", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
}

/** The core's own view (`discover_gateway_endpoint`) plus both room stores. The
 *  install id is shared by serve and the gateway, so the capabilities' authority id
 *  cannot tell the owner — the discovery state can. */
function discover() {
  const out = spawnSync(PYTHON_BIN, [...PYTHON_ARGS, path.join(RUNTIME_DIR, "group-owner-discover.py")], {
    encoding: "utf-8",
    env: { ...process.env, HERMES_HOME: HERMES_HOME_DIR, HERMES_GATEWAY_LOCK_DIR: gatewayLockDir(HERMES_HOME_DIR) },
    windowsHide: true,
  });
  try {
    return JSON.parse(out.stdout.trim().split(/\r?\n/).pop());
  } catch {
    return { state: "unreadable", stderr: (out.stderr ?? "").slice(-300) };
  }
}

async function waitForwarding() {
  const started = Date.now();
  while (Date.now() - started < READY_TIMEOUT_MS) {
    const seen = discover();
    if (seen.state === "ready") return { ms: Date.now() - started, seen };
    await new Promise((r) => setTimeout(r, 2000));
  }
  return { ms: Date.now() - started, seen: discover() };
}

function capsLine(caps) {
  if (caps.error) return `error ${short(caps.error)}`;
  const r = caps.result;
  return short({
    driver: r.driver,
    persistent_process: r.persistent_process,
    authority: r.authority_gateway_id,
    room_link: r.room_link?.enabled ?? r.room_link,
    reason: r.room_link?.reason,
    methods: r.methods?.length,
  });
}

function listLine(list) {
  if (list.error) return `error ${short(list.error)}`;
  const rooms = list.result?.rooms ?? list.result?.items ?? [];
  return `${rooms.length} rooms: ${short(rooms.map((r) => `${r.name}@${String(r.authority_gateway_id ?? "?").slice(0, 12)}`))}`;
}

async function stateLine(ws, roomId) {
  if (!roomId) return "no room";
  const state = await call(ws, "groups.state", { room_id: roomId });
  return state.error ? `error ${short(state.error)} (${state.ms} ms)` : `ok (${state.ms} ms)`;
}

ensureProfiles();
const serve = await startServe();
let gateway;
let exitCode = 3;
try {
  await waitHealthy(serve);
  const { ws } = await connectWs(serve.wsUrl);
  console.log(`profile: ${HERMES_HOME_DIR}`);
  console.log(`discovery and room stores before: ${short(discover(), 900)}`);

  console.log("\n== A. serve alone");
  const capsA = await call(ws, "groups.capabilities");
  console.log(`capabilities: ${capsLine(capsA)}`);
  console.log(`list: ${listLine(await call(ws, "groups.list", {}))}`);
  const createA = await call(ws, "groups.create", { room_id: randomUUID(), name: "T50 room A", members: members("a") });
  const roomA = createA.result?.room?.room_id;
  console.log(`create A: ${createA.error ? `error ${short(createA.error)}` : `ok ${roomA}`} (${createA.ms} ms)`);
  console.log(`discovery and room stores: ${short(discover(), 900)}`);

  console.log("\n== B. gateway run started");
  const portsBefore = listeningPorts();
  gateway = startGateway();
  const forwarding = await waitForwarding();
  console.log(`gateway discovery after ${forwarding.ms} ms: ${short(forwarding.seen, 900)}`);
  console.log(`capabilities via serve: ${capsLine(await call(ws, "groups.capabilities"))}`);
  const tree = processTree(gateway.pid);
  const opened = [...listeningPorts()].filter(([addr, pid]) => !portsBefore.has(addr) && tree.has(pid));
  console.log(`listening TCP ports opened by the gateway tree: ${opened.length ? short(opened) : "none"}`);
  for (const pid of new Set(opened.map(([, owner]) => owner))) {
    const cmd = spawnSync(
      "powershell",
      ["-NoProfile", "-Command", `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`],
      { encoding: "utf-8" },
    ).stdout.trim();
    console.log(`  pid ${pid}${pid === String(gateway.pid) ? " (the gateway itself)" : ""}: ${short(cmd, 400)}`);
  }
  await new Promise((r) => setTimeout(r, 30_000));
  const still = [...listeningPorts()].filter(([addr]) => opened.some(([a]) => a === addr));
  console.log(`  still listening 30 s later: ${still.length ? short(still) : "none"}`);
  console.log(`list: ${listLine(await call(ws, "groups.list", {}))}`);
  const createB = await call(ws, "groups.create", { room_id: randomUUID(), name: "T50 room B", members: members("b") });
  const roomB = createB.result?.room?.room_id;
  console.log(`create B: ${createB.error ? `error ${short(createB.error)}` : `ok ${roomB}`} (${createB.ms} ms)`);
  console.log(`state A: ${await stateLine(ws, roomA)}; state B: ${await stateLine(ws, roomB)}`);
  console.log(`discovery and room stores: ${short(discover(), 900)}`);

  console.log("\n== C. gateway stopped (proc.kill, as the cron runner does)");
  gateway.kill();
  await new Promise((r) => setTimeout(r, 8000));
  killTree(gateway);
  console.log(`discovery: ${short(discover(), 900)}`);
  console.log(`capabilities: ${capsLine(await call(ws, "groups.capabilities"))}`);
  console.log(`list: ${listLine(await call(ws, "groups.list", {}))}`);
  console.log(`state A: ${await stateLine(ws, roomA)}; state B: ${await stateLine(ws, roomB)}`);
  const createC = await call(ws, "groups.create", { room_id: randomUUID(), name: "T50 room C", members: members("c") });
  console.log(`create C: ${createC.error ? `error ${short(createC.error)}` : "ok"} (${createC.ms} ms)`);

  console.log("\n== D. gateway started again");
  gateway = startGateway();
  const again = await waitForwarding();
  console.log(`gateway discovery after ${again.ms} ms: ${again.seen.state}`);
  console.log(`list: ${listLine(await call(ws, "groups.list", {}))}`);
  console.log(`state A: ${await stateLine(ws, roomA)}; state B: ${await stateLine(ws, roomB)}`);
  console.log(`discovery and room stores: ${short(discover(), 900)}`);

  ws.close();
  exitCode = 0;
} catch (err) {
  console.error(`probe failed: ${err?.stack ?? err}`);
} finally {
  if (gateway) {
    gateway.kill();
    await new Promise((r) => setTimeout(r, 3000));
    killTree(gateway);
  }
  await stopServe(serve);
}
process.exit(exitCode);
