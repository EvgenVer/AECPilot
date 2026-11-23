/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/en_plugin_preview_access.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { PluginPreviewAccessTranslations } from './types_plugin_preview_access'

/** Copy for the preview-script consent prompt and the per-plugin grant list (Capabilities ▸ Plugins). */
export const enPluginPreviewAccess: PluginPreviewAccessTranslations = {
  previewScriptPromptTitle: (plugin: string) => `Let ${plugin} run scripts on this page?`,
  previewScriptPromptBody: (plugin: string, origin: string) =>
    `${plugin} wants to run JavaScript in the preview Browser on ${origin}.`,
  previewScriptPromptRisk: 'Scripts can read and change everything on that site, including pages from accounts you are signed in to there.',
  previewScriptPromptRevokeHint: 'Applies to this site only. You can revoke it in Capabilities ▸ Plugins.',
  previewScriptAllow: 'Allow on this site',
  previewScriptDeny: "Don't allow",
  previewScriptAccessLabel: 'Page scripts',
  previewScriptAccessNone: 'Asks before running scripts on a page',
  previewScriptRevoke: (origin: string) => `Revoke access to ${origin}`,
  previewScriptRevoked: (plugin: string, origin: string) => `${plugin} can no longer run scripts on ${origin}.`,
  previewScriptRevokeUnsaved: (plugin: string, origin: string) =>
    `Couldn't save that change, so it lasts only until Hermes restarts. ${plugin} is blocked on ${origin} for now.`
}
