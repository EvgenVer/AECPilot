/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/plugins/hermes-bots/group-engine.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/** The `engine` field to spread into a room record rebuilt from `sources`
 *  (storage hydration, the ui_meta projection and its merges). The mark is set
 *  once, when a room is created or edited across machines, and never cleared,
 *  so any source carrying it keeps it. */
export function stickyGroupEngine(...sources: Array<{ engine?: unknown } | null | undefined>): { engine?: 'desktop' } {
  return sources.some(source => source?.engine === 'desktop') ? { engine: 'desktop' } : {}
}
