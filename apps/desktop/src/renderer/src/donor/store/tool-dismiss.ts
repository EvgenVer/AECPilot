/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/tool-dismiss.ts
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { atom, computed, type ReadableAtom } from 'nanostores'

type DismissedToolRows = Record<string, true>

// Tool rows the user has locally hidden via a row's dismiss control. This is a
// *view-only* hide: the underlying tool call still lives in the stored chat
// history, but once a turn has settled the user can clear a completed/failed
// row out of the way so it stops sitting at the tail of the conversation.
//
// Kept in module memory (not localStorage, unlike $toolDisclosureStates) on
// purpose: the thread is virtualized, so a dismissed row's component unmounts
// and remounts as it scrolls — component-local state would forget the dismissal
// and the row would pop back. Storing it here survives those remounts for the
// life of the app session, while a reload restores every row in place rather
// than permanently rewriting history from a stray click.
export const $dismissedToolRows = atom<DismissedToolRows>({})

const dismissedCache = new Map<string, ReadableAtom<boolean>>()

export function $toolRowDismissed(id: string): ReadableAtom<boolean> {
  let cached = dismissedCache.get(id)

  if (!cached) {
    cached = computed($dismissedToolRows, rows => Boolean(rows[id]))
    dismissedCache.set(id, cached)
  }

  return cached
}

export function dismissToolRow(id: string) {
  if (!id || $dismissedToolRows.get()[id]) {
    return
  }

  $dismissedToolRows.set({ ...$dismissedToolRows.get(), [id]: true })
}

export function clearDismissedToolRows() {
  if (Object.keys($dismissedToolRows.get()).length === 0) {
    return
  }

  $dismissedToolRows.set({})
}
