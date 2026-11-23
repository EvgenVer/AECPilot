/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/plugins/hermes-bots/rpc-errors.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
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
