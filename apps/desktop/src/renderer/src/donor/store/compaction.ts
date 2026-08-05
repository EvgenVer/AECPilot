/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/compaction.ts
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { atom, computed } from 'nanostores'

// Per-session flag while auto-compaction runs mid-turn. Without it the
// transcript looks like it reset; per-session so a background chat can't
// clobber the foreground view.
const keyFor = (sessionId: string | null | undefined): string => sessionId ?? ''

export const $compactingSessions = atom<Record<string, true>>({})

/** Is `sessionId` compacting? Per-session because a transcript may be a tile,
 *  and a tile must never wear the primary chat's compaction state. */
export function sessionCompacting(sessionId: null | string) {
  return computed($compactingSessions, sessions => keyFor(sessionId) in sessions)
}

export function setSessionCompacting(sessionId: string | null | undefined, active: boolean): void {
  const key = keyFor(sessionId)
  const sessions = $compactingSessions.get()

  if (active) {
    if (key in sessions) {
      return
    }

    $compactingSessions.set({ ...sessions, [key]: true })

    return
  }

  if (!(key in sessions)) {
    return
  }

  const next = { ...sessions }
  delete next[key]
  $compactingSessions.set(next)
}
