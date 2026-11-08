/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/intro-splash.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { atom } from 'nanostores'

import { persistBoolean, storedBoolean } from '@/lib/storage'

import { recordFeatureToggle } from './desktop-metrics'

const KEY = 'hermes.desktop.intro-splash.v1'

/** Whether the wordmark + tagline splash renders on an empty chat. */
export const $introSplash = atom(storedBoolean(KEY, true))

$introSplash.subscribe(on => persistBoolean(KEY, on))

export function setIntroSplash(on: boolean) {
  recordFeatureToggle('intro_splash', $introSplash.get(), on)
  $introSplash.set(on)
}
