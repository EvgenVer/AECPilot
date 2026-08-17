// Keep-awake (task 3.18) — the electron half: the real power-save blocker and
// the device-local preference that survives a restart. Rules and file format
// live in `keep-awake-pure.ts` next to their tests.
//
// `prevent-app-suspension`, NOT `prevent-display-sleep`: the point is an
// overnight run that must not be suspended halfway, and a screen that stays lit
// all night for that is a second, unasked-for change to the machine. This is
// also exactly what the task's acceptance says — the machine does not sleep,
// the display may go dark.

import { app, powerSaveBlocker } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { decidePowerSave, parseKeepAwakeJson, serializeKeepAwake } from './keep-awake-pure'

let blockerId: null | number = null

function statePath(): string {
  return join(app.getPath('userData'), 'keep-awake.json')
}

export function loadKeepAwake(): boolean {
  try {
    return parseKeepAwakeJson(readFileSync(statePath(), 'utf-8'))
  } catch {
    return false
  }
}

function persist(on: boolean): void {
  try {
    const path = statePath()
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, serializeKeepAwake(on), 'utf-8')
  } catch (error: unknown) {
    // A preference that could not be written is not worth failing the toggle
    // over — the blocker itself is already in the state the user asked for.
    console.error('aecpilot: could not persist keep-awake', error)
  }
}

/** Returns the state actually in force, which is what the renderer mirrors. A
 * platform without a blocker (some Linux setups) reports `false` rather than
 * pretending. */
export function setKeepAwake(on: boolean, { save = true } = {}): boolean {
  const action = decidePowerSave(on, blockerId)

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

  const inForce = blockerId !== null
  if (save) persist(inForce)

  return inForce
}

/** Restores the preference at startup — the whole reason main owns a copy: an
 * overnight run must not depend on someone opening Settings first. */
export function restoreKeepAwake(): boolean {
  return setKeepAwake(loadKeepAwake(), { save: false })
}

export function releaseKeepAwake(): void {
  setKeepAwake(false, { save: false })
}
