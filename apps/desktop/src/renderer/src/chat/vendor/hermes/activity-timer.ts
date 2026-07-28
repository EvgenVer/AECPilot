import { useEffect, useState } from 'react'

/**
 * Live "how long has this been running" counter for a tool card — vendored
 * from Hermes (task 1.6.7).
 *
 * Source: `apps/desktop/src/components/chat/activity-timer.ts`,
 * NousResearch/hermes-agent (MIT). Kept nearly verbatim, because the one
 * non-obvious thing in it is worth keeping: the start times live in a
 * MODULE-level registry keyed by the caller's `timerKey`, so a card that
 * unmounts and remounts (scrolled out of the feed and back, re-rendered after
 * a sibling arrives) resumes its own count instead of restarting at zero.
 *
 * Changed from theirs: the format is ours — Russian «с» and a minute form —
 * and `formatElapsed` is exported separately so it can be unit-tested without
 * a DOM.
 */

const startedAtByKey = new Map<string, number>()

function startedAt(key?: string): number {
  if (!key) return Date.now()
  const existing = startedAtByKey.get(key)
  if (existing !== undefined) return existing
  const now = Date.now()
  startedAtByKey.set(key, now)
  return now
}

/** `7` -> «7 с», `65` -> «1:05». Same two shapes their card uses. */
export function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds} с`
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/** Seconds since this `timerKey` was first seen, ticking while `active`.
 *
 * Deviates from theirs in one way: they keep the start time in a ref and
 * re-read it during render when the key changes, which our lint rules forbid
 * (`react-hooks/refs` — accessing a ref while rendering). The start time is
 * resolved inside the effect instead; the only difference is that a changed
 * key shows its previous value for one frame, invisible at one-second
 * granularity. The part worth keeping — the module-level registry — is intact.
 */
export function useElapsedSeconds(active = true, timerKey?: string): number {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!active) return
    const start = startedAt(timerKey)
    const tick = (): void => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)))
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [active, timerKey])

  return elapsed
}

/** Drops every remembered start time — for tests, which must not inherit a
 * timer from a previous case. */
export function resetElapsedTimers(): void {
  startedAtByKey.clear()
}
