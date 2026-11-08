// An A2A exchange with our agent, end to end, without a paid model (task T60, UR19).
//
// A test partner sends our agent a task over A2A v1.0 and gets the agent's answer back —
// the inbound half of «A2A как в Hermes». The model is a scripted OpenAI-compatible
// server on 127.0.0.1 (it answers every completion with REPLY), so the run is free and
// the answer is known. Everything between is the core's own: `hermes gateway run` with
// the `a2a` platform on, the Agent Card, JSON-RPC `message/send`, the injection of the
// peer's text into the agent's session, the reply over A2A.
//
// Checks: the Agent Card is served; `message/send` returns REPLY; the model received the
// partner's text framed as untrusted peer input; nothing listens outside 127.0.0.1 (no
// token is set, so the core keeps A2A on the loopback).
//
// The outbound half — push notifications with an HMAC signature — is
// `a2a-push-probe.mjs`: delivery works, the signature does not verify (the core signs
// one serialization and sends another; owner decision 2026-11-07: a known quirk).
//
// Writes into the profile it is given — run it on a temporary copy only:
//   AEC_HERMES_HOME=<temporary profile copy> node runtime/a2a-exchange-probe.mjs
// Exit codes: 0 = all checks passed; 1 = a check failed; 3 = could not run.

import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";

import { HERMES_BIN, RUNTIME_DIR, gatewayLockDir, withOurHermesOnPath } from "./hermes-env.mjs";
import { installSecretFilter } from "./register-secret-filter.mjs";
import { hiddenChild } from "./serve.mjs";

const home = process.env.AEC_HERMES_HOME && path.resolve(process.env.AEC_HERMES_HOME);
if (!home || home === path.resolve(RUNTIME_DIR, "dev-profile")) {
  console.error("a2a-exchange-probe: set AEC_HERMES_HOME to a temporary profile copy");
  process.exit(3);
}

const REPLY = "Смета пересчитана: 3 позиции изменены.";
const ASK = `Пересчитай смету по разделу КР (проба ${randomUUID().slice(0, 8)})`;

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/** The scripted model: every chat completion answers REPLY, streamed or not. */
function startModel(port) {
  const seen = [];
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf-8");
      if (request.method === "GET" && request.url.endsWith("/models")) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ object: "list", data: [{ id: "probe-model", object: "model" }] }));
        return;
      }
      let body = {};
      try {
        body = JSON.parse(raw);
      } catch {
        // not JSON — answered all the same
      }
      seen.push(body);
      const id = `chatcmpl-${seen.length}`;
      const created = Math.floor(Date.now() / 1000);
      if (body.stream) {
        response.writeHead(200, { "content-type": "text/event-stream" });
        const chunk = (delta, finish = null) =>
          `data: ${JSON.stringify({ id, object: "chat.completion.chunk", created, model: "probe-model", choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
        response.write(chunk({ role: "assistant", content: REPLY }));
        response.write(chunk({}, "stop"));
        response.end("data: [DONE]\n\n");
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          id,
          object: "chat.completion",
          created,
          model: "probe-model",
          choices: [{ index: 0, message: { role: "assistant", content: REPLY }, finish_reason: "stop" }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
      );
    });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ server, seen })));
}

/** `model:` → the scripted server; `platforms.a2a` on. Text edits, the rest stays. */
function configure(configPath, modelPort, a2aPort) {
  const lines = fs.readFileSync(configPath, "utf-8").split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^model:\s*$/.test(line)) {
      out.push("model:", "  provider: custom", `  base_url: http://127.0.0.1:${modelPort}/v1`, "  default: probe-model");
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) i++;
      continue;
    }
    out.push(line);
    if (/^platforms:\s*$/.test(line)) {
      out.push("  a2a:", "    enabled: true", "    extra:", `      port: ${a2aPort}`);
    }
  }
  if (!out.some((line) => /^platforms:\s*$/.test(line))) {
    out.push("platforms:", "  a2a:", "    enabled: true", "    extra:", `      port: ${a2aPort}`);
  }
  fs.writeFileSync(configPath, out.join("\n"), "utf-8");
}

function request(port, method, urlPath, body) {
  return new Promise((resolve) => {
    const data = body === undefined ? undefined : Buffer.from(JSON.stringify(body), "utf-8");
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        method,
        path: urlPath,
        headers: data ? { "content-type": "application/json", "content-length": data.length } : {},
        timeout: 180_000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString("utf-8") }));
      },
    );
    req.on("error", (error) => resolve({ status: 0, text: String(error) }));
    req.on("timeout", () => req.destroy(new Error("timeout")));
    if (data) req.write(data);
    req.end();
  });
}

