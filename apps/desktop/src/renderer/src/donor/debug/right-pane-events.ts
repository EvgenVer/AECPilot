/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/debug/right-pane-events.ts
 * Commit:  e624e9fde561e1add9388384012b295fde669ade (v2026.8.18)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
export type RightPanePerfEvent =
  'project-tree-render' | 'project-tree-row-render' | 'terminal-fit-active' | 'terminal-fit-hidden' | 'terminal-measure'

export interface RightPanePerfSnapshot {
  counts: Record<RightPanePerfEvent, number>
  details: Partial<Record<RightPanePerfEvent, Record<string, number>>>
  rows: Record<string, number>
}

declare global {
  interface Window {
    __RIGHT_PANE_PERF__?: {
      clear: () => void
      mark: (event: RightPanePerfEvent, detail?: string) => void
      snapshot: () => RightPanePerfSnapshot
      start: () => void
      stop: () => void
    }
  }
}

/** Tiny production-safe callsite; the recorder exists only in dev/perf builds. */
export function markRightPanePerf(event: RightPanePerfEvent, detail?: string): void {
  window.__RIGHT_PANE_PERF__?.mark(event, detail)
}
