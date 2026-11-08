/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/de_model_menu.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
export const deModelMenu = {
  pickDeferred: (model: string) => `${model} gilt ab deiner nächsten Nachricht`,
  search: 'Modelle durchsuchen',
  noModels: 'Keine Modelle gefunden',
  editModels: 'Modelle bearbeiten…',
  followDefault: 'Standard aus den Einstellungen verwenden',
  refreshModels: 'Modelle aktualisieren',
  favorites: 'Favoriten',
  addFavorite: 'Zu Favoriten hinzufügen',
  removeFavorite: 'Aus Favoriten entfernen',
  favoriteShortcut: '⇧ Klick',
  fast: 'Schnell',
  free: 'kostenlos',
  cacheRead: 'Cache-Lesung',
  priceTitle: (input: string, output: string, cache: string) =>
    `Eingabe ${input}/Mtok · Ausgabe ${output}/Mtok` + (cache ? ` · Cache-Lesung ${cache}/Mtok` : ''),
  localSetup: {
    title: 'Lokal ausführen · kostenlos, privat',
    text: (model: string, size: string) => `${model} passt auf diesen Rechner · ${size} Download`,
    action: 'Einrichten'
  },
  limited: 'Limitiert',
  limitedUntil: (time: string) => `Limitiert bis ${time}`,
  limitedTip: (provider: string, time: null | string) =>
    time
      ? `${provider} hat sein Nutzungslimit erreicht. Es wird um ${time} zurückgesetzt; du kannst schon jetzt ein Modell für danach wählen.`
      : `${provider} hat sein Nutzungslimit erreicht. Du kannst schon jetzt ein Modell für die Zeit nach dem Zurücksetzen wählen.`,
  modelResets: (time: string) => `wieder ab ${time}`,
  modelLimitedTip: (time: string) =>
    `Dieses Modell hat sein eigenes Limit erreicht und ist ab ${time} wieder verfügbar. Andere Modelle hier funktionieren weiterhin.`,
  usageLeft: (percent: number, time: null | string) =>
    time ? `${percent} % übrig · zurückgesetzt ${time}` : `${percent} % übrig`,
  poolAccounts: (count: number) => `${count} ${count === 1 ? 'Konto' : 'Konten'}`,
  poolLimited: (limited: number, total: number) => `${limited}/${total} Konten limitiert`,
  poolAccount: (number: number) => `Konto ${number}`,
  poolUnknown: 'Nutzung nicht verfügbar',
  poolUnavailable: 'Erneut anmelden',
  usageTip: (provider: string) => `${provider} ist fast am Nutzungslimit.`,
  usageWindow: (label: string, percent: number, time: null | string) =>
    time ? `${label}: ${percent} % übrig, zurückgesetzt ${time}` : `${label}: ${percent} % übrig`
}
