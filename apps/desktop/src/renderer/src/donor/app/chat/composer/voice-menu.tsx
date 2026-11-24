/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/chat/composer/voice-menu.tsx
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits:
 *   [3] dropped the "start voice chat" item, the "speak replies" checkbox and the
 *       wake-word checkbox — SPEC HX19. What is left is dictation (UR49). At
 *       v2026.9.14 the item came back as the live-voice entry plus
 *       `./voice-engine-rows` (engine picker for that conversation) — same surface,
 *       same [3]: not imported, not rendered (2026-09-15)
 * (no other edits)
 */
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  dropdownMenuRow,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tip } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n'
import { triggerHaptic } from '@/lib/haptics'
import { iconSize, Loader2, Square } from '@/lib/icons'
import { cn } from '@/lib/utils'

import { ACTIVE_ICON_BTN, GHOST_ICON_BTN } from './control-classes'
import type { ChatBarState, VoiceStatus } from './types'

export interface VoiceMenuProps {
  disabled: boolean
  state: ChatBarState
  voiceStatus: VoiceStatus
  onDictate: () => void
}

/**
 * Every voice control behind one trigger: dictation. EDIT [3]: the wake word,
 * spoken replies and starting a full conversation were the other three rows —
 * SPEC HX19.
 *
 * The bar carried four separate icon buttons — mic, speaker, ear, and the
 * voice-conversation primary — which is most of a Spotlight-width composer
 * spent on toggles that are set once and rarely touched. Collapsing them costs
 * one click on the rare change and gives the row back to the input.
 *
 * The trigger is not a static glyph: it REPORTS the loudest live voice state
 * (recording, transcribing, listening for the wake word, speaking replies), so
 * folding the controls away never hides the fact that something is listening.
 * A collapsed menu that looked idle while the mic was hot would be a worse
 * trade than the space it saves.
 */
export function VoiceMenu({ disabled, state, voiceStatus, onDictate }: VoiceMenuProps) {
  const { t } = useI18n()
  const c = t.composer

  // Anything live keeps the trigger lit, so a folded menu can never look idle
  // while the mic is open.
  const dictating = state.voice.active || voiceStatus !== 'idle'

  const dictationLabel =
    voiceStatus === 'recording'
      ? c.stopDictation
      : voiceStatus === 'transcribing'
        ? c.transcribingDictation
        : c.voiceDictation

  const triggerLabel = dictating ? dictationLabel : c.voiceControls

  return (
    <DropdownMenu>
      <Tip label={triggerLabel} placement="control">
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={triggerLabel}
            className={cn(GHOST_ICON_BTN, 'p-0', dictating && ACTIVE_ICON_BTN)}
            disabled={disabled}
            size="icon"
            type="button"
            variant="ghost"
          >
            {voiceStatus === 'recording' ? (
              <Square className={cn('fill-current', iconSize.xs)} />
            ) : voiceStatus === 'transcribing' ? (
              <Loader2 className={cn('animate-spin', iconSize.sm)} />
            ) : (
              <Codicon name="mic" size="0.875rem" />
            )}
          </Button>
        </DropdownMenuTrigger>
      </Tip>
      <DropdownMenuContent align="end" className="min-w-52">
        {/* Checkbox items, because both are toggles the user is reading
            the CURRENT state of — the reason they were pressed-state buttons
            before. A plain row would fold that state away with the menu. */}
        <DropdownMenuCheckboxItem
          checked={dictating}
          className={dropdownMenuRow}
          disabled={disabled || !state.voice.enabled || voiceStatus === 'transcribing'}
          onSelect={event => {
            // Keep the menu open: dictation is a mode you watch, and closing
            // on select hides the recording state the trigger just entered.
            event.preventDefault()
            triggerHaptic(dictating ? 'close' : 'open')
            onDictate()
          }}
        >
          {dictationLabel}
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
