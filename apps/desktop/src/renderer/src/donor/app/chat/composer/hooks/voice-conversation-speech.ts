/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/chat/composer/hooks/voice-conversation-speech.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { RefObject } from 'react'

import type { SpeechStreamSession } from '@/lib/voice-playback'

export interface PendingVoiceResponse {
  id: string
  pending: boolean
  text: string
}

/** Push any new reply text into the live session; finish when complete. */
export function feedVoiceConversationSpeech(
  speechSession: RefObject<SpeechStreamSession | null>,
  activeResponseId: RefObject<string | null>,
  responseId: string,
  pendingResponse: () => PendingVoiceResponse | null,
  spokenSourceLength: RefObject<number>,
  busy: RefObject<boolean>
) {
  const session = speechSession.current

  if (!session || activeResponseId.current !== responseId) {
    return
  }

  const response = pendingResponse()

  if (response && response.id === responseId) {
    if (response.text.length > spokenSourceLength.current) {
      session.append(response.text.slice(spokenSourceLength.current))
      spokenSourceLength.current = response.text.length
    }

    if (!response.pending) {
      // A sealed interim is a committed boundary even while its tool runs.
      // Keep the session open for the next bubble, but speak this tail now.
      if (busy.current) {
        session.flush?.()
      } else {
        session.finish()
      }
    }
  } else if (!busy.current) {
    // Reply consumed/vanished while we were speaking — close out the turn.
    session.finish()
  }
}
