/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/gateway/report-startup-latency.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { randomUuid } from '@hermes/shared'

type GatewayRequest = (
  method: 'shared_metrics.startup_latency',
  params: { elapsed_ms: number; launch_id: string; surface: 'desktop_attach' }
) => Promise<unknown>

/** Fire-and-forget: the main process hands out the launch latency to exactly one renderer
 *  boot per app launch; the backend buckets it and drops it unless the user opted in.
 *  An older Electron shell (no bridge) or backend (no method) just skips the metric. */
export async function reportStartupLatency(
  desktop: Pick<Window['hermesDesktop'], 'claimStartupLatency'> | undefined,
  request: GatewayRequest
): Promise<void> {
  const elapsedMs = (await desktop?.claimStartupLatency?.().catch(() => null)) ?? null

  if (elapsedMs === null) {
    return
  }

  // The main-process claim succeeds once per app launch, so an id minted on success names the
  // launch; the backend latches on it, so a long-lived backend still counts the next launch.
  // Declared, not env-detected: a URL/cloud backend has no HERMES_DESKTOP to tell it who attached.
  await request('shared_metrics.startup_latency', {
    elapsed_ms: elapsedMs,
    launch_id: randomUuid(),
    surface: 'desktop_attach'
  }).catch(() => undefined)
}
