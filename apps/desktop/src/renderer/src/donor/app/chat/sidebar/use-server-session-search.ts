/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/chat/sidebar/use-server-session-search.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { useEffect, useState } from 'react'

import { searchSessions, type SessionSearchResult } from '@/hermes'
import { ALL_PROFILES, normalizeProfileKey } from '@/store/profile'

const SEARCH_DEBOUNCE_MS = 200

export interface ServerSessionSearch {
  serverMatches: SessionSearchResult[]
  searchPending: boolean
}

/**
 * Debounced full-text search across *all* sessions (not just the loaded page)
 * so old sessions stay findable. Hits come from the profile the sidebar shows:
 * an unscoped request searches the primary backend's launch profile, whatever
 * profile is on screen. "All profiles" asks the primary as before.
 */
export function useServerSessionSearch(query: string, profileScope: string): ServerSessionSearch {
  const [serverMatches, setServerMatches] = useState<SessionSearchResult[]>([])
  const [searchPending, setSearchPending] = useState(false)
  const profile = profileScope === ALL_PROFILES ? null : normalizeProfileKey(profileScope)

  useEffect(() => {
    if (!query) {
      setServerMatches([])
      setSearchPending(false)

      return
    }

    let cancelled = false

    setSearchPending(true)

    const id = window.setTimeout(() => {
      void searchSessions(query, profile)
        .then(res => {
          if (!cancelled) {
            setServerMatches(res.results)
          }
        })
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled) {
            setSearchPending(false)
          }
        })
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      cancelled = true
      window.clearTimeout(id)
    }
  }, [query, profile])

  return { searchPending, serverMatches }
}
