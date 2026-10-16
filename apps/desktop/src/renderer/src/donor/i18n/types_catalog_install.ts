/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/types_catalog_install.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { InstallPhase } from '@hermes/shared'

/** Copy for the desktop catalog-install card (`manage_catalog`) and its Advanced dialog. */
export interface CatalogInstallTranslations {
  preparing: string
  install: string
  advanced: string
  skip: string
  installing: string
  installed: string
  notInstalled: string
  failed: string
  showNames: string
  hideNames: string
  skill: (name: string) => string
  kind: { plugin: string; skill: string }
  tier: { official: string; community: string }
  targetProfile: (profile: string) => string
  sendFailed: string
  commitLabel: string
  subdirLabel: string
  securityHeading: string
  scan: { passed: string; warnings: string; failed: string }
  requirementsLabel: string
  requiresHermes: (range: string) => string
  envVar: (name: string) => string
  credentialsHeading: string
  phase: Record<InstallPhase, string>
  serverNotConnected: (server: string, reason: string) => string
  notEnabled: string
  missingEnv: (names: string) => string
  alreadyInstalled: string
}
