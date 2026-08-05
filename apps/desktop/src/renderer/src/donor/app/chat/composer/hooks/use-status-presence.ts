/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/chat/composer/hooks/use-status-presence.ts
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { useSyncExternalStore } from 'react'

import { $composerActionsBySession } from '@/store/composer-actions'
import { $statusItemsBySession } from '@/store/composer-status'
import { $previewStatusBySession } from '@/store/preview-status'

/** Structural view of the three per-session feeds — they hold different item
 *  types, and all this hook needs from each is "does this key have rows". */
interface PresenceFeed {
  get(): Record<string, undefined | unknown[]>
  listen(listener: () => void): () => void
}

const FEEDS: PresenceFeed[] = [$statusItemsBySession, $composerActionsBySession, $previewStatusBySession]

const subscribe = (onChange: () => void) => {
  const offs = FEEDS.map(feed => feed.listen(onChange))

  return () => {
    for (const off of offs) {
      off()
    }
  }
}

/**
 * Whether a session has any status items, micro actions, or previews, as a
 * coarse *edge*: the boolean only flips when the stack appears/disappears.
 * ChatBar uses it to toggle a styling data-attr — subscribing to the whole
 * `$statusItemsBySession` (a `computed` that rebuilds the entire map) /
 * `$previewStatusBySession` maps re-rendered the ~1.4k ChatBar on every
 * per-item mutation (a subagent tick, a 5s background poll) and on churn in
 * OTHER sessions. The boolean snapshot bails out of all of that, re-rendering
 * only on the actual show/hide transition.
 */
export function useSessionStatusPresence(sessionId: string | null): boolean {
  return useSyncExternalStore(subscribe, () => {
    if (!sessionId) {
      return false
    }

    return FEEDS.some(feed => (feed.get()[sessionId]?.length ?? 0) > 0)
  })
}
