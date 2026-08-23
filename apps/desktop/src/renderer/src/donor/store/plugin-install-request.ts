/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/plugin-install-request.ts
 * Commit:  fcbd1076a93841fa88855acce810e342a5b78101 (v2026.8.19)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { atom } from 'nanostores'

/** Which plugin component(s) a legacy deeplink pre-selects after probe. */
export type PluginInstallLegacyHint = 'agent' | 'desktop' | null

/** Future metrics (opt-in): install count + success/failure, per repo. */
export interface PluginInstallRequest {
  repo: string
  enable?: boolean
  force?: boolean
  legacyHint?: PluginInstallLegacyHint
}

export const $pluginInstallRequest = atom<PluginInstallRequest | null>(null)

export function openPluginInstallRequest(request: PluginInstallRequest): void {
  $pluginInstallRequest.set(request)
}

export function closePluginInstallRequest(): void {
  $pluginInstallRequest.set(null)
}
