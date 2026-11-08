/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/de_error_layers.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { Translations } from './types'

type ThreadCopy = Translations['assistant']['thread']

// The error card's layer fallbacks (lib/error-surface-copy.ts): used when a failure code has no own entry.
export const deErrorLayers: Pick<ThreadCopy, 'errorLayerBodies' | 'errorLayers'> = {
  errorLayers: {
    auth: 'Problem bei der Anmeldung',
    billing: 'Kein Guthaben mehr',
    disk: 'Festplatte voll',
    endpoint: 'Modellserver nicht erreichbar',
    gateway: 'Nachricht konnte nicht gesendet werden',
    generic: 'Antwort konnte nicht fertiggestellt werden',
    provider: 'KI-Dienst meldet einen Fehler',
    runtime: 'Problem in Hermes aufgetreten',
    streaming: 'Die Antwort wurde abgebrochen'
  },
  errorLayerBodies: {
    auth: 'Der KI-Dienst hat Ihre Anmeldung abgelehnt. Prüfen Sie die Zugangsdaten für diesen Anbieter und senden Sie Ihre Nachricht erneut.',
    billing:
      'Ihr Konto hat bei diesem Anbieter kein Guthaben mehr. Laden Sie Guthaben auf oder wechseln Sie den Anbieter und senden Sie erneut.',
    disk: 'Ihre Festplatte ist voll, daher konnte Hermes dieses Gespräch nicht speichern. Geben Sie Speicherplatz frei und versuchen Sie es erneut.',
    endpoint:
      'Hermes erreicht Ihren eigenen Modellserver nicht. Prüfen Sie, ob er läuft, und senden Sie Ihre Nachricht erneut.',
    gateway:
      'Beim Starten dieser Antwort ist in Hermes ein internes Problem aufgetreten. Senden Sie Ihre Nachricht erneut; wenn es bestehen bleibt, senden Sie Diagnosedaten.',
    generic:
      'Beim Antworten ist etwas schiefgelaufen. Versuchen Sie es erneut oder kopieren Sie die Details, wenn es bestehen bleibt.',
    provider:
      'Der KI-Dienst konnte diese Anfrage nicht abschließen. Versuchen Sie es gleich erneut oder wechseln Sie den Anbieter.',
    runtime:
      'Beim Starten dieser Antwort ist in Hermes ein internes Problem aufgetreten. Senden Sie Ihre Nachricht erneut; wenn es bestehen bleibt, senden Sie Diagnosedaten.',
    streaming:
      'Die Verbindung ist abgebrochen, bevor die Antwort fertig war. Versuchen Sie es erneut, um sie noch einmal zu senden.'
  }
}
