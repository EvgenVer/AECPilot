/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/wake-indicator.ts
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
export type WakeIndicatorState = 'capturing' | 'detected' | 'hidden'

export type WakeIndicatorVoiceStatus = 'idle' | 'listening' | 'speaking' | 'thinking' | 'transcribing'

let wakeStartedConversation = false
let voiceConversationStarted = false
let lastState: WakeIndicatorState = 'hidden'

function pushState(state: WakeIndicatorState): void {
  if (state === lastState) {
    return
  }

  lastState = state
  window.hermesDesktop?.wakeIndicator?.setState(state)
}

export function activateWakeIndicator(): void {
  wakeStartedConversation = true
  voiceConversationStarted = false
  pushState('detected')
}

export function syncWakeIndicatorWithVoice(active: boolean, status: WakeIndicatorVoiceStatus): boolean {
  if (!wakeStartedConversation) {
    return false
  }

  if (!active && !voiceConversationStarted) {
    return false
  }

  if (!active) {
    wakeStartedConversation = false
    voiceConversationStarted = false
    pushState('hidden')

    return true
  }

  voiceConversationStarted = true
  pushState(status === 'listening' ? 'capturing' : 'detected')

  return true
}

export function clearWakeIndicator(): void {
  if (!wakeStartedConversation && lastState === 'hidden') {
    return
  }

  wakeStartedConversation = false
  voiceConversationStarted = false
  pushState('hidden')
}
