/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/session/hooks/use-context-suggestions.ts
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { type MutableRefObject, useCallback, useEffect } from 'react'

import { $currentCwd, setContextSuggestions } from '@/store/session'

import type { ContextSuggestion } from '../../types'

interface ContextSuggestionsOptions {
  activeSessionId: string | null
  activeSessionIdRef: MutableRefObject<string | null>
  currentCwd: string
  gatewayState: string | undefined
  requestGateway: <T = unknown>(method: string, params?: Record<string, unknown>) => Promise<T>
}

export function useContextSuggestions({
  activeSessionId,
  activeSessionIdRef,
  currentCwd,
  gatewayState,
  requestGateway
}: ContextSuggestionsOptions) {
  const refresh = useCallback(async () => {
    if (!activeSessionId) {
      setContextSuggestions([])

      return
    }

    const sessionId = activeSessionId
    const cwd = currentCwd || ''

    // Race guard: only commit if the session+cwd we sent for still match
    // by the time the gateway responds.
    const stillCurrent = () => activeSessionIdRef.current === sessionId && $currentCwd.get() === cwd

    try {
      const result = await requestGateway<{ items?: ContextSuggestion[] }>('complete.path', {
        session_id: sessionId,
        word: '@file:',
        cwd: cwd || undefined
      })

      if (stillCurrent()) {
        setContextSuggestions((result.items || []).filter(i => i.text))
      }
    } catch {
      if (stillCurrent()) {
        setContextSuggestions([])
      }
    }
  }, [activeSessionId, activeSessionIdRef, currentCwd, requestGateway])

  useEffect(() => {
    if (gatewayState === 'open' && activeSessionId) {
      void refresh()
    }
  }, [activeSessionId, gatewayState, refresh])
}
