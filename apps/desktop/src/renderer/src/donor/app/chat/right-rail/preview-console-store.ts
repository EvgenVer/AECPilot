/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/chat/right-rail/preview-console-store.ts
 * Commit:  fcbd1076a93841fa88855acce810e342a5b78101 (v2026.8.19)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/**
 * Per-tab preview console stores.
 *
 * The console panel lives in the pane and its toggle lives in the pane's
 * browser bar, but the store has to outlive any one render and be addressable
 * by tab id — a tab can be parked and remounted, and its logs come back with
 * it. Created lazily per tab and cached here.
 */

import { createPreviewConsoleState, type PreviewConsoleState } from './preview-console-state'

const consoleStates = new Map<string, PreviewConsoleState>()

/** The console store for a tab, created on first use. */
export function previewConsoleState(tabId: string): PreviewConsoleState {
  const existing = consoleStates.get(tabId)

  if (existing) {
    return existing
  }

  const created = createPreviewConsoleState()

  consoleStates.set(tabId, created)

  return created
}

/** Drop a closed tab's console so a long-lived window doesn't pin every preview
 *  it ever opened. */
export function forgetPreviewConsole(tabId: string) {
  consoleStates.delete(tabId)
}
