/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/mutable-ref.ts
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { MutableRefObject } from 'react'

/** Imperative ref write — extracted so react-compiler doesn't flag hook-arg refs. */
export function setMutableRef<T>(ref: MutableRefObject<T>, value: T) {
  ref.current = value
}
