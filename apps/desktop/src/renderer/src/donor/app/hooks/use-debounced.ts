/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/hooks/use-debounced.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { useEffect, useState } from 'react'

/** Debounce a fast-changing value (search input, slider, …) so effects/queries
 *  keyed on it only fire once the value settles. */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs)

    return () => clearTimeout(handle)
  }, [value, delayMs])

  return debounced
}
