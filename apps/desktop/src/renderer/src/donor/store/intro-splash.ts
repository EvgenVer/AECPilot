/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/intro-splash.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
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
