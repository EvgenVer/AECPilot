/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/thread-timeline.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { atom } from 'nanostores'

import { persistBoolean, storedBoolean } from '@/lib/storage'

import { recordFeatureToggle } from './desktop-metrics'

const HIDE_THREAD_TIMELINE_STORAGE_KEY = 'hermes.desktop.hideThreadTimeline'

/** Desktop-local appearance preference, shared by all threads in this window. */
export const $hideThreadTimeline = atom(storedBoolean(HIDE_THREAD_TIMELINE_STORAGE_KEY, false))

$hideThreadTimeline.subscribe(value => persistBoolean(HIDE_THREAD_TIMELINE_STORAGE_KEY, value))

export function setHideThreadTimeline(value: boolean) {
  recordFeatureToggle('thread_timeline', !$hideThreadTimeline.get(), !value)
  $hideThreadTimeline.set(value)
}
