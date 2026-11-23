/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/disable-f12.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/**
 * Disable F12 DevTools shortcut — a device-local preference.
 *
 * When enabled, F12 is blocked in the main process (before-input-event).
 * Ctrl+Shift+I (or Cmd+Opt+I on Mac) still works regardless.
 * Mirrors the toggle to the main process via IPC.
 */

import { atom } from 'nanostores'

import { persistBoolean, storedBoolean } from '@/lib/storage'

const KEY = 'hermes.desktop.disableF12.v1'

export const $disableF12 = atom<boolean>(typeof window === 'undefined' ? false : storedBoolean(KEY, false))

export function setDisableF12(on: boolean): void {
  $disableF12.set(on)
}

if (typeof window !== 'undefined') {
  $disableF12.subscribe(on => {
    persistBoolean(KEY, on)
    window.hermesDesktop?.setDisableF12?.(on)
  })
}
