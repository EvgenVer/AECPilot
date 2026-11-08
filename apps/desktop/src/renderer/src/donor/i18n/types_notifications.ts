/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/types_notifications.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
// Notification settings types used by every desktop locale.
export interface NotificationSettingsTranslations {
  title: string
  intro: string
  enableAll: string
  enableAllDesc: string
  focusedHint: string
  kinds: Record<
    'approval' | 'backgroundDone' | 'credits' | 'input' | 'plugin' | 'turnDone' | 'turnError',
    { label: string; description: string }
  >
  browserPermission: {
    title: string
    allow: string
    states: Record<'default' | 'denied' | 'granted' | 'insecure' | 'unsupported', string>
  }
  test: string
  testTitle: string
  testBody: string
  testSent: string
  testUnsupported: string
  muteSoundsTitle: string
  muteSoundsDesc: string
  completionSoundTitle: string
  completionSoundDesc: string
  completionSoundPreview: string
}
