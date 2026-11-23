/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/es_cron_control.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
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
