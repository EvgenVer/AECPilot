/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/de_plugin_update.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { PluginUpdateTranslations } from './types_plugin_update'

/** Copy for updating an installed plugin (Plugins tab): catalog re-pin consent and the security-scan override. */
export const dePluginUpdate: PluginUpdateTranslations = {
  folderAccess: {
    title: 'Ordnerzugriff',
    hint: (name: string) => `${name} darf Dateien in diesen Ordnern lesen und ändern. Ein Widerruf gilt sofort.`,
    revoke: 'Widerrufen',
    revokeLabel: (path: string) => `Zugriff auf ${path} widerrufen`,
    revoked: (name: string, path: string) => `${name} kann ${path} nicht mehr verwenden.`,
    revokeFailed: (name: string) => `Ordnerzugriff für ${name} konnte nicht widerrufen werden`,
    pickerTitle: (name: string) => `Ordner für ${name} auswählen`,
    pickerButton: 'Zugriff erlauben',
    refusedProtected: (name: string) =>
      `${name} kann diesen Ordner nicht verwenden: Er enthält Hermes-Einstellungen, Schlüssel oder Plugin-Daten. Wählen Sie einen Ordner, der sie nicht enthält.`,
    loadFailed: (name: string) => `Die für ${name} freigegebenen Ordner konnten nicht geladen werden.`
  },
  updateToPin: sha => `Auf ${sha} aktualisieren`,
  updateFailed: name => `${name} konnte nicht aktualisiert werden`,
  updated: name =>
    `${name} wurde auf den aktuellen Katalog-Pin aktualisiert. Starten Sie das Gateway neu, damit es wirksam wird.`,
  updateConsentTitle: (name: string) => `${name} fordert mehr an`,
  updateConsentBody: (name: string, sha: string) =>
    `Der neue Katalog-Pin von ${name} (${sha}) fügt Oberflächen hinzu, die die installierte Version nicht hat. Wenden Sie ihn nur an, wenn Sie ihnen vertrauen:`,
  updateConsentConfirm: 'Update anwenden',
  updateScanTitle: name => `Sicherheitsprüfung hat ${name} markiert`,
  updateScanBody: (name, count) =>
    `Das Update von ${name} erhielt das Urteil „Vorsicht“ (${count} ${count === 1 ? 'Fund' : 'Funde'}). Jedes Update wird geprüft. Wenden Sie es nur an, wenn Sie der Quelle vertrauen:`,
  updateScanMore: count => `+ ${count} weitere`,
  updateScanConfirm: 'Trotzdem aktualisieren',
  updateScanBlocked: name =>
    `Die Sicherheitsprüfung hat das Update von ${name} blockiert (Urteil „gefährlich“). Das lässt sich nicht übergehen.`,
  updatedGit: name => `${name} wurde auf den neuesten Commit aktualisiert.`,
}
