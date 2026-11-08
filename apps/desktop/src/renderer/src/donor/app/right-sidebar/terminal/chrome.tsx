/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/right-sidebar/terminal/chrome.tsx
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { useStore } from '@nanostores/react'

import { TerminalSlot } from './persistent'
import { TerminalRail } from './rail'
import { $terminals } from './terminals'

/** Pane-side terminal chrome: the body slot (which the persistent overlay chases)
 *  plus the always-on tab rail. Lives in the real pane DOM — NOT the z-4 terminal
 *  overlay — so the rail sits above the collapsed sidebars' z-30 hover-reveal
 *  triggers (z-40, like the thread timeline) and suppresses them while hovered.
 *  The rail is always shown when a terminal exists (even one), so every tab keeps
 *  its close affordance; closing the last one hides the pane (reopen re-creates). */
export function TerminalPaneChrome() {
  const terminals = useStore($terminals)

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <TerminalSlot />
      </div>
      {terminals.length > 0 && <TerminalRail />}
    </div>
  )
}
