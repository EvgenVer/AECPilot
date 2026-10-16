/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/vibe-hearts-enabled.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/**
 * Floating vibe hearts (affection burst on ily / <3 / good bot / thanks).
 *
 * On by default: that is today's always-on behavior. Settings → Appearance owns
 * the lever so hearts stay presentation-scoped (desktop AGENTS.md: state lives
 * with its authority). Distinct from Message Reactions, which are iMessage-style
 * tapbacks on message rows.
 */

import { atom } from 'nanostores'

import { persistString, storedString } from '@/lib/storage'

import { recordFeatureToggle } from './desktop-metrics'

const KEY = 'hermes.desktop.vibeHearts.v1'

// Absent key and anything other than "off" keep hearts on, matching the
// pre-toggle always-on default for existing installs.
export const $vibeHeartsEnabled = atom<boolean>(typeof window === 'undefined' ? true : storedString(KEY) !== 'off')

export function setVibeHeartsEnabled(enabled: boolean): void {
  recordFeatureToggle('vibe_hearts', $vibeHeartsEnabled.get(), enabled)
  $vibeHeartsEnabled.set(enabled)
}

if (typeof window !== 'undefined') {
  $vibeHeartsEnabled.listen(enabled => {
    persistString(KEY, enabled ? 'on' : 'off')
  })
}
