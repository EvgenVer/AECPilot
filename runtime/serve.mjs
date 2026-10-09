// Lifecycle manager for `hermes serve` — the headless JSON-RPC/WebSocket
// gateway (tui_gateway) that powers the desktop app's chat. No npm deps: uses
// node:child_process, node:net and the Node 22 built-in global WebSocket.
//
// Endpoint: ws://<host>:<port>/api/ws — newline-delimited JSON-RPC. The
// server sends a `gateway.ready` event frame immediately after the WS
// handshake, before any request is sent — that frame alone proves the
// gateway is alive and speaking JSON-RPC.
//
// Auth (loopback bind, no --insecure/gated mode): a `?token=<value>` query
// param, checked against a per-process session token. Instead of parsing it
// out of the served HTML, we pre-set it via HERMES_DASHBOARD_SESSION_TOKEN —
// the same env var the real desktop shell uses (see hermes_cli/web_server.py
// comment: "The desktop shell mints the token and injects it via
// HERMES_DASHBOARD_SESSION_TOKEN so its main process can authenticate").
//
// Checkpoints (UR14, specs/checkpoints-rollback.md): the tui_gateway path
// does NOT read `checkpoints:` from config.yaml — that key is only consulted
// by their interactive CLI (cli.py). tui_gateway gates on the
// HERMES_TUI_CHECKPOINTS env var instead (tui_gateway/server.py:
// `checkpoints_enabled=is_truthy_value(os.environ.get("HERMES_TUI_CHECKPOINTS"))`;
// truthy strings "1"/"true"/"yes"/"on", case-insensitive — utils.py
// TRUTHY_STRINGS). We set it unconditionally below so every `hermes serve`
// we launch snapshots before file writes/destructive commands.
//
// Usage: node runtime/serve.mjs smoke

import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import { memoryEnv } from "./memory-config.mjs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureOurSoul } from "./default-soul.mjs";
import { gatewayLockDir, HERMES_BIN, HERMES_HOME_DIR, withOurHermesOnPath } from "./hermes-env.mjs";
import { warnIfToolsetsNarrowed } from "./narrowed-toolsets.mjs";

// Re-exported so callers that already dynamically import this module (the
// desktop app's main process, task 0.7/0.15) don't need a second dynamic
// import of hermes-env.mjs just to locate the profile dir.
export { HERMES_HOME_DIR };

// Fixed port, chosen free in the dev environment (default hermes port 9119
// is left to any other local Hermes instance the user may run).
// `AEC_SERVE_PORT` (task 3F.1): the acceptance run boots a second app next to
// the developer's own on a free port of its choosing. Unset in normal use.
export const SERVE_PORT = Number(process.env.AEC_SERVE_PORT) || 18789;
export const SERVE_HOST = "127.0.0.1";
export const LOG_PATH = path.join(HERMES_HOME_DIR, "serve.log");

function isPortFree(port, host) {
  return new Promise((resolve) => {
    const probe = net.createConnection({ port, host }, () => {
      probe.end();
      resolve(false); // something is already listening
    });
    probe.on("error", () => resolve(true)); // ECONNREFUSED etc. => free
  });
}

function appendLog(line) {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  fs.appendFileSync(LOG_PATH, `[${new Date().toISOString()}] ${line}\n`);
}

/**
 * D-198: every child we start on Windows gets a HIDDEN console. Without it a
 * console child of the app may get a visible, empty console window, and the
 * core's own children (MCP servers, file search) inherit that console. The
 * core counts on this: it is launched hidden by their Desktop
 * (`hiddenWindowsChildOptions`), and its descendants inherit the hidden console
 * so nothing flashes. `windowsHide` is ignored off Windows.
 */
export function hiddenChild(options) {
  return { ...options, windowsHide: true };
}

