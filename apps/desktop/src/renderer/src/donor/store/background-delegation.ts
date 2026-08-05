/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/background-delegation.ts
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { computed } from 'nanostores'

import { $activeSessionId, $busy } from './session'
import { $subagentsBySession, type SubagentProgress } from './subagents'

export interface BackgroundResume {
  /** Latest live activity from the primary child (its newest stream line), or
   *  null when nothing readable has arrived yet — the UI then falls back to the
   *  generic "will resume" copy. */
  activity: string | null
  /** Running/queued background children for the active session. */
  count: number
}

const RUNNING = (s: SubagentProgress) => s.status === 'running' || s.status === 'queued'

/**
 * "Parked" background-delegation signal for the active session.
 *
 * A top-level `delegate_task` always runs in the background: the parent turn
 * ends (`$busy` -> false) while the subagent keeps running, and its result
 * re-enters the conversation as a fresh turn when it finishes. During that
 * window the app is genuinely idle but work is still happening elsewhere, so we
 * surface a calm, shimmering status line (its latest activity, or a generic
 * "will resume" fallback) instead of a spinner that reads as "stuck."
 *
 * Null while `$busy`: an active turn already owns the main loader, and subagents
 * spawned inside a running turn (synchronous orchestrator children) are part of
 * that turn, not parked background work the user is waiting on.
 */
export const $backgroundResume = computed(
  [$subagentsBySession, $activeSessionId, $busy],
  (bySession, sid, busy): BackgroundResume | null => {
    if (busy || !sid) {
      return null
    }

    const running = (bySession[sid] ?? []).filter(RUNNING)

    if (running.length === 0) {
      return null
    }

    const activity = (running[0]!.stream.at(-1)?.text ?? '').trim() || null

    return { activity, count: running.length }
  }
)
