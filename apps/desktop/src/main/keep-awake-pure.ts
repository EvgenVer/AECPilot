// Keep-awake decisions (task 3.18). Pure — the electron half is three lines,
// and the bug this file exists to prevent is not in those three lines but in
// the bookkeeping around them: starting a second blocker while the first is
// still running leaks it, and the machine then stays awake after the toggle is
// off, with nothing on screen saying why.
//
// С ядра 0.22.2 (задача T20.7) у донора не переключатель, а РЕЖИМ: «никогда»,
// «пока агент работает» и «всегда». Их окно шлёт строку режима туда, куда
// раньше слало булево, — и строка `'off'` истинна: без этого файла машина
// перестала бы засыпать ровно тогда, когда человек это запретил.

export type PowerSaveAction = 'start' | 'stop' | 'none'

/** Their three modes (`electron/power-save.ts`), the same strings on the wire. */
export type KeepAwakeMode = 'always' | 'off' | 'while-working'

const KEEP_AWAKE_MODES: readonly KeepAwakeMode[] = ['off', 'while-working', 'always']

/** `blockerId` is what Electron handed back for the blocker we already hold, or
 * null when we hold none. Idempotent on purpose: this runs on every toggle, on
 * every window that mirrors the preference, and once more at startup. */
export function decidePowerSave(on: boolean, blockerId: null | number): PowerSaveAction {
  if (on) return blockerId === null ? 'start' : 'none'

  return blockerId === null ? 'none' : 'stop'
}

/** A mode from the window, or the boolean the pre-mode toggle sent (`true` was
 * "always on"). Anything else is not a mode, and the caller keeps what it had. */
export function parseKeepAwakeMode(value: unknown): KeepAwakeMode | null {
  if (value === true) return 'always'
  if (value === false) return 'off'

  return typeof value === 'string' && (KEEP_AWAKE_MODES as readonly string[]).includes(value)
    ? (value as KeepAwakeMode)
    : null
}

/** Whether the blocker should be held right now. Their rule, verbatim. */
export function keepAwakeWanted(mode: KeepAwakeMode, working: boolean): boolean {
  return mode === 'always' || (mode === 'while-working' && working)
}

/** The stored preference is device-local. Anything unreadable (hand-edited,
 * half-written) reads as "off", because the safe default for "should this
 * machine refuse to sleep" is no. The pre-0.22 file (`{"keepAwake": true}`)
 * still reads as the mode it meant. */
export function parseKeepAwakeJson(text: string): KeepAwakeMode {
  try {
    const parsed: unknown = JSON.parse(text)

    if (typeof parsed !== 'object' || parsed === null) return 'off'

    const record = parsed as { keepAwake?: unknown; mode?: unknown }
    const mode = parseKeepAwakeMode(record.mode)
    if (mode) return mode

    return record.keepAwake === true ? 'always' : 'off'
  } catch {
    return 'off'
  }
}

/** Задача T42.1 (их `keep-awake-controller.ts`, решение владельца 2026-10-19): сон
 * короче этого считается не сном машины, а закрытой крышкой на минуту — предлагать
 * за него «не засыпать» было бы навязчиво. Их число, дословно. */
export const IDLE_SLEEP_MIN_SECONDS = 55

/** Предложение делается один раз на компьютер; флаг живёт в том же файле, что режим. */
export function parseKeepAwakeOffered(text: string): boolean {
  try {
    const parsed: unknown = JSON.parse(text)
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      (parsed as { offered?: unknown }).offered === true
    )
  } catch {
    return false
  }
}

/** Ход шёл, режим «никогда», и машина ушла в сон по таймеру — после пробуждения
 * стоит один раз предложить «пока агент работает». Их правило, дословно. */
export function sleptMidTurn(mode: KeepAwakeMode, working: boolean, idleSeconds: number): boolean {
  return mode === 'off' && working && idleSeconds >= IDLE_SLEEP_MIN_SECONDS
}

export function serializeKeepAwake(mode: KeepAwakeMode, offered = false): string {
  return `${JSON.stringify({ mode, ...(offered ? { offered } : {}) }, null, 2)}\n`
}
