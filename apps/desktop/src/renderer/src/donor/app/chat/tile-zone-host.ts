/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/chat/tile-zone-host.ts
 * Commit:  939e45c91d751fadd94dcd1b873ac3cb44846213 (v2026.9.11)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/**
 * Zone eligibility for SESSION drops — the resolve-side half of the drop
 * contract shared with the zone overlay (hostsSessionDropTarget in
 * pane-shell/tree/store decides PAINT; this decides COMMIT). Living apart
 * from either resolver keeps them from importing each other (and dragging
 * their unrelated module graphs together), while still answering the same
 * question with the same pane predicates.
 */

import { findGroup } from '@/components/pane-shell/tree/model'
import { $layoutTree, isMainStripPane, isSessionStripPane } from '@/components/pane-shell/tree/store'

/** A session may land in any zone hosting a MAIN tile — another chat stack, a
 *  Browser tile, a page — never the sidebar/terminal zones. Returns the pane a
 *  stack anchors to, plus whether the zone hosts a CHAT surface (only those
 *  offer the link-to-composer center; a preview zone's center stacks). */
export function tileZoneHost(groupId: string): { chat: boolean; pane: string } | null {
  const tree = $layoutTree.get()
  const panes = tree ? (findGroup(tree, groupId)?.panes ?? []) : []
  const pane = panes.find(isSessionStripPane) ?? panes.find(isMainStripPane)

  return pane ? { chat: panes.some(isSessionStripPane), pane } : null
}
