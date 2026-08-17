// Keep-awake decisions (task 3.18). Pure — the electron half is three lines,
// and the bug this file exists to prevent is not in those three lines but in
// the bookkeeping around them: starting a second blocker while the first is
// still running leaks it, and the machine then stays awake after the toggle is
// off, with nothing on screen saying why.

export type PowerSaveAction = 'start' | 'stop' | 'none'

/** `blockerId` is what Electron handed back for the blocker we already hold, or
 * null when we hold none. Idempotent on purpose: this runs on every toggle, on
 * every window that mirrors the preference, and once more at startup. */
export function decidePowerSave(on: boolean, blockerId: null | number): PowerSaveAction {
  if (on) return blockerId === null ? 'start' : 'none'

  return blockerId === null ? 'none' : 'stop'
}

/** The stored preference is device-local and boolean; anything else in the file
 * (hand-edited, half-written, an older shape) reads as "off", because the safe
 * default for "should this machine refuse to sleep" is no. */
export function parseKeepAwakeJson(text: string): boolean {
  try {
    const parsed: unknown = JSON.parse(text)

    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      (parsed as { keepAwake?: unknown }).keepAwake === true
    )
  } catch {
    return false
  }
}

export function serializeKeepAwake(on: boolean): string {
  return `${JSON.stringify({ keepAwake: on }, null, 2)}\n`
}
