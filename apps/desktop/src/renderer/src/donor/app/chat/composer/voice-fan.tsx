/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/chat/composer/voice-fan.tsx
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits:
 *   [3] dropped the "speak replies" disc with its two props and the wake-word disc —
 *       SPEC HX19; the hub keeps the one thing UR49 brought back, dictation, and the
 *       fan has no discs to hint at
 * (no other edits)
 */
import { useCallback, useMemo } from 'react'

import { Codicon } from '@/components/ui/codicon'
import { FanMenu } from '@/components/ui/fan-menu'
import { useI18n } from '@/i18n'
import { triggerHaptic } from '@/lib/haptics'
import { iconSize, Loader2, Square } from '@/lib/icons'
import { cn } from '@/lib/utils'

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

  const dictating = state.voice.active || voiceStatus !== 'idle'

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

  // EDIT [3]: the "speak replies" and wake-word discs stood here — SPEC HX19.
  return <FanMenu direction="vertical" hint={false} hub={hub} items={NO_DISCS} label={c.voiceControls} />
}

const NO_DISCS: [] = []
