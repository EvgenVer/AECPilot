/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/zh-hant_plugin_update_all.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { PluginUpdateAllTranslations } from './types_plugin_update'

/** Plugins tab: "Update all" and the auto-update switch. */
export const zhHantPluginUpdateAll: PluginUpdateAllTranslations = {
  updateAll: '全部更新',
  updatingAll: '正在更新…',
  updateAllTip: '檢查所有已安裝的外掛，並套用無需審查的更新',
  updateAllDone: (updated: number, review: number, failed: number) =>
    `已更新 ${updated} 個` + (review ? `，${review} 個需要審查` : '') + (failed ? `，${failed} 個失敗` : ''),
  updateAllNone: '所有外掛皆已是最新',
  updateAllFailed: '無法更新外掛',
  autoUpdate: '自動更新',
  autoUpdateTip: (hours: number) =>
    `閘道檢查時（每 ${hours} 小時）自動套用外掛更新。更新後的程式碼會在新工作階段中載入。`,
  autoUpdateFailed: '無法變更外掛自動更新'
}
