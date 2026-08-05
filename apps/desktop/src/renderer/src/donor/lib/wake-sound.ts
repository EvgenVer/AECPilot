/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/wake-sound.ts
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
// Wake-word activation chime. A short, bright, rising two-note "ding" that
// plays the moment "Hey Hermes" is detected, so it's obvious the wake
// registered before voice capture starts. Deliberately distinct from the
// turn-end completion cue (completion-sound.ts): this one RISES (open/ready),
// the completion cue settles (done). Reuses the same lightweight WebAudio
// synthesis approach — no asset file to ship.

import { $hapticsMuted } from '@/store/haptics'

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

      if (!Ctor) {
        return null
      }

      ctx = new Ctor()
    }

    // Autoplay policies can leave the context suspended until a gesture; a
    // resume() here recovers it once the user has interacted with the window.
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => undefined)
    }

    return ctx
  } catch {
    return null
  }
}

// One enveloped sine voice → master. Linear-ish attack into an exponential
// decay keeps the tail smooth and avoids the click you get ramping to zero.
function ding(ac: AudioContext, master: GainNode, t0: number, freq: number, dur: number, gain: number) {
  const osc = ac.createOscillator()
  const env = ac.createGain()
  const end = t0 + dur

  osc.type = 'sine'
  osc.frequency.setValueAtTime(freq, t0)

  env.gain.setValueAtTime(0.0001, t0)
  env.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0002), t0 + 0.008)
  env.gain.exponentialRampToValueAtTime(0.0001, end)

  osc.connect(env)
  env.connect(master)
  osc.start(t0)
  osc.stop(end + 0.02)
}

// Play the wake chime. Honours the shared sound-mute toggle ($hapticsMuted),
// the same gate the completion cue uses, so muting turn-end sounds also
// silences this. Best-effort: never throws into the wake-event handler.
export function playWakeSound(): void {
  if ($hapticsMuted.get()) {
    return
  }

  const ac = getCtx()

  if (!ac) {
    return
  }

  try {
    const master = ac.createGain()
    master.gain.setValueAtTime(0.5, ac.currentTime)
    master.connect(ac.destination)

    const t0 = ac.currentTime + 0.01
    // Rising perfect-fourth: G5 -> C6. Short and bright — "listening".
    ding(ac, master, t0, 783.99, 0.12, 0.06)
    ding(ac, master, t0 + 0.1, 1046.5, 0.28, 0.07)
  } catch {
    // WebAudio can throw if the context died mid-call; a missed chime must
    // never break wake handling.
  }
}
