/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/en_deep_links.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { GatewayGroupOpenCopy, SkillDeepLinkCopy } from './types_deep_links'

export const enSkillDeepLink: SkillDeepLinkCopy = {
  installTitle: (name: string) => `Install “${name}”?`,
  installDescription: 'This skill will be available in new sessions. Only install sources you trust.',
  installTo: 'Install to',
  thisComputer: 'This computer',
  installing: 'Installing…',
  installComplete: (name: string) => `“${name}” installed`,
  destinationChanged: 'The destination changed. Close this dialog and open the install link again.',
  installed: 'Installed',
  source: 'Source'
}

export const enGatewayGroupOpen: GatewayGroupOpenCopy = {
  opening: 'Opening gateway group…',
  lookupFailed: 'Could not look up this group on the gateway. Try again.',
  missing: 'This gateway group no longer exists.'
}
