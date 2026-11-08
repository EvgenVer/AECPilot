/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/fr_update_channel.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
export const frUpdateChannel = {
  title: 'Canal de mise à jour',
  description:
    'Stable installe uniquement les versions publiées. Chaque commit suit la branche main au fil des changements.',
  stable: 'Versions stables',
  main: 'Chaque commit',
  stableConfirmTitle: 'Passer aux versions stables ?',
  stableConfirmBody:
    'Hermes passera à la dernière version publiée, qui peut être plus ancienne que le code que vous utilisez. Les données écrites par un code plus récent risquent de mal se lire : sauvegardez-les d’abord.',
  stableConfirm: 'Passer en stable',
  failed: 'Impossible de changer le canal de mise à jour',
  detailsLabel: 'Canal',
  branch: (b: string) => `Branche : ${b}`,
  change: 'Modifier',
  latestRelease: (v: string) => `Vous utilisez la dernière version stable (${v}).`,
  rollbackTitle: (v: string) => `Revenir à la version stable ${v}`,
  rollbackBody: (v: string) =>
    `Cette build est plus récente que la version stable ${v}. L’installer ramène Hermes à cette version.`,
  heldBody: (v: string) =>
    `Cette version est plus récente que la version stable ${v}, et vos sessions utilisent déjà son environnement de passerelle, que ${v} ne peut pas ouvrir. Hermes reste sur cette version jusqu’à la prochaine version stable.`,
  rollbackAction: (v: string) => `Revenir à ${v}`,
  allChanges: 'Voir toutes les modifications'
}
