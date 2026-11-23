/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/sdk/bot-wake-log.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/** Electron flattens console arguments, so keep wake fields in the message itself.
 * The renderer console capture persists only this warning namespace to desktop.log. */
export function logBotWake(
  message: 'hydration timed out' | 'hydration timed out, retrying',
  details: Record<string, boolean | number | string>
): void {
  console.warn(`[bot-wake] ${message} ${JSON.stringify(details)}`)
}
