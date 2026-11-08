// Subagent model routes on the real core, without a model call (task T54, UR48).
//
// Installs our plugins into the profile it is given the way the app does at start
// (`installSecretFilter`: the secret filter, Mem0 and `advanced-delegation`), then runs
// `delegation-routes-probe.py` inside the core with a fake provider key in the
// environment — how our app hands the core its keys — and checks that a model route
// saved through the core's REST handler names the provider, resolves to that key, and
// leaves no key in `config.yaml`.
//
// Free: no model, no network. Writes into the profile — run it on a temporary copy only.
//
// Usage: AEC_HERMES_HOME=<temporary profile copy> node runtime/delegation-routes-probe.mjs
// Exit codes: 0 = all checks passed; 1 = a check failed; 3 = could not run.

import { spawnSync } from "node:child_process";
import path from "node:path";

import { PYTHON_ARGS, PYTHON_BIN, RUNTIME_DIR } from "./hermes-env.mjs";
import { installSecretFilter } from "./register-secret-filter.mjs";

const home = process.env.AEC_HERMES_HOME;
if (!home || path.resolve(home) === path.resolve(RUNTIME_DIR, "dev-profile")) {
  console.error("delegation-routes-probe: set AEC_HERMES_HOME to a temporary profile copy");
  process.exit(3);
}

installSecretFilter(home);

const fakeKey = `sk-aecprobe-${Date.now()}`;
const run = spawnSync(PYTHON_BIN, [...PYTHON_ARGS, path.join(RUNTIME_DIR, "delegation-routes-probe.py")], {
  encoding: "utf-8",
  env: {
    ...process.env,
    HERMES_HOME: path.resolve(home),
    OPENROUTER_API_KEY: fakeKey,
    AEC_PROBE_FAKE_KEY: fakeKey,
    AEC_PROBE_PROVIDER: "openrouter",
    PYTHONIOENCODING: "utf-8",
  },
  timeout: 180_000,
});
process.stdout.write(run.stdout ?? "");
if (run.status !== 0) process.stderr.write((run.stderr ?? "").split("\n").slice(-25).join("\n"));
process.exit(run.status === 0 ? 0 : run.status === 1 ? 1 : 3);
