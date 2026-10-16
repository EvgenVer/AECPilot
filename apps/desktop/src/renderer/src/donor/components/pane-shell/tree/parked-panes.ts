/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/pane-shell/tree/parked-panes.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/**
 * PARKED PANES — registered contributions that are deliberately OUT of the
 * layout tree. A parked pane keeps its contribution, so a keep-alive body (a
 * live Browser guest) stays mounted — hidden and inert in its keep-alive host
 * — while adoption must not dock it back. The contribution's owner parks and
 * unparks it: a preview tab whose session is not on screen.
 *
 * An atom so a parked body can react to being parked (a Browser mutes its
 * page while its session is off screen).
 *
 * Memory-only: after a relaunch there is no live body left to keep.
 */

import { atom } from 'nanostores'

export const $parkedTreePanes = atom<ReadonlySet<string>>(new Set())

export function isTreePaneParked(paneId: string): boolean {
  return $parkedTreePanes.get().has(paneId)
}

export function setTreePaneParked(paneId: string, isParked: boolean): void {
  if (isTreePaneParked(paneId) === isParked) {
    return
  }

  const next = new Set($parkedTreePanes.get())

  if (isParked) {
    next.add(paneId)
  } else {
    next.delete(paneId)
  }

  $parkedTreePanes.set(next)
}
