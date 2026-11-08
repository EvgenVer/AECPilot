/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/electron/hud-modifier-types.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
export interface HudModifierStatus {
  enabled: boolean
  state: 'disabled' | 'starting' | 'ready' | 'input-permission' | 'unavailable'
  reason?: 'missing-helper' | 'unsupported-session'
}

export interface HudModifierApi {
  getSettings: () => Promise<HudModifierStatus>
  setEnabled: (enabled: boolean) => Promise<HudModifierStatus>
  openPermissionSettings: () => Promise<void>
  onStatus: (callback: (status: HudModifierStatus) => void) => () => void
}
