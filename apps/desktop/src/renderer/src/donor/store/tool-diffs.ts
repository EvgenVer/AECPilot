/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/tool-diffs.ts
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { atom, computed, type ReadableAtom } from 'nanostores'

const $toolDiffs = atom<Record<string, string>>({})

// Per-tool derived atoms, cached by toolCallId. A `ToolEntry` subscribes only
// to its own id's diff, so recording a diff for one tool re-renders that one
// row -- not every mounted tool row. computed() only notifies when the derived
// string actually changes, so unrelated writes to the map are inert here.
const inlineDiffCache = new Map<string, ReadableAtom<string>>()

export function recordToolDiff(toolCallId: string, diff: string) {
  if (!toolCallId || !diff) {
    return
  }

  const current = $toolDiffs.get()

  if (current[toolCallId] === diff) {
    return
  }

  $toolDiffs.set({ ...current, [toolCallId]: diff })
}

export function getToolDiff(toolCallId: string): string {
  return toolCallId ? $toolDiffs.get()[toolCallId] || '' : ''
}

export function $toolInlineDiff(toolCallId: string): ReadableAtom<string> {
  let cached = inlineDiffCache.get(toolCallId)

  if (!cached) {
    cached = computed($toolDiffs, diffs => (toolCallId ? diffs[toolCallId] || '' : ''))
    inlineDiffCache.set(toolCallId, cached)
  }

  return cached
}
