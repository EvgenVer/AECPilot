/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/fr_cron_control.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { CronControlCopy } from './types_cron_control'

export const frCronControl: CronControlCopy = {
  stop: 'Arrêter',
  stopping: 'Arrêt…',
  stopped: 'Exécution annulée',
  finishedFirst: 'L’exécution s’est terminée avant l’arrêt',
  nothingToStop: 'Aucune exécution en cours',
  failedStop: 'Impossible d’arrêter l’exécution',
  lastCancelled: (reason: string) => (reason ? `Dernière exécution annulée: ${reason}` : 'Dernière exécution annulée'),
  catchUpLabel: 'Exécutions manquées',
  catchUpHint: 'Que faire des exécutions manquées pendant que Hermes ne tournait pas.',
  catchUpChoices: {
    default: 'Utiliser la valeur par défaut',
    run: 'Exécuter une fois au retour',
    skip: 'Les ignorer'
  }
}
