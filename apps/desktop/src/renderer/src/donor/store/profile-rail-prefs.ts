/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/profile-rail-prefs.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { Codecs, persistentAtom } from '@/lib/persisted'
import { modeBound } from '@/store/interface-mode'

// The colored profile strip at the sidebar foot. For someone who runs profiles
// as bots it duplicates the footer's gateway selector, so it can be switched
// off; while it is off the statusbar grows a profile dropdown beside the
// gateway switcher so switching profiles never loses its door. On by default.
// Simple mode rests it hidden (unless it is the only door left) without
// touching this preference.
const $profileRailVisiblePref = persistentAtom('hermes.desktop.profileRailVisible', true, Codecs.bool)

export const $profileRailVisible = modeBound('profileRailVisible', $profileRailVisiblePref, value =>
  $profileRailVisiblePref.set(value)
)

export function toggleProfileRailVisible() {
  $profileRailVisible.set(!$profileRailVisible.get())
}
