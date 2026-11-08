/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/en_cron_control.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { CronControlCopy } from './types_cron_control'

export const enCronControl: CronControlCopy = {
  stop: 'Stop',
  stopping: 'Stopping…',
  stopped: 'Run cancelled',
  finishedFirst: 'Run finished before it could stop',
  nothingToStop: 'No run in flight',
  failedStop: 'Could not stop the run',
  lastCancelled: (reason: string) => (reason ? `Last run cancelled: ${reason}` : 'Last run cancelled'),
  catchUpLabel: 'Missed runs',
  catchUpHint: 'What to do with runs missed while Hermes was not running.',
  catchUpChoices: {
    default: 'Use the default',
    run: 'Run once when back',
    skip: 'Skip them'
  }
}
