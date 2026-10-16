/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/de_update_channel.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
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
  rollbackAction: (v: string) => `Zurück auf ${v}`
}
