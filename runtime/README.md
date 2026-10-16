# runtime/

Isolated install of pinned `hermes-agent` used by the desktop app. Never touches
the user's personal Hermes install/profile (e.g. `%LOCALAPPDATA%\hermes`).

Requires `uv` and `git` on PATH (the core is installed from git, not from PyPI).

Run setup:

```
node runtime/setup.mjs
```

Creates a venv at `runtime/.hermes-venv` (CPython 3.14.6 managed by `uv`,
`hermes-agent[mcp,ddgs]` 0.22.2 installed editable from a shallow checkout at
`HERMES_SHA` in `runtime/.hermes-src` — upstream's build backend refuses to build a
wheel, see PLAN.md § Stack). Versions are constrained to the core's own `uv.lock`
(`uv export` into `runtime/uv-constraints.txt` on every run). The `ddgs` extra is the
keyless web search our profile selects; since 0.22 it is no longer a core dependency.

The Mem0 memory provider is an external plugin since 0.22: setup keeps its source at
`MEM0_PLUGIN_SHA` (1.3.0) in `runtime/.mem0-plugin-src` and installs its requirements
into the same venv; the app copies the plugin into each profile's `plugins/mem0` at
start (`register-mem0-plugin.mjs`). A profile without that copy makes the core install
the plugin from its catalog over the network on first use.

Setup also creates the dev profile dir `runtime/dev-profile` (the `HERMES_HOME` of
`pnpm dev` and of manual acceptance — keep it clean). Automated runs use
`runtime/e2e-profile` (the stand's provider key lives there), always through a
temporary copy. Idempotent — safe to re-run. All these dirs are gitignored (local
artifacts). Paths/pins are defined in `runtime/hermes-env.mjs`.

The first `hermes` invocation against a profile creates `.update_check`
(update self-check cache) and `logs/` inside it — expected.

**Probes** (`runtime/*-probe.mjs`) start the core directly. Without `AEC_HERMES_HOME`
they run against `runtime/dev-profile`, so point it at a temporary copy of
`runtime/e2e-profile` prepared the way the app prepares a profile at start (our
secret filter and Mem0 plugin, `installSecretFilterEverywhere`; the profile defaults
in `apps/desktop/src/main/agent-defaults-pure.ts`). `serve.mjs` uses a fixed port, so
run probes one at a time. A probe where the agent may edit skills should also get a
copy of `skills/` through `AEC_SKILLS_DIR` (the live e2e stand does this itself,
`apps/desktop/e2e/lib/core.ts`); the profile's `skills.external_dirs` and the secret
filter's `shipped-skills.json` then point at the copy, not the repository.

## serve.mjs

Lifecycle manager for `hermes serve` (the JSON-RPC/WebSocket gateway at
`/api/ws` that the desktop app's chat connects to). No npm deps.

```
node runtime/serve.mjs smoke
```

Starts serve on `127.0.0.1:18789`, waits for a JSON-RPC health-check
response, prints it, then stops the process. Process output is logged
(append) to `runtime/dev-profile/serve.log`.

TODO(Phase 5 / task 5.1): the Electron main process locates this file via a
relative path from `__dirname`, which breaks once the app is packaged into
`app.asar` — revisit for the bundled layout.

## gateway-smoke.mjs

Contract smoke test for the `tui_gateway` JSON-RPC protocol: create a
session, send a message, collect the streamed reply, close the session.

```
node runtime/gateway-smoke.mjs
```

Exit 0 = got a real model reply. Exit 1 = a protocol-level failure. Exit 2 =
protocol worked but the model call failed on auth (expected on the clean
`runtime/dev-profile`; run it with `AEC_HERMES_HOME` at a copy of
`runtime/e2e-profile`, which carries the stand's provider key). Exit 3 = protocol worked but the model call failed for a non-auth
reason (network, rate limit, 5xx, ...).

## register-aec-sources.mjs / aec-sources-check.mjs

Registers the `mcp/aec_sources` MCP server (stdio, `.venv/Scripts/aec-sources.exe`)
in the dev profile's `config.yaml` under `mcp_servers.aec-sources` (task 1.12):

```
node runtime/register-aec-sources.mjs [projectJsonPath]
```

With no argument, materializes a working copy of the tracked fixture template
`runtime/fixtures/demo-vault/.aecpilot/project.json` (its `root_path` is the
literal placeholder `__DEMO_SOURCE_ROOT__`) into
`runtime/dev-profile/aec-demo-vault/.aecpilot/project.json` — inside
`runtime/dev-profile`, already gitignored — substituting the placeholder with
the absolute path of `runtime/fixtures/demo-source` on this machine. The
tracked template is only ever read, never written, so it stays clean
(placeholder-only) in git regardless of how many times the script runs.
Idempotent; preserves any other `mcp_servers` entries and config.yaml
comments/ordering (no YAML parser dependency, same text-merge approach as
`apps/desktop/src/main/llm-settings-pure.ts`).

`aec-sources-check.mjs` is the live verify: it registers aec-sources against
a throwaway tmp fixture, starts `hermes serve`, asks the model to call the
`sources_list` tool, and checks the stream for a matching tool-call event.
Leaves the dev profile registered against the permanent `runtime/fixtures/`
fixture afterward.

```
node runtime/aec-sources-check.mjs
```

Exit 0 = the tool was called and returned the fixture's "demo" source. Exit
2 = protocol OK, no/invalid API key (same convention as gateway-smoke.mjs).
Exit 3 = any other failure (protocol-level failure, non-auth model failure,
or the model correctly reporting the tool isn't available).

`setup.mjs` installs `hermes-agent[mcp,ddgs]` at the pinned SHA (0.22.2 since task
T20.3) — the `mcp` extra (approved, see PLAN.md § Selected dependencies) pulls
in hermes's pinned `mcp==2.0.0` + `starlette==1.3.1` into
`runtime/.hermes-venv`, which is what lets
`tools.mcp_tool` act as an MCP *client* and connect to aec-sources (or any
other MCP server) at all. Historical note: before that extra was approved
and installed, this check reliably hit exit 3 with the model correctly
reporting no such tool — `tools.mcp_tool._MCP_AVAILABLE` was `False` and no
MCP server could ever connect, regardless of what was registered in
config.yaml. That's no longer the current state.
