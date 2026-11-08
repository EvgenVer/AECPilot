/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/ja_plugin_preview_access.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { PluginPreviewAccessTranslations } from './types_plugin_preview_access'

/** Copy for the preview-script consent prompt and the per-plugin grant list (Capabilities ▸ Plugins). */
export const jaPluginPreviewAccess: PluginPreviewAccessTranslations = {
  previewScriptPromptTitle: (plugin: string) => `${plugin} にこのページでスクリプトの実行を許可しますか？`,
  previewScriptPromptBody: (plugin: string, origin: string) =>
    `${plugin} がプレビューブラウザーの ${origin} で JavaScript を実行しようとしています。`,
  previewScriptPromptRisk: 'スクリプトはそのサイトのすべてを読み取り・変更できます。ログイン中のアカウントのページも含まれます。',
  previewScriptPromptRevokeHint: 'このサイトにのみ適用されます。スキルとツール ▸ プラグインでいつでも取り消せます。',
  previewScriptAllow: 'このサイトで許可',
  previewScriptDeny: '許可しない',
  previewScriptAccessLabel: 'ページスクリプト',
  previewScriptAccessNone: 'ページでスクリプトを実行する前に確認します',
  previewScriptRevoke: (origin: string) => `${origin} へのアクセスを取り消す`,
  previewScriptRevoked: (plugin: string, origin: string) => `${plugin} は ${origin} でスクリプトを実行できなくなりました。`,
  previewScriptRevokeUnsaved: (plugin: string, origin: string) =>
    `変更を保存できなかったため、Hermes を再起動するまでの一時的な設定です。現在 ${plugin} は ${origin} でブロックされています。`
}
