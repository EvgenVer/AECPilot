/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/chat/composer/voice-fan.tsx
 * Commit:  f97608f178d1ffeca59860195ab7da295f7c8e5f (v2026.9.24)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits:
 *   [3] dropped the "speak replies" disc and its two props — auto-speak of every
 *       reply is SPEC HX19 (owner decision 2026-09-08); the per-answer "read
 *       aloud" button stays on the message. Dictation and the wake word remain
 *   [5] their product name in the wake-word fallback → ours (SPEC C12), as in
 *       `controls.tsx`
 * (no other edits)
 */
import { useStore } from '@nanostores/react'
import { useCallback, useMemo } from 'react'

import { Codicon } from '@/components/ui/codicon'
import { FanMenu, type FanMenuItem } from '@/components/ui/fan-menu'
import { useI18n } from '@/i18n'
import { triggerHaptic } from '@/lib/haptics'
import { Ear, EarOff, iconSize, Loader2, Square } from '@/lib/icons'
import { cn } from '@/lib/utils'
import { $wakeWord, toggleWakeWord } from '@/store/wake-word'

import { ACTIVE_ICON_BTN, GHOST_ICON_BTN } from './control-classes'
import type { ChatBarState, VoiceStatus } from './types'

export interface VoiceFanProps {
  disabled: boolean
  state: ChatBarState
  voiceStatus: VoiceStatus
  onDictate: () => void
}

/**
 * The voice toggles behind one hub. The mic is the button in the row; hovering
 * it fans the other two — spoken replies and the wake word — out of it.
 * Starting a conversation stays on the primary button beside it.
 *
 * The hub is the mic and reports dictation only (recording, transcribing);
 * each disc carries its own on-state.
 *
 * Items are memoized on the handful of state bits they read, so the fan only
 * re-renders when a toggle actually flips — not on every composer keystroke.
 */
export function VoiceFan({ disabled, state, voiceStatus, onDictate }: VoiceFanProps) {
  const { t } = useI18n()
  const c = t.composer
  const wake = useStore($wakeWord)

  const phrase = wake.phrase || 'hey pilot'
  const dictating = state.voice.active || voiceStatus !== 'idle'
  const wakeListening = wake.listening
  const wakePending = wake.pending

  const dictationLabel =
    voiceStatus === 'recording'
      ? c.stopDictation
      : voiceStatus === 'transcribing'
        ? c.transcribingDictation
        : c.voiceDictation

  const hubLabel = dictating ? dictationLabel : c.voiceDictation

  const dictate = useCallback(() => {
    triggerHaptic(dictating ? 'close' : 'open')
    onDictate()
  }, [dictating, onDictate])

  // The hub is the mic and only dictation lights it. The wake word has its own
  // disc with its own on-state; mirroring it here read as dictation being on.
  const hub = useMemo(
    () => ({
      id: 'dictate',
      active: dictating,
      className: cn(GHOST_ICON_BTN, 'rounded-full p-0', dictating && ACTIVE_ICON_BTN),
      disabled: disabled || !state.voice.enabled || voiceStatus === 'transcribing',
      icon:
        voiceStatus === 'recording' ? (
          <Square className={cn('fill-current', iconSize.xs)} />
        ) : voiceStatus === 'transcribing' ? (
          <Loader2 className={cn('animate-spin', iconSize.sm)} />
        ) : (
          <Codicon name="mic" size="0.875rem" />
        ),
      label: hubLabel,
      onSelect: dictate
    }),
    [dictate, dictating, disabled, hubLabel, state.voice.enabled, voiceStatus]
  )

  const items = useMemo<FanMenuItem[]>(
    () => [
      // EDIT [3]: the "speak replies" disc stood here — SPEC HX19.
      {
        id: 'wake',
        active: wakeListening,
        disabled: disabled || wakePending,
        icon: wakeListening ? <Ear className={iconSize.sm} /> : <EarOff className={iconSize.sm} />,
        label: c.wakeWord(phrase),
        onSelect: () => {
          triggerHaptic(wakeListening ? 'close' : 'open')
          void toggleWakeWord()
        }
      }
    ],
    [c, disabled, phrase, wakeListening, wakePending]
  )

  return <FanMenu direction="vertical" hub={hub} items={items} label={c.voiceControls} />
}