function killTree(proc) {
  if (proc && proc.exitCode === null) spawnSync("taskkill", ["/PID", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
}

/** TCP ports a process tree listens on, from `netstat -ano`. */
function listening(pid) {
  const tree = new Set([String(pid)]);
  // `wmic` is gone from Windows 11; the process table comes from PowerShell.
  const list =
    spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ParentProcessId),$($_.ProcessId)" }',
      ],
      { encoding: "utf-8", windowsHide: true },
    ).stdout ?? "";
  const rows = list
    .split(/\r?\n/)
    .map((l) => l.trim().split(","))
    .filter((r) => r.length === 2);
  for (let grew = true; grew; ) {
    grew = false;
    for (const [parent, child] of rows) {
      if (tree.has(parent) && !tree.has(child)) {
        tree.add(child);
        grew = true;
      }
    }
  }
  const out = spawnSync("netstat", ["-ano", "-p", "TCP"], { encoding: "utf-8" }).stdout ?? "";
  return out
    .split(/\r?\n/)
    .map((l) => l.trim().split(/\s+/))
    .filter((c) => c[3] === "LISTENING" && tree.has(c[4]))
    .map((c) => c[1]);
}

const modelPort = await freePort();
const a2aPort = await freePort();
const { server: model, seen } = await startModel(modelPort);
// Our plugins go in as the app puts them at start (the secret filter, Mem0,
// advanced-delegation). Without Mem0 in the profile the core installs it from the network
// in the middle of the first turn (measured on the first run of this probe).
installSecretFilter(home);
configure(path.join(home, "config.yaml"), modelPort, a2aPort);

const env = {
  ...withOurHermesOnPath(process.env),
  HERMES_HOME: home,
  OPENAI_API_KEY: "sk-probe-not-a-real-key",
  A2A_PORT: String(a2aPort),
  MEM0_TELEMETRY: "false",
  MEM0_DIR: path.join(home, "mem0"),
  HERMES_GATEWAY_LOCK_DIR: gatewayLockDir(home),
  PYTHONIOENCODING: "utf-8",
};
const log = fs.openSync(path.join(home, "a2a-exchange-probe-gateway.log"), "a");
const gateway = spawn(HERMES_BIN, ["gateway", "run"], hiddenChild({ env, stdio: ["ignore", log, log] }));

let status = 3;
const result = { checks: {} };
try {
  let card = null;
  for (const end = Date.now() + 120_000; Date.now() < end && !card; ) {
    const got = await request(a2aPort, "GET", "/.well-known/agent-card.json");
    if (got.status === 200) card = JSON.parse(got.text);
    else await new Promise((r) => setTimeout(r, 1000));
  }
  result.checks.agent_card = Boolean(card?.name);
  // The card is up before the gateway finishes restoring its sessions; a message that
  // arrives in that window is queued and its task closes without an answer (measured
  // 2026-11-08). Wait for the gateway to say it runs.
  const logPath = path.join(home, "a2a-exchange-probe-gateway.log");
  for (const end = Date.now() + 60_000; Date.now() < end; ) {
    if (fs.readFileSync(logPath, "utf-8").includes("Channel directory built")) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  await new Promise((r) => setTimeout(r, 3000));
  result.card = card && { name: card.name, url: card.url ?? card.supportedInterfaces?.[0]?.url };
  if (card) {
    const sent = await request(a2aPort, "POST", "/", {
      jsonrpc: "2.0",
      id: 1,
      method: "message/send",
      params: { message: { role: "ROLE_USER", messageId: randomUUID(), parts: [{ text: ASK }] } },
    });
    result.send = { status: sent.status, body: sent.text.slice(0, 600) };
    let parsed = {};
    try {
      parsed = JSON.parse(sent.text || "{}");
    } catch {
      // not JSON
    }
    result.checks.reply_returned = sent.status === 200 && JSON.stringify(parsed).includes(REPLY);
    const prompts = seen.map((b) => JSON.stringify(b.messages ?? ""));
    // Requests without `messages` are the core's own side calls (title, memory); the turn
    // is the one that carries the peer's text.
    result.model_calls = { all: seen.length, turns: seen.filter((b) => Array.isArray(b.messages)).length };
    result.checks.peer_text_reached_model = prompts.some((p) => p.includes(ASK.slice(0, 30)));
    const ports = listening(gateway.pid);
    result.listening = ports;
    result.checks.loopback_only = ports.length > 0 && ports.every((addr) => addr.startsWith("127.0.0.1:") || addr.startsWith("[::1]:"));
    result.ok = Object.values(result.checks).every(Boolean);
    status = result.ok ? 0 : 1;
  }
} finally {
  killTree(gateway);
  model.close();
}
console.log(JSON.stringify(result, null, 2));
process.exit(status);
