/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/chat/composer/hooks/use-voice-recorder.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits:
 *   [1] the live STT wire is not opened — it is a WebSocket from the window (SPEC C9) to a
 *       streaming cloud recogniser (SPEC UR49: the sound stays with the core); the recorded
 *       clip goes the relay way, which is their own path without a live wire
 * (no other edits)
 */
import { useEffect, useRef, useState } from 'react'

import { type ResolvedOwner, resolveOwnerNow } from '@/hermes'
import { useI18n } from '@/i18n'
import { syncSttLease, VOICE_INPUT_LEASE } from '@/lib/stt-lease'
import type { DictationStreamSession } from '@/lib/voice-stream'
import { recordFeatureUse } from '@/store/desktop-metrics'
import { notify, notifyError } from '@/store/notifications'

import { useComposerScope } from '../scope'
import type { VoiceActivityState, VoiceStatus } from '../types'

import { useMicRecorder } from './use-mic-recorder'

interface VoiceRecorderOptions {
  maxRecordingSeconds: number
  onTranscribeAudio?: (audio: Blob, owner?: ResolvedOwner) => Promise<string>
  focusInput: () => void
  onTranscript: (text: string) => void
}

/**
 * One dictation, from mic-open to the settled transcript. Its owner is
 * resolved once at mic-open and used for the warm-up, the transcription and
 * the release, so a gateway/profile switch mid-recording cannot split them
 * across backends. `warmup` settles when that mic-open warm-up settled.
 */
interface Dictation {
  owner: ResolvedOwner
  warmup: Promise<void>
  /** Live STT session (stt.streaming): resolves to null when the host has no live wire. */
  live?: () => Promise<DictationStreamSession | null>
}

export function useVoiceRecorder({
  maxRecordingSeconds,
  onTranscribeAudio,
  focusInput,
  onTranscript
}: VoiceRecorderOptions) {
  const { t } = useI18n()
  const voiceCopy = t.notifications.voice
  const { handle, level, recording } = useMicRecorder(voiceCopy)
  // The scope's session owner (a Bot tile's own connection + profile); the
  // main composer leaves it unset and the ambient scope fills it at mic-open.
  const { connectionId: ownerConnectionId, profile: ownerProfile } = useComposerScope()
  const ownerRef = useRef({ connectionId: ownerConnectionId, profile: ownerProfile })
  ownerRef.current = { connectionId: ownerConnectionId, profile: ownerProfile }
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('idle')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [partial, setPartial] = useState('')
  const startedAtRef = useRef(0)
  const intervalRef = useRef<number | null>(null)
  const timeoutRef = useRef<number | null>(null)
  // The live dictation. stop() awaits its warm-up before transcribing (a cold
  // model load must not run inside the transcription request's decode
  // budget, #105955) and checks it is still the live one after every await:
  // unmount clears it, so a warm-up or transcript settling afterwards cannot
  // transcribe, insert text or move focus.
  const dictationRef = useRef<Dictation | null>(null)

  const clearTimers = () => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }

  useEffect(
    () => () => {
      clearTimers()
      const dictation = dictationRef.current
      dictationRef.current = null

      if (dictation) {
        void syncSttLease(VOICE_INPUT_LEASE, false, dictation.owner)
        void dictation.live?.().then(session => session?.cancel())
      }
    },
    []
  )

  const stop = async () => {
    clearTimers()
    const dictation = dictationRef.current
    const result = await handle.stop()
    const live = () => dictation !== null && dictationRef.current === dictation

    if (!dictation || !live()) {
      return // unmounted (or never started) while the recorder stopped
    }

    if (!result || !onTranscribeAudio) {
      finish(dictation)
      setVoiceStatus('idle')

      return
    }

    setVoiceStatus('transcribing')

    try {
      // Readiness first: let the mic-open warm-up settle before handing the
      // clip to transcription, so a cold model load no longer runs inside the
      // transcription request's timeout (#105955). syncSttLease never rejects,
      // and its budget is the lease request's own 180 s timeout.
      await dictation.warmup

      if (!live()) {
        return
      }

      const transcript =
        (await liveTranscript(dictation)) ?? (await onTranscribeAudio(result.audio, dictation.owner)).trim()

      if (!live()) {
        return
      }

      if (!transcript) {
        notify({ kind: 'warning', title: voiceCopy.noSpeechDetected, message: voiceCopy.tryRecordingAgain })
      } else {
        onTranscript(transcript)
      }
    } catch (error) {
      if (live()) {
        notifyError(error, voiceCopy.transcriptionFailed)
      }
    } finally {
      if (live()) {
        finish(dictation)
        setVoiceStatus('idle')
        focusInput()
      }
    }
  }

  // The live session's final text, or null to transcribe the recorded blob instead (no session,
  // socket failure, or an empty result over a take the recorder kept).
  const liveTranscript = async (dictation: Dictation): Promise<null | string> => {
    const session = await dictation.live?.()

    if (!session) {
      return null
    }

    try {
      return (await session.stop()) || null
    } catch {
      return null
    }
  }

  // The transcript settled (or failed): this dictation no longer needs the
  // engine held. Released to the owner that acquired it. The backend keeps the
  // shared model resident regardless.
  const finish = (dictation: Dictation) => {
    dictationRef.current = null
    setPartial('')
    void dictation.live?.().then(session => session?.cancel())
    void syncSttLease(VOICE_INPUT_LEASE, false, dictation.owner)
  }

  const start = async () => {
    if (!onTranscribeAudio) {
      notify({ kind: 'warning', title: voiceCopy.unavailable, message: voiceCopy.transcriptionUnavailable })

      return
    }

    if (dictationRef.current) {
      return
    }

    const owner = resolveOwnerNow(ownerRef.current)
    const dictation: Dictation = { owner, warmup: Promise.resolve() }
    dictationRef.current = dictation

    try {
      await handle.start({
        onError: error => notifyError(error, voiceCopy.recordingFailed)
      })

      if (dictationRef.current !== dictation) {
        return
      }

      // The mic is open, so a transcript is coming: warm the backend's STT
      // engine now so a cold local model loads while the user is still
      // speaking instead of inside the transcription timeout (#105955).
      // Fire-and-forget for the MIC UX — but keep the promise: stop() awaits
      // it as the readiness barrier before transcription (see above).
      dictation.warmup = syncSttLease(VOICE_INPUT_LEASE, true, owner)
      startedAtRef.current = Date.now()
      setElapsedSeconds(0)
      setVoiceStatus('recording')
      recordFeatureUse('voice_dictation')
      intervalRef.current = window.setInterval(() => setElapsedSeconds((Date.now() - startedAtRef.current) / 1000), 250)
      const cap = Math.max(1, Math.min(Math.trunc(maxRecordingSeconds), 600))
      timeoutRef.current = window.setTimeout(() => void stop(), cap * 1000)
    } catch (error) {
      if (dictationRef.current !== dictation) {
        return
      }

      finish(dictation)
      setVoiceStatus('idle')
      notifyError(error, voiceCopy.recordingFailed)
    }
  }

  const dictate = () => {
    if (recording) {
      void stop()
    } else if (voiceStatus === 'idle') {
      void start()
    }
  }

  const voiceActivityState: VoiceActivityState = {
    elapsedSeconds,
    level,
    partial,
    status: voiceStatus
  }

  return { dictate, voiceActivityState, voiceStatus }
}
