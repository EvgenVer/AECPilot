/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/types_uninstall_section.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
// Settings > About > Uninstall; `Translations.settings.uninstallSection`.
export interface UninstallSectionTranslations {
  dangerZone: string
  checkingInstalled: string
  uninstallHermes: string
  managedBody: string
  dataKept: (path: string) => string
  openAppsSettings: string
  chooseHowMuch: string
  confirmUninstall: string
  confirmBody: (what: string) => string
  appLabel: string
  couldNotStart: string
  uninstalling: string
  yesUninstall: string
  options: {
    gui: { title: string; description: string; consequence: string }
    lite: { title: string; description: string; consequence: string }
    full: { title: string; description: string; consequence: string }
  }
}
