/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/translucency.ts
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/**
 * Window translucency (see-through window).
 *
 * One lever, 0–100. 0 = off (fully opaque, the default). Higher = more of the
 * desktop shows through the whole window — the main process maps it to the
 * native window opacity (`setOpacity`), the same effect as the Windows
 * shift-scroll trick. macOS + Windows only; Linux has no runtime window
 * opacity, so it's a no-op there.
 *
 * The renderer owns the value and mirrors it to the main process over IPC.
 */

import { atom } from 'nanostores'

import { persistString, storedString } from '@/lib/storage'

const KEY = 'hermes.desktop.translucency.v1'

const clamp = (n: number): number => Math.min(100, Math.max(0, Math.round(n)))

const read = (): number => {
  const n = Number(storedString(KEY))

  return Number.isFinite(n) ? clamp(n) : 0
}

export const $translucency = atom<number>(typeof window === 'undefined' ? 0 : read())

export function setTranslucency(intensity: number): void {
  $translucency.set(clamp(intensity))
}

if (typeof window !== 'undefined') {
  $translucency.subscribe(intensity => {
    persistString(KEY, String(intensity))
    window.hermesDesktop?.setTranslucency?.({ intensity })
  })
}
