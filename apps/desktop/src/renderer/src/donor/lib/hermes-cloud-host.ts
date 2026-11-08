/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/hermes-cloud-host.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/**
 * The Webapp tab is served BY a Hermes Cloud agent (its own origin is the
 * agent). Cloud then owns every update: the app itself comes from that agent.
 * Kept free of the session store so low-level modules (notifications, the
 * settings manifest) can ask it without an import cycle.
 */

import { isHermesCloudUrl } from '@hermes/shared'

import { isBrowserHostedDesktop } from '@/lib/platform'

export function servedByHermesCloud(): boolean {
  return typeof window !== 'undefined' && isBrowserHostedDesktop() && isHermesCloudUrl(window.location.origin)
}
