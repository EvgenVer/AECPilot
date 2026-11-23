/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/types_deep_links.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/** Opening a skill install link. */
export interface SkillDeepLinkCopy {
  installTitle: (name: string) => string
  installDescription: string
  installTo: string
  thisComputer: string
  installing: string
  installComplete: (name: string) => string
  destinationChanged: string
  installed: string
  source: string
}

/** Bots: reopening a gateway group by name or restored tab key (#140805). */
export interface GatewayGroupOpenCopy {
  opening: string
  lookupFailed: string
  missing: string
}
