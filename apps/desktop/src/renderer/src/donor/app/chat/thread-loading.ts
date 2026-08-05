/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/chat/thread-loading.ts
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { ChatMessage } from '@/lib/chat-messages'

export type ThreadLoadingState = 'response' | 'session'

export function lastVisibleMessageIsUser(messages: ChatMessage[]): boolean {
  // Allocation-free reverse scan — runs in a hot $messages computed.
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (!messages[i].hidden) {
      return messages[i].role === 'user'
    }
  }

  return false
}

export function threadLoadingState(
  loadingSession: boolean,
  busy: boolean,
  awaitingResponse: boolean,
  lastVisibleIsUser: boolean
): ThreadLoadingState | undefined {
  if (loadingSession) {
    return 'session'
  }

  if (busy && awaitingResponse && lastVisibleIsUser) {
    return 'response'
  }

  return undefined
}
