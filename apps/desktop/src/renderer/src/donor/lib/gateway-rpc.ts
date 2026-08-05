/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/gateway-rpc.ts
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/** True when a JSON-RPC call failed because the backend predates the method. */
export function isMissingRpcMethod(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)

  return /method not found|-32601|unknown method|no such method/i.test(message)
}

/** True when a prompt response raced a backend-side timeout / completion. */
export function isMissingPendingPromptRequest(error: unknown, key: string): boolean {
  const message = error instanceof Error ? error.message : String(error)

  return message.toLowerCase().includes(`no pending ${key.toLowerCase()} request`)
}

/** True when a pre-deferral backend refused a mid-turn model switch (4009).
 *  Current gateways park the pick and answer `scope: "pending"` instead. */
export function isBusySessionModelSwitch(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)

  return /session busy/i.test(message) && /switching models/i.test(message)
}
