/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/de_cron_control.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { CronControlCopy } from './types_cron_control'

export const deCronControl: CronControlCopy = {
  stop: 'Stoppen',
  stopping: 'Wird gestoppt…',
  stopped: 'Lauf abgebrochen',
  finishedFirst: 'Lauf war vor dem Stoppen fertig',
  nothingToStop: 'Kein Lauf aktiv',
  failedStop: 'Lauf konnte nicht gestoppt werden',
  lastCancelled: (reason: string) => (reason ? `Letzter Lauf abgebrochen: ${reason}` : 'Letzter Lauf abgebrochen'),
  catchUpLabel: 'Verpasste Läufe',
  catchUpHint: 'Was mit Läufen geschieht, die verpasst wurden, während Hermes nicht lief.',
  catchUpChoices: {
    default: 'Standard verwenden',
    run: 'Einmal nachholen',
    skip: 'Überspringen'
  }
}
