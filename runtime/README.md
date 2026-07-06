# runtime/

Isolated install of pinned `hermes-agent` used by the desktop app. Never touches
the user's personal Hermes install/profile (e.g. `%LOCALAPPDATA%\hermes`).

Requires `uv` on PATH.

Run setup:

```
node runtime/setup.mjs
```

Creates a venv at `runtime/.hermes-venv` (Python 3.12.13, `hermes-agent==0.18.0`,
see PLAN.md § Stack) and a dev profile dir at `runtime/dev-profile` (set as
`HERMES_HOME` when invoking the isolated `hermes` binary). Idempotent — safe to
re-run. Both dirs are gitignored (local artifacts). Paths/pins are defined in
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
