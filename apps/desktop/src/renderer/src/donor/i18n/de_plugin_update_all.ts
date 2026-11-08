/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/de_plugin_update_all.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { PluginUpdateAllTranslations } from './types_plugin_update'

/** Plugins tab: "Update all" and the auto-update switch. */
export const dePluginUpdateAll: PluginUpdateAllTranslations = {
  updateAll: 'Alle aktualisieren',
  updatingAll: 'Wird aktualisiert…',
  updateAllTip: 'Alle installierten Plugins prüfen und Updates anwenden, die keine Prüfung brauchen',
  updateAllDone: (updated: number, review: number, failed: number) =>
    `${updated} aktualisiert` + (review ? `, ${review} zu prüfen` : '') + (failed ? `, ${failed} fehlgeschlagen` : ''),
  updateAllNone: 'Alle Plugins sind aktuell',
  updateAllFailed: 'Plugins konnten nicht aktualisiert werden',
  autoUpdate: 'Automatisch aktualisieren',
  autoUpdateTip: (hours: number) =>
    `Plugin-Updates automatisch anwenden, wenn das Gateway prüft (alle ${hours} h). Neuer Code wird in neuen Sitzungen geladen.`,
  autoUpdateFailed: 'Automatische Plugin-Updates konnten nicht geändert werden'
}
