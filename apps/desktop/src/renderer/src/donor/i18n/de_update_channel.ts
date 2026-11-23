/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/de_update_channel.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
export const deUpdateChannel = {
  title: 'Update-Kanal',
  description:
    'Stabil installiert nur veröffentlichte Releases. Jeder Commit folgt dem main-Branch, sobald Änderungen eintreffen.',
  stable: 'Stabile Releases',
  main: 'Jeder Commit',
  stableConfirmTitle: 'Zu stabilen Releases wechseln?',
  stableConfirmBody:
    'Hermes wechselt zum neuesten veröffentlichten Release, das älter sein kann als der Code, den du gerade nutzt. Von neuerem Code geschriebene Daten werden eventuell nicht korrekt gelesen – sichere sie vorher.',
  stableConfirm: 'Zu Stabil wechseln',
  failed: 'Update-Kanal konnte nicht geändert werden',
  detailsLabel: 'Kanal',
  branch: (b: string) => `Branch: ${b}`,
  change: 'Ändern',
  latestRelease: (v: string) => `Du nutzt das neueste stabile Release (${v}).`,
  rollbackTitle: (v: string) => `Zurück zum stabilen Release ${v}`,
  rollbackBody: (v: string) =>
    `Dieser Build ist neuer als das stabile Release ${v}. Die Installation setzt Hermes auf dieses Release zurück.`,
  heldBody: (v: string) =>
    `Dieser Build ist neuer als das stabile Release ${v}, und deine Sitzungen nutzen bereits seine Gateway-Laufzeit, die ${v} nicht öffnen kann. Hermes bleibt bei diesem Build, bis ein neueres stabiles Release erscheint.`,
  rollbackAction: (v: string) => `Zurück auf ${v}`,
  allChanges: 'Alle Änderungen ansehen'
}
