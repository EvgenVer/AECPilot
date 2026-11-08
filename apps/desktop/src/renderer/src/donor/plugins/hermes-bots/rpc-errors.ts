/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/plugins/hermes-bots/rpc-errors.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/** JSON-RPC method-not-found (`tui_gateway/rpc_dispatch.py`): the backend predates the call.
 *  The message match covers errors that lost their frame across the IPC bridge. */
export function rpcMethodMissing(error: unknown): boolean {
  const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined

  if (typeof code === 'number') {
    return code === -32601
  }

  return /method not found|-32601|unknown method|no such method/i.test(error instanceof Error ? error.message : String(error))
}