/**
 * Spawns `hermes serve` against the isolated dev profile.
 * `extraEnv` (task 0.15) is merged over the base env (HERMES_HOME,
 * HERMES_DASHBOARD_SESSION_TOKEN, and the inherited process.env) — used by
 * the desktop app's main process to inject a safeStorage-decrypted provider
 * API key into the child process without ever writing it to disk.
 * Returns { proc, port, host, wsUrl, token } once the process has been
 * started (does not wait for the gateway to become healthy — use
 * waitHealthy for that).
 */
export async function startServe({ port = SERVE_PORT, host = SERVE_HOST, extraEnv = {} } = {}) {
  if (!fs.existsSync(HERMES_BIN)) {
    throw new Error(`hermes binary not found at ${HERMES_BIN} — run 'node runtime/setup.mjs' first`);
  }

  if (!(await isPortFree(port, host))) {
    throw new Error(`port ${port} on ${host} is already in use — refusing to start serve`);
  }

  fs.mkdirSync(HERMES_HOME_DIR, { recursive: true });

  // Наш SOUL — ДО запуска ядра (находка D-58, SPEC C12). Их
  // `_ensure_default_soul_md` пишет свой текст с чужим именем продукта, но
  // только если файла нет; успеть раньше — единственный способ не трогать их
  // исходники и не потерять правку на подъёме пина.
  ensureOurSoul(HERMES_HOME_DIR);

  // Сторож против тихого обрезания агента (замечание D-66). Говорит вслух и
  // ничего не правит — блок мог поставить человек их же командой.
  warnIfToolsetsNarrowed(HERMES_HOME_DIR);

  // Pre-mint the session token so we can authenticate the WS health-check
  // without scraping it out of the dashboard's HTML response.
  const token = randomBytes(24).toString("hex");

  const proc = spawn(
    HERMES_BIN,
    ["serve", "--port", String(port), "--host", host, "--skip-build"],
    hiddenChild({
      env: {
        // D-141: our `hermes` first, so the donor's bot routines run our pin.
        ...withOurHermesOnPath(process.env),
        HERMES_HOME: HERMES_HOME_DIR,
        // D-164: our own gateway lock dir — not shared with a separate Hermes.
        HERMES_GATEWAY_LOCK_DIR: gatewayLockDir(HERMES_HOME_DIR),
        HERMES_DASHBOARD_SESSION_TOKEN: token,
        // See header comment "Checkpoints" — extraEnv can still override
        // this if a future caller ever needs to opt out.
        HERMES_TUI_CHECKPOINTS: "1",
        // Задача 5.1а. Телеметрию mem0 читают ПРИ ИМПОРТЕ модуля
        // (`mem0/memory/telemetry.py`), поэтому выключать её можно только
        // здесь — до старта процесса. В конфиге для неё места нет. Туда же
        // (D-85) — каталог mem0 внутри профиля вместо `~/.mem0`.
        ...memoryEnv(HERMES_HOME_DIR),
        ...extraEnv,
      },
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );

  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  const logStream = fs.createWriteStream(LOG_PATH, { flags: "a" });
  logStream.write(`\n[${new Date().toISOString()}] starting hermes serve pid=${proc.pid} port=${port}\n`);
  proc.stdout.pipe(logStream, { end: false });
  proc.stderr.pipe(logStream, { end: false });

  proc.on("exit", (code, signal) => {
    appendLog(`hermes serve exited pid=${proc.pid} code=${code} signal=${signal}`);
  });
  proc.on("error", (err) => {
    appendLog(`hermes serve spawn error: ${err.message}`);
  });

  const wsUrl = `ws://${host}:${port}/api/ws?token=${token}`;
  return { proc, port, host, wsUrl, token };
}

/**
 * How long a `hermes serve` may take to answer before we call it dead.
 *
 * MEASURED, 2026-08-24 (finding D-36). Two runs back to back on the dev
 * machine, timestamps taken off the child's own stdout/stderr:
 *   cold: spawn → 2.2s one config warning → SILENCE → 29.1s "HERMES_BACKEND_READY"
 *         → healthy at 29.6s
 *   warm: spawn → 0.7s warning → 4.2s ready → healthy at 4.6s
 *
 * The old default was 30000 — four hundred milliseconds of margin over a cold
 * start. That is a coin flip, not a limit, and when it lost, the message said
 * "gateway did not become healthy", which reads as a broken core. The finding
 * blamed a one-time config migration after a pin raise; that is NOT what this
 * is (the serve path never calls `migrate_config` — only `check_config_version`,
 * and only for the status endpoint). It is the plain cost of a cold start of a
 * large Python program, it happens to ANY first run after the file cache goes
 * cold, and it is silent for 27 of its 29 seconds — so no "still making
 * progress" signal exists to wait on. The only honest fix is a window with
 * real margin over the measured cold number.
 *
 * A dead gateway is still reported at once, not after this window: the
 * process-exit and process-error listeners below reject immediately. Only
 * "alive but never opens the port" pays the full wait.
 */
export const HEALTH_TIMEOUT_MS = 120000;

/**
 * Waits until the gateway is healthy: opens the /api/ws WebSocket and
 * resolves with the first JSON-RPC frame the server sends (the
 * `gateway.ready` event, or any JSON-RPC error/response — both prove the
 * gateway is alive). Rejects on timeout or if the process exits first.
 */
export function waitHealthy(serveHandle, timeoutMs = HEALTH_TIMEOUT_MS) {
  const { proc, wsUrl } = serveHandle;
  return new Promise((resolve, reject) => {
    let settled = false;
    const deadline = Date.now() + timeoutMs;

    const onProcExit = (code, signal) => {
      if (settled) return;
      settled = true;
      reject(new Error(`hermes serve exited before becoming healthy (code=${code} signal=${signal})`));
    };
    const onProcError = (err) => {
      if (settled) return;
      settled = true;
      reject(new Error(`hermes serve process error before becoming healthy: ${err.message}`));
    };
    proc.once("exit", onProcExit);
    proc.once("error", onProcError);

    function cleanup() {
      proc.removeListener("exit", onProcExit);
      proc.removeListener("error", onProcError);
    }

    function attempt() {
      if (settled) return;
      if (Date.now() > deadline) {
        settled = true;
        cleanup();
        // Name what we actually know instead of implying the core is broken:
        // the process was still ALIVE the whole time (an exit would have
        // rejected above), so this is "never opened the port", and its own
        // output is the next place to look.
        reject(
          new Error(
            `gateway did not become healthy within ${timeoutMs}ms — the hermes serve process is still running but never answered on ${wsUrl.split("?")[0]}; its output is in ${LOG_PATH}`,
          ),
        );
        return;
      }

      const ws = new WebSocket(wsUrl);
      let attemptDone = false;

      const attemptTimer = setTimeout(() => {
        if (attemptDone) return;
        attemptDone = true;
        try {
          ws.close();
        } catch {
          // ignore
        }
        if (settled) return; // process already exited/errored — onProcExit/onProcError won
        setTimeout(attempt, 500); // retry — server may still be booting
      }, 2000);

      ws.addEventListener("open", () => {
        // handshake alone is a good sign, but wait for the first JSON-RPC
        // frame to be sure the gateway is actually speaking JSON-RPC.
      });

      ws.addEventListener("message", (event) => {
        if (attemptDone || settled) return;
        let frame;
        try {
          frame = JSON.parse(event.data);
        } catch {
          return; // not a JSON-RPC frame — keep waiting
        }
        if (frame && frame.jsonrpc === "2.0") {
          attemptDone = true;
          settled = true;
          clearTimeout(attemptTimer);
          cleanup();
          try {
            ws.close();
          } catch {
            // ignore
          }
          resolve(frame);
        }
      });

      ws.addEventListener("error", () => {
        if (attemptDone) return;
        attemptDone = true;
        clearTimeout(attemptTimer);
        try {
          ws.close();
        } catch {
          // ignore
        }
        if (settled) return; // process already exited/errored — onProcExit/onProcError won
        setTimeout(attempt, 500); // retry — connection refused while booting
      });
    }

    attempt();
  });
}

/** Ждёт, пока порт действительно освободится. */
async function waitPortFree(port, host, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await isPortFree(port, host)) {
      return true;
    }
    if (Date.now() >= deadline) {
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

/**
 * Stops a hermes serve process started by startServe().
 *
 * ПОЧЕМУ НА WINDOWS СРАЗУ ДЕРЕВО (находка D-106, задача 3F.8). `hermes.exe` —
 * это запускатель: порт слушает его потомок `python.exe`. `proc.kill()` убивает
 * только запускатель, тот выходит за миллисекунды, ожидание «процесс вышел»
 * считается выполненным — а питон живёт дальше и держит порт. Следующий
 * `startServe` упирался в «port … is already in use» и отказывался стартовать;
 * человек это видел как «не удалось сохранить ключ» с английской строкой ядра.
 * Прежний `taskkill /T` стоял только в ветке ТАЙМАУТА, то есть срабатывал ровно
 * тогда, когда уже не мог помочь: после выхода родителя его потомки
 * переподчиняются, и дерева по этому pid больше нет.
 *
 * Поэтому на Windows дерево гасится ПЕРВЫМ делом, пока родитель ещё жив и
 * связь «родитель → потомок» цела. И в любом случае ждём, пока порт отпустят:
 * «процесс вышел» и «порт свободен» — разные события, а стартует следующий по
 * второму.
 */
export async function stopServe(serveHandle, { gracefulTimeoutMs = 5000, portTimeoutMs = 15000 } = {}) {
  const { proc, port = SERVE_PORT, host = SERVE_HOST } = serveHandle;
  if (!proc.pid) {
    return; // spawn never produced a live process — nothing to stop
  }
  if (proc.exitCode === null && proc.signalCode === null) {
    // Race all three: 'exit' is the normal case, but a process that never
    // truly started (spawn error after the pid was assigned) may only emit
    // 'error', and 'close' is the more definitive "stdio streams are done"
    // signal — whichever fires first means the process is no longer live.
    const exited = new Promise((resolve) => {
      proc.once("exit", resolve);
      proc.once("close", resolve);
      proc.once("error", resolve);
    });

    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(proc.pid), "/T", "/F"], hiddenChild({ stdio: "ignore" }));
    } else {
      proc.kill();
    }

    const timedOut = await Promise.race([
      exited.then(() => false),
      new Promise((resolve) => setTimeout(() => resolve(true), gracefulTimeoutMs)),
    ]);

    if (timedOut && process.platform === "win32") {
      appendLog(`stop timed out for pid=${proc.pid}, taskkill /T /F once more`);
      spawnSync("taskkill", ["/PID", String(proc.pid), "/T", "/F"], hiddenChild({ stdio: "ignore" }));
      await exited;
    } else if (timedOut) {
      proc.kill("SIGKILL");
      await exited;
    }
  }

  if (!(await waitPortFree(port, host, portTimeoutMs))) {
    appendLog(`port ${port} still busy ${portTimeoutMs}ms after stopping pid=${proc.pid}`);
  }
}

async function runSmoke() {
  console.log(`== starting hermes serve on ${SERVE_HOST}:${SERVE_PORT}`);
  let handle;
  try {
    handle = await startServe();
  } catch (err) {
    console.error(`smoke FAIL: could not start serve: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  try {
    console.log("== waiting for gateway to become healthy");
    const frame = await waitHealthy(handle);
    console.log("== JSON-RPC response received:");
    console.log(JSON.stringify(frame));
    process.exitCode = 0;
  } catch (err) {
    console.error(`smoke FAIL: ${err.message}`);
    process.exitCode = 1;
  } finally {
    console.log("== stopping hermes serve");
    await stopServe(handle);
    console.log(`== log at ${LOG_PATH}`);
  }
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

// No top-level await: this module is also imported by the Electron main
// process, which electron-vite bundles as CJS — a format that rejects
// top-level await at build time.
if (isMain && process.argv[2] === "smoke") {
  void runSmoke();
} else if (isMain) {
  console.error("usage: node runtime/serve.mjs smoke");
  process.exitCode = 1;
}
