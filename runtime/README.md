# runtime/

Isolated install of pinned `hermes-agent` used by the desktop app. Never touches
the user's personal Hermes install/profile (e.g. `%LOCALAPPDATA%\hermes`).

Requires `uv` and `git` on PATH (the core is installed from git, not from PyPI).

Run setup:

```
node runtime/setup.mjs
```

Creates a venv at `runtime/.hermes-venv` (Python 3.12.13, `hermes-agent[mcp]` 0.20.0
installed editable from a shallow checkout at `HERMES_SHA` in `runtime/.hermes-src` —
upstream's build backend refuses to build a wheel, see PLAN.md § Stack) and a dev
profile dir at `runtime/dev-profile` (set as `HERMES_HOME` when invoking the
isolated `hermes` binary). Idempotent — safe to re-run. All three dirs are
gitignored (local artifacts). Paths/pins are defined in
`runtime/hermes-env.mjs`, reused by task 0.7 to launch `hermes serve`.

The first `hermes` invocation against the dev profile creates `.update_check`
(update self-check cache) and `logs/` inside `runtime/dev-profile` — expected.

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
protocol worked but the model call failed on auth (expected until
`runtime/dev-profile/.env` has a real `OPENAI_API_KEY` — see the placeholder
there). Exit 3 = protocol worked but the model call failed for a non-auth
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

`setup.mjs` installs `hermes-agent[mcp]==0.18.0` — the `mcp` extra (approved,
see PLAN.md § Selected dependencies) pulls in hermes's pinned `mcp==1.26.0` +
`starlette==1.0.1` into `runtime/.hermes-venv`, which is what lets
`tools.mcp_tool` act as an MCP *client* and connect to aec-sources (or any
other MCP server) at all. Historical note: before that extra was approved
and installed, this check reliably hit exit 3 with the model correctly
reporting no such tool — `tools.mcp_tool._MCP_AVAILABLE` was `False` and no
MCP server could ever connect, regardless of what was registered in
config.yaml. That's no longer the current state.
