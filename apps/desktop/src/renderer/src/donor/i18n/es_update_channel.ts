/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/es_update_channel.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
export const esUpdateChannel = {
  title: 'Canal de actualizaciones',
  description: 'Estable instala solo versiones publicadas. Cada commit sigue la rama main a medida que llegan cambios.',
  stable: 'Versiones estables',
  main: 'Cada commit',
  stableConfirmTitle: '¿Cambiar a versiones estables?',
  stableConfirmBody:
    'Hermes pasará a la última versión publicada, que puede ser más antigua que el código que usas ahora. Los datos escritos por código más nuevo podrían no leerse bien, así que haz una copia antes.',
  stableConfirm: 'Cambiar a estable',
  failed: 'No se pudo cambiar el canal de actualizaciones',
  detailsLabel: 'Canal',
  branch: (b: string) => `Rama: ${b}`,
  change: 'Cambiar',
  latestRelease: (v: string) => `Tienes la última versión estable (${v}).`,
  rollbackTitle: (v: string) => `Volver a la versión estable ${v}`,
  rollbackBody: (v: string) =>
    `Esta compilación es más reciente que la versión estable ${v}. Al instalarla, Hermes vuelve a esa versión.`,
  rollbackAction: (v: string) => `Volver a ${v}`
}
