/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/background-delegation.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { computed } from 'nanostores'

import { $subagentsBySession, activeSubagentCount } from './subagents'

export interface BackgroundResume {
  /** Running/queued background children belonging to this runtime session. */
  count: number
}

/** Background work outlives its spawning turn. The owning view gates this
 * signal on its own busy state; global focus and raw stream text are unrelated. */
export function sessionBackgroundResume(sessionId: null | string) {
  const $count = computed($subagentsBySession, bySession =>
    sessionId ? activeSubagentCount(bySession[sessionId] ?? []) : 0
  )

  // Stream frames must not repaint a count-only notice.
  return computed($count, (count): BackgroundResume | null => (count ? { count } : null))
}
