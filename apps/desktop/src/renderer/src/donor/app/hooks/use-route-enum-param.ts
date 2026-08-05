/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/hooks/use-route-enum-param.ts
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { useCallback, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router'

// Read/write an enum-shaped URL search param (e.g. ?tab=foo). Used to make
// tabbed views survive a refresh. Always navigates with replace so tab clicks
// don't pile up in history.
export function useRouteEnumParam<T extends string>(
  key: string,
  values: readonly T[],
  fallback: T
): [T, (next: T) => void] {
  const { hash, pathname, search } = useLocation()
  const navigate = useNavigate()

  const value = useMemo<T>(() => {
    const raw = new URLSearchParams(search).get(key)

    return raw && values.includes(raw as T) ? (raw as T) : fallback
  }, [fallback, key, search, values])

  const setValue = useCallback(
    (next: T) => {
      const params = new URLSearchParams(search)

      if (next === fallback) {
        params.delete(key)
      } else {
        params.set(key, next)
      }

      const qs = params.toString()
      navigate({ hash, pathname, search: qs ? `?${qs}` : '' }, { replace: true })
    },
    [fallback, hash, key, navigate, pathname, search]
  )

  return [value, setValue]
}
