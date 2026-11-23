/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/keybinds/handled-keys.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
// Keydowns the window keybind dispatcher ran as a Hermes action. It cancels
// every chord it matches in capture, including one whose passthrough handler
// then declines, so `defaultPrevented` alone doesn't say an action ran. xterm
// ignores `defaultPrevented`; the terminal asks here before sending a key to
// the PTY.
const handled = new WeakSet<Event>()

export function markKeybindHandled(event: Event): void {
  handled.add(event)
}

export function keybindHandled(event: Event): boolean {
  return handled.has(event)
}
