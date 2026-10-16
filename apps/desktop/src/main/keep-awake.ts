// Keep-awake (task 3.18) — the electron half: the real power-save blocker and
// the device-local preference that survives a restart. Rules and file format
// live in `keep-awake-pure.ts` next to their tests.
//
// `prevent-app-suspension`, NOT `prevent-display-sleep`: the point is an
// overnight run that must not be suspended halfway, and a screen that stays lit
// all night for that is a second, unasked-for change to the machine. This is
// also exactly what the task's acceptance says — the machine does not sleep,
// the display may go dark.
//
// Режим «пока агент работает» (0.22.2, задача T20.7) едет на том же сигнале,
// что их главный процесс: окно сообщает число идущих ходов (`active-work:set`),
// и `noteWorking` сверяет держатель с режимом. Своего таймера или слушателя нет.

import { app, powerSaveBlocker } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import {
  decidePowerSave,
  keepAwakeWanted,
  type KeepAwakeMode,
  parseKeepAwakeJson,
  serializeKeepAwake
} from './keep-awake-pure'

let blockerId: null | number = null
let mode: KeepAwakeMode = 'off'
let working = false

function statePath(): string {
  return join(app.getPath('userData'), 'keep-awake.json')
}

export function loadKeepAwake(): KeepAwakeMode {
  try {
    return parseKeepAwakeJson(readFileSync(statePath(), 'utf-8'))
  } catch {
    return 'off'
  }
}

function persist(next: KeepAwakeMode): void {
  try {
    const path = statePath()
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, serializeKeepAwake(next), 'utf-8')
  } catch (error: unknown) {
    // A preference that could not be written is not worth failing the toggle
    // over — the blocker itself is already in the state the user asked for.
    console.error('aecpilot: could not persist keep-awake', error)
  }
}

/** Reconciles the one blocker with the mode and the live turn picture. Returns
 * the state actually in force; a platform without a blocker (some Linux setups)
 * reports `false` rather than pretending. */
function apply(): boolean {
  const action = decidePowerSave(keepAwakeWanted(mode, working), blockerId)

  if (action === 'start') {
    try {
      blockerId = powerSaveBlocker.start('prevent-app-suspension')
    } catch (error: unknown) {
      console.error('aecpilot: power-save blocker unavailable', error)
      blockerId = null
    }
  } else if (action === 'stop' && blockerId !== null) {
    try {
      powerSaveBlocker.stop(blockerId)
    } catch (error: unknown) {
      console.error('aecpilot: could not stop the power-save blocker', error)
    }
    blockerId = null
  }

  return blockerId !== null
}

/** The mode from the window. Returns whether the blocker is held right now —
 * for 'while-working' that is "a turn is running", not "the mode is on". */
export function setKeepAwakeMode(next: KeepAwakeMode, { save = true } = {}): boolean {
  mode = next
  if (save) persist(next)

  return apply()
}

/** The window's running-turn count changed (any window, merged by the caller). */
export function noteWorking(next: boolean): void {
  if (working === next) return
  working = next
  apply()
}

/** Restores the preference at startup — the whole reason main owns a copy: an
 * overnight run must not depend on someone opening Settings first. */
export function restoreKeepAwake(): boolean {
  return setKeepAwakeMode(loadKeepAwake(), { save: false })
}

export function releaseKeepAwake(): void {
  setKeepAwakeMode('off', { save: false })
}
