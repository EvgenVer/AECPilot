/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/types_plugin_preview_access.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/** Copy for the `ctx.preview.executeJavaScript` consent: the app-owned prompt a plugin's first
 *  call on a page origin raises, and the per-plugin grant list in Capabilities ▸ Plugins. */
export interface PluginPreviewAccessTranslations {
  previewScriptPromptTitle: (plugin: string) => string
  previewScriptPromptBody: (plugin: string, origin: string) => string
  previewScriptPromptRisk: string
  previewScriptPromptRevokeHint: string
  previewScriptAllow: string
  previewScriptDeny: string
  previewScriptAccessLabel: string
  previewScriptAccessNone: string
  previewScriptRevoke: (origin: string) => string
  previewScriptRevoked: (plugin: string, origin: string) => string
  previewScriptRevokeUnsaved: (plugin: string, origin: string) => string
}
