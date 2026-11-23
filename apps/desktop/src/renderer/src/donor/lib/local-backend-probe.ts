/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/local-backend-probe.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/**
 * Whether This device would need the installer, resolved without starting it.
 * A missing bridge fails closed: neither a click nor the gateway keeper may
 * reach runBootstrap unseen.
 */
export async function localBootstrapNeeded(): Promise<boolean> {
  const probe = window.hermesDesktop?.probeLocalBackend

  if (!probe) {
    return true
  }

  return (await probe()).bootstrapNeeded === true
}
