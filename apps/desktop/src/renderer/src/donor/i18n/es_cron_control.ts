/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/es_cron_control.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { CronControlCopy } from './types_cron_control'

export const esCronControl: CronControlCopy = {
  stop: 'Detener',
  stopping: 'Deteniendo…',
  stopped: 'Ejecución cancelada',
  finishedFirst: 'La ejecución terminó antes de detenerse',
  nothingToStop: 'No hay ninguna ejecución en curso',
  failedStop: 'No se pudo detener la ejecución',
  lastCancelled: (reason: string) => (reason ? `Última ejecución cancelada: ${reason}` : 'Última ejecución cancelada'),
  catchUpLabel: 'Ejecuciones perdidas',
  catchUpHint: 'Qué hacer con las ejecuciones perdidas mientras Hermes no estaba en marcha.',
  catchUpChoices: {
    default: 'Usar el valor predeterminado',
    run: 'Ejecutar una vez al volver',
    skip: 'Omitirlas'
  }
}
