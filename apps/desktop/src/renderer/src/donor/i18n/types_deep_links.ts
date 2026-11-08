/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/types_deep_links.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
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
