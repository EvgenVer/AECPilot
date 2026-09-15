/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/chat/composer/controls.tsx
 * Commit:  345cd2b057a452236de401d3534b8502a7465e8d (v2026.9.14)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits:
 *   [5] their product name in the wake-word fallback → ours (SPEC C12)
 *   [3] dropped the voice-conversation pill, the "start voice chat" primary button
 *       and the auto-speak toggle — SPEC HX19 (owner decision 2026-09-08); the
 *       per-answer "read aloud" button lives on the message, not here. At
 *       v2026.9.14 the button became `./start-voice-button` (live voice, OpenAI
 *       Realtime) — same surface, same [3]: not imported, not rendered (2026-09-15)
 * (no other edits)
 */
import { useStore } from '@nanostores/react'

import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { Tip, TipKeybindLabel } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n'
import { triggerHaptic } from '@/lib/haptics'
import { Ear, EarOff, iconSize, Layers3, Loader2, Square } from '@/lib/icons'
import { cn } from '@/lib/utils'
import { $hudMode, closeHud, resetHudLayout } from '@/store/hud'
import { $wakeWord, toggleWakeWord } from '@/store/wake-word'

import { ACTIVE_ICON_BTN, GHOST_ICON_BTN, PRIMARY_ICON_BTN } from './control-classes'
import { ModelPill } from './model-pill'
import { ReasoningPill } from './reasoning-pill'
import type { ChatBarState, VoiceStatus } from './types'
import { VoiceMenu } from './voice-menu'

// Re-exported: `context-menu.tsx` and other row neighbours have always reached
// for these here, and the row is where they read as belonging.
export { ACTIVE_ICON_BTN, GHOST_ICON_BTN, ICON_BTN, PRIMARY_ICON_BTN } from './control-classes'

export function ComposerControls({
  busy,
  busyAction,
  canSubmit,
  compactModelPill = false,
  disabled,
  foldVoice = false,
  hasComposerPayload,
  hideModelPill = false,
  minimal = false,
  state,
  voiceStatus,
  onDictate,
  onQueue
}: {
  busy: boolean
  busyAction: 'steer' | 'queue' | 'stop'
  canSubmit: boolean
  compactModelPill?: boolean
  disabled: boolean
  foldVoice?: boolean
  hasComposerPayload: boolean
  hideModelPill?: boolean
  minimal?: boolean
  state: ChatBarState
  voiceStatus: VoiceStatus
  onDictate: () => void
  onQueue: () => void
}) {
  const { t } = useI18n()
  const c = t.composer
  const hudMode = useStore($hudMode)

  // EDIT [3]: их большая кнопка «начать голосовой разговор» стояла ЗДЕСЬ —
  // главной кнопкой пустого композера, на месте «отправить». Разговор снят
  // (HX19), поэтому главная кнопка всегда одна и та же: отправить или
  // остановить.
  // Steer is just send: a payload keeps the Send affordance mid-turn. Stop
  // only when the composer is empty and a turn is running.
  const showStop = busy && !hasComposerPayload
  const showQueueButton = busyAction !== 'stop' && hasComposerPayload
  // The HUD is a Spotlight bar a few hundred pixels wide, so the four separate
  // voice toggles fold into one menu there and leave the row to the input. A
  // narrow tile hits the same wall from the other direction and folds for the
  // same reason — same controls, same state, different budget. Below that
  // even the menu goes: at `minimal` the row is the send button and nothing
  // else, which is the one thing that must survive every width.
  const foldedVoice = hudMode || foldVoice

  const voiceControls = foldedVoice ? (
    <VoiceMenu
      disabled={disabled}
      onDictate={onDictate}
      state={state}
      voiceStatus={voiceStatus}
    />
  ) : (
    <>
      <DictationButton disabled={disabled} onToggle={onDictate} state={state.voice} status={voiceStatus} />
      <WakeWordButton disabled={disabled} />
    </>
  )

  return (
    <div className="ml-auto flex min-w-0 shrink items-center gap-(--composer-control-gap)">
      {minimal ? null : (
        <>
          {hideModelPill ? null : (
            <>
              <ModelPill compact={compactModelPill} disabled={disabled} model={state.model} />
              {compactModelPill ? null : <ReasoningPill disabled={disabled} model={state.model} />}
            </>
          )}
          {voiceControls}
        </>
      )}
      {showQueueButton ? (
        <Tip label={<TipKeybindLabel actionId="composer.queue" text={c.queueMessage} />}>
          <Button
            aria-label={c.queueMessage}
            className={GHOST_ICON_BTN}
            disabled={disabled}
            onClick={onQueue}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Layers3 className={iconSize.sm} />
          </Button>
        </Tip>
      ) : null}
      <Tip
        label={
          showStop ? (
            <TipKeybindLabel actionId="composer.send" text={c.stop} />
          ) : (
            <TipKeybindLabel actionId="composer.send" text={c.send} />
          )
        }
      >
        <Button
          aria-label={showStop ? c.stop : c.send}
          className={PRIMARY_ICON_BTN}
          disabled={disabled || !canSubmit}
          type="submit"
        >
          {showStop ? (
            <span className="block size-2.5 rounded-[0.1875rem] bg-current" />
          ) : (
            <Codicon name="arrow-up" size="0.875rem" />
          )}
        </Button>
      </Tip>
      {/* The way out of HUD mode, riding the controls row rather than floating
          above the bar. The old chip lived in a 26px transparent strip reserved
          over the composer (--hud-chip-strip), which under glass is bare
          untinted material with a hidden button in it — a band of chrome above
          the surface, paid for in every state, for a control that is invisible
          until hovered. Here it costs no reserved space and sits with the other
          things you can press. */}
      {hudMode ? <HudWindowButtons /> : null}
    </div>
  )
}

