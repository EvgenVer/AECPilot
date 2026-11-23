/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/ru_plugin_update_all.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { PluginUpdateAllTranslations } from './types_plugin_update'

/** Plugins tab: "Update all" and the auto-update switch. */
export const ruPluginUpdateAll: PluginUpdateAllTranslations = {
  updateAll: 'Обновить все',
  updatingAll: 'Обновление…',
  updateAllTip: 'Проверить все установленные плагины и применить обновления, не требующие проверки',
  updateAllDone: (updated: number, review: number, failed: number) =>
    `Обновлено: ${updated}` +
    (review ? `, требуют проверки: ${review}` : '') +
    (failed ? `, с ошибкой: ${failed}` : ''),
  updateAllNone: 'Все плагины в актуальном состоянии',
  updateAllFailed: 'Не удалось обновить плагины',
  autoUpdate: 'Автообновление',
  autoUpdateTip: (hours: number) =>
    `Автоматически применять обновления плагинов при проверке шлюзом (каждые ${hours} ч). Новый код загружается в новых сессиях.`,
  autoUpdateFailed: 'Не удалось изменить автообновление плагинов'
}
