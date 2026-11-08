/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/mutable-ref.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { MutableRefObject } from 'react'

/** Imperative ref write — extracted so react-compiler doesn't flag hook-arg refs. */
export function setMutableRef<T>(ref: MutableRefObject<T>, value: T) {
  ref.current = value
}
