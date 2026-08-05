/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/command-palette.ts
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { atom } from 'nanostores'

import { releaseTypingFocus } from '@/components/ui/keyboard-first'

/** Whether the global command palette (Cmd/Ctrl+K) is currently open. */
export const $commandPaletteOpen = atom(false)

/** Optional nested page to open when the palette next opens (e.g. `pets`). */
export const $commandPalettePage = atom<string | null>(null)

export function openCommandPalette(): void {
  $commandPaletteOpen.set(true)
}

/** Open the palette directly on a nested page (`theme`, `pets`, …). */
export function openCommandPalettePage(page: string): void {
  $commandPalettePage.set(page)
  $commandPaletteOpen.set(true)
}

// Closing hands the keyboard back to the composer — a hotkey-opened overlay
// owes typing focus to whatever the user was writing, not to its trigger.
// Skipped when the palette action itself moved focus (navigating to a route,
// opening a dialog): those surfaces claim focus after this runs.
function setOpen(open: boolean): void {
  const wasOpen = $commandPaletteOpen.get()

  $commandPaletteOpen.set(open)

  if (!open) {
    $commandPalettePage.set(null)

    if (wasOpen) {
      releaseTypingFocus()
    }
  }
}

export function closeCommandPalette(): void {
  setOpen(false)
}

export function setCommandPaletteOpen(open: boolean): void {
  setOpen(open)
}

export function toggleCommandPalette(): void {
  setOpen(!$commandPaletteOpen.get())
}