function HudWindowButtons() {
  const { t } = useI18n()

  return (
    <>
      <Tip label={t.titlebar.resetHudLayout}>
        <Button
          aria-label={t.titlebar.resetHudLayout}
          className={cn(GHOST_ICON_BTN, 'p-0')}
          onClick={resetHudLayout}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Codicon name="discard" size="0.875rem" />
        </Button>
      </Tip>
      <Tip label={t.titlebar.exitHud}>
        <Button
          aria-label={t.titlebar.exitHud}
          className={cn(GHOST_ICON_BTN, 'p-0')}
          onClick={closeHud}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Codicon name="screen-normal" size="0.875rem" />
        </Button>
      </Tip>
    </>
  )
}

// EDIT [3]: таблички непрерывного разговора (микрофон, уровень, «закончить»)
// здесь больше нет — сам разговор снят, SPEC HX19. Вместе с ней ушёл и её
// индикатор уровня громкости.

// EDIT [3]: переключатель «читать все ответы вслух» — SPEC HX19: он говорит без
// решения человека по каждому ответу. Кнопка «прочитать вслух» у отдельного
// ответа осталась на своём месте, в `assistant-message.tsx`.

// "Hey Hermes" wake-word toggle. ALWAYS rendered — the ear never hides. A
// user must always be able to click it to turn passive listening on; if the
// backend can't start (missing STT/TTS, deps still installing, no mic
// permission, etc.) the click surfaces the reason in the tooltip and the
// toggle stays off. States: listening (accent-highlighted), off (muted
// ear-off), and paused-for-voice (disabled while a voice conversation holds
// the mic — the one time wake genuinely must not listen). Backend refusals
// ({started:false, reason}) keep the toggle off and put the reason/hint in
// the tooltip.
function WakeWordButton({ disabled, pausedForVoice = false }: { disabled: boolean; pausedForVoice?: boolean }) {
  const { t } = useI18n()
  const c = t.composer
  const wake = useStore($wakeWord)

  const phrase = wake.phrase || 'hey pilot'

  const label = pausedForVoice
    ? c.wakeWordPausedVoice(phrase)
    : wake.listening
      ? c.wakeWordListening(phrase)
      : c.wakeWordOff(phrase)

  const tooltip = !pausedForVoice && wake.notice ? `${label} — ${wake.notice}` : label

  return (
    <Tip label={tooltip}>
      <Button
        aria-label={label}
        aria-pressed={wake.listening && !pausedForVoice}
        className={cn(GHOST_ICON_BTN, 'p-0', wake.listening && !pausedForVoice && ACTIVE_ICON_BTN)}
        disabled={disabled || pausedForVoice || wake.pending}
        onClick={() => {
          triggerHaptic(wake.listening ? 'close' : 'open')
          void toggleWakeWord()
        }}
        size="icon"
        type="button"
        variant="ghost"
      >
        {wake.listening && !pausedForVoice ? <Ear className={iconSize.sm} /> : <EarOff className={iconSize.sm} />}
      </Button>
    </Tip>
  )
}

function DictationButton({
  disabled,
  state,
  status,
  onToggle
}: {
  disabled: boolean
  state: ChatBarState['voice']
  status: VoiceStatus
  onToggle: () => void
}) {
  const { t } = useI18n()
  const c = t.composer
  const active = state.active || status !== 'idle'

  const aria =
    status === 'recording' ? c.stopDictation : status === 'transcribing' ? c.transcribingDictation : c.voiceDictation

  return (
    <Tip label={aria}>
      <Button
        aria-label={aria}
        aria-pressed={active}
        className={cn(
          GHOST_ICON_BTN,
          'p-0',
          'data-[active=true]:bg-accent data-[active=true]:text-foreground',
          status === 'recording' && ACTIVE_ICON_BTN,
          status === 'transcribing' && 'bg-primary/10 text-primary'
        )}
        data-active={active}
        disabled={disabled || !state.enabled || status === 'transcribing'}
        onClick={() => {
          triggerHaptic(active ? 'close' : 'open')
          onToggle()
        }}
        size="icon"
        type="button"
        variant="ghost"
      >
        {status === 'recording' ? (
          <Square className={cn('fill-current', iconSize.xs)} />
        ) : status === 'transcribing' ? (
          <Loader2 className={cn('animate-spin', iconSize.sm)} />
        ) : (
          <Codicon name="mic" size="0.875rem" />
        )}
      </Button>
    </Tip>
  )
}
