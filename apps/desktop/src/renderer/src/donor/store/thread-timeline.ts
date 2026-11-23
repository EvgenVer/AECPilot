/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/thread-timeline.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { atom } from 'nanostores'

import { persistStore } from '@/lib/persist-store'
import { persistBoolean, storedBoolean } from '@/lib/storage'

import { recordFeatureToggle } from './desktop-metrics'

const HIDE_THREAD_TIMELINE_STORAGE_KEY = 'hermes.desktop.hideThreadTimeline'

/** Desktop-local appearance preference, shared by all threads in this window. */
export const $hideThreadTimeline = atom(storedBoolean(HIDE_THREAD_TIMELINE_STORAGE_KEY, false))

persistStore(
  $hideThreadTimeline,
  (value, options) => persistBoolean(HIDE_THREAD_TIMELINE_STORAGE_KEY, value, options),
  false
)

export function setHideThreadTimeline(value: boolean) {
  recordFeatureToggle('thread_timeline', !$hideThreadTimeline.get(), !value)
  $hideThreadTimeline.set(value)
}
