/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/es_plugin_update_all.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { PluginUpdateAllTranslations } from './types_plugin_update'

/** Plugins tab: "Update all" and the auto-update switch. */
export const esPluginUpdateAll: PluginUpdateAllTranslations = {
  updateAll: 'Actualizar todo',
  updatingAll: 'Actualizando…',
  updateAllTip: 'Comprobar todos los plugins instalados y aplicar las actualizaciones que no requieren revisión',
  updateAllDone: (updated: number, review: number, failed: number) =>
    `${updated} actualizados` + (review ? `, ${review} por revisar` : '') + (failed ? `, ${failed} fallidos` : ''),
  updateAllNone: 'Todos los plugins están al día',
  updateAllFailed: 'No se pudieron actualizar los plugins',
  autoUpdate: 'Actualización automática',
  autoUpdateTip: (hours: number) =>
    `Aplicar las actualizaciones de plugins automáticamente cuando el gateway compruebe (cada ${hours} h). El código nuevo se carga en sesiones nuevas.`,
  autoUpdateFailed: 'No se pudo cambiar la actualización automática de plugins'
}
