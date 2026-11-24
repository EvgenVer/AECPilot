// What the composer calls instead of their recorder (edit [1] of `composer/index.tsx`): a press
// that starts a recording passes the gate, a press that stops one does not wait for anything.

import { useCallback, useEffect, useRef } from 'react'

import type { VoiceStatus } from '../../donor/app/chat/composer/types'

import { dictationGate } from './store'

export function useDictationGate(record: () => void, status: VoiceStatus): () => void {
  // The recorder's callback closes over its own state, so after the await the one from the
  // latest render is called, not the one the press saw.
  const latest = useRef({ record, status })
  useEffect(() => {
    latest.current = { record, status }
  })
  const asking = useRef(false)
  // The answer may come after the composer is gone (a closed tab): recording then would run
  // with no banner and no button to stop it.
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  return useCallback(() => {
    if (latest.current.status !== 'idle') {
      latest.current.record()
      return
    }
    if (asking.current) return
    asking.current = true
    void dictationGate()
      .then((open) => {
        if (open && mounted.current && latest.current.status === 'idle') latest.current.record()
      })
      .finally(() => {
        asking.current = false
      })
  }, [])
}
