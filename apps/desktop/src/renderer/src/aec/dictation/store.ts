// Local dictation in the window (UR49, task T59): the state main reports and the gate every
// recording passes. The gate only opens the dialog or starts the recorder; the microphone
// itself is let out by main, one press at a time (`dictation:request-microphone`).

import { atom } from 'nanostores'

import { $hudMode } from '../../donor/store/hud'
import { notify } from '../../donor/store/notifications'
import type { DictationStatus } from '../../../../shared/ipc'
import { aecT } from '../../shared/i18n/aec-translate'

export const $dictation = atom<DictationStatus | null>(null)
export const $dictationOpen = atom<boolean>(false)

export async function refreshDictation(): Promise<DictationStatus> {
  const status = await window.aecpilot.getDictation()
  $dictation.set(status)
  return status
}

export function openDictation(): void {
  void refreshDictation().catch(() => undefined)
  $dictationOpen.set(true)
}

/**
 * Whether a recording may start now. `false` has already told the person why: the main window
 * opens the consent dialog, the floating window — which has no room for it — says where to go.
 */
export async function dictationGate(): Promise<boolean> {
  // A ready answer is trusted as is: main asks again before it lets the microphone out, and
  // waiting for the disk here would eat into the few seconds a press counts as one.
  if ($dictation.get()?.ready) return true
  const status = await refreshDictation().catch(() => null)
  if (status?.ready) return true
  explain()
  return false
}

function explain(): void {
  if ($hudMode.get()) {
    notify({ kind: 'warning', message: aecT('dictation.hud'), title: aecT('dictation.title') })
  } else {
    $dictationOpen.set(true)
  }
}

/** The bridge member the recorder asks for the microphone (`hermes-desktop-shim.ts`). Main
 *  refuses when the core is no longer set to recognise locally, or another server is
 *  connected since: the stale «ready» goes, and the dialog says what is wrong. */
export async function requestMicrophone(): Promise<boolean> {
  if (await window.aecpilot.requestMicrophone()) return true
  const status = await refreshDictation().catch(() => null)
  if (!status?.ready) explain()
  return false
}

/** The answer their cached `stt.enabled` cannot give: it is read when the gateway connects, so
 *  a model installed a minute ago would still be reported as «off». */
export async function dictationReady(): Promise<boolean> {
  return (await refreshDictation().catch(() => null))?.ready ?? false
}
