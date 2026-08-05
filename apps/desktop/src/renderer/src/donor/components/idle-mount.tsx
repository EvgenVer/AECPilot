/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/idle-mount.tsx
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { type ReactNode, useEffect, useState } from 'react'

/**
 * Mounts `children` only once the browser goes idle (or `timeout` ms elapse),
 * then keeps them mounted for good. Lifts non-critical, boot-hidden surfaces
 * (display:none panes: files/preview/review/logs) off the first-paint critical
 * path with ZERO visible change — idle fires within a frame of first paint, so
 * a hidden pane is warm long before the user can reveal it, preserving the
 * "toggle back is instant" contract while shrinking cold-start app-mount.
 *
 * Degrades to eager mount where requestIdleCallback is absent (jsdom/tests,
 * older webviews), so there's no behavioral fork to reason about there.
 */
export function IdleMount({ children, timeout = 2000 }: { children: ReactNode; timeout?: number }) {
  const [ready, setReady] = useState(typeof requestIdleCallback !== 'function')

  useEffect(() => {
    if (ready) {
      return undefined
    }

    const id = requestIdleCallback(() => setReady(true), { timeout })

    return () => cancelIdleCallback(id)
  }, [ready, timeout])

  return ready ? <>{children}</> : null
}
