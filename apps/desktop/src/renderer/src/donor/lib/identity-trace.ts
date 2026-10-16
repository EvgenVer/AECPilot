/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/identity-trace.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/**
 * Change-only desktop.log trace for multi-connection identity decisions: which
 * socket a (connection, profile) request rides, the rows each connection
 * returned to the bot relay, and per-route bot titles. Two registry sources can
 * both expose `default`, so a request answered by the wrong backend looks
 * healthy everywhere except in these values; desktop.log is what a
 * `hermes debug share` bundle carries off the user's machine.
 *
 * A line is written only when a key's value changes, so a steady state costs
 * nothing per relay tick. Renderer console lines below error level never
 * reach desktop.log, hence the explicit `logLine` IPC.
 */

const lastTraced = new Map<string, string>()

/** Which renderer wrote the line (`win=` is how Electron tags every non-main
 *  window): each window runs its own stores and plugins. */
function windowTraceTag(): string {
  return new URLSearchParams(window.location.search).get('win') || 'main'
}

export function traceIdentityChange(channel: string, key: string, value: string): void {
  const id = `${channel}\u0000${key}`

  if (lastTraced.get(id) === value) {
    return
  }

  lastTraced.set(id, value)
  window.hermesDesktop?.logLine?.(`[${channel} win=${windowTraceTag()}] ${key} ${value}`)
}
