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
