/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/ar_plugin_update_all.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { PluginUpdateAllTranslations } from './types_plugin_update'

/** Plugins tab: "Update all" and the auto-update switch. */
export const arPluginUpdateAll: PluginUpdateAllTranslations = {
  updateAll: 'تحديث الكل',
  updatingAll: 'جارٍ التحديث…',
  updateAllTip: 'فحص كل الإضافات المثبتة وتطبيق التحديثات التي لا تحتاج إلى مراجعة',
  updateAllDone: (updated: number, review: number, failed: number) =>
    `تم تحديث ${updated}` + (review ? `، ${review} تحتاج إلى مراجعة` : '') + (failed ? `، فشل ${failed}` : ''),
  updateAllNone: 'كل الإضافات محدّثة',
  updateAllFailed: 'تعذّر تحديث الإضافات',
  autoUpdate: 'التحديث التلقائي',
  autoUpdateTip: (hours: number) =>
    `تطبيق تحديثات الإضافات تلقائيًا عندما تفحصها البوابة (كل ${hours} ساعة). تُحمَّل الشيفرة المحدّثة في الجلسات الجديدة.`,
  autoUpdateFailed: 'تعذّر تغيير التحديث التلقائي للإضافات'
}
