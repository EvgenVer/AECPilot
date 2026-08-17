// Rules for the global-hotkey mini composer (task 3.15, SPEC UR13 via the
// donor's Quick Entry). Pure: no electron, no window, so the parts that
// actually break a user — an accelerator the OS refuses, a shortcut another
// app already owns, "off means never registered" — are testable without
// booting Electron. The transport half lives in `quick-entry.ts`.
//
// The donor solves the same problem in `apps/desktop/electron/quick-entry.ts`,
// which is OUTSIDE their `src/` and therefore outside our vendor zone (that
// zone is the renderer's, AGENTS §14). So this is our code, following their
// split rather than their lines.

/** Their default, and for the same reason: it is where the muscle memory of
 * other quick-capture apps already sits. */
export const DEFAULT_QUICK_ENTRY_SHORTCUT = 'CommandOrControl+Shift+Space'

/** Wide enough for a sentence, short enough to read as a HUD rather than a
 * second app window. The window never grows: this is a capture box, and task
 * 3.24 decides whether a real HUD replaces it. */
export const QUICK_ENTRY_WIDTH = 620
export const QUICK_ENTRY_HEIGHT = 156

/** Spotlight placement: centred horizontally, a comfortable fraction down —
 * dead centre reads as a modal, and the top edge collides with menu bars. */
const TOP_FRACTION = 0.22

const MODIFIERS = new Set([
  'alt',
  'altgr',
  'cmd',
  'cmdorctrl',
  'command',
  'commandorcontrol',
  'control',
  'ctrl',
  'meta',
  'option',
  'shift',
  'super'
])

const NAMED_KEYS = new Set([
  'backspace',
  'delete',
  'down',
  'end',
  'enter',
  'escape',
  'home',
  'insert',
  'left',
  'pagedown',
  'pageup',
  'plus',
  'return',
  'right',
  'space',
  'tab',
  'up'
])

function isKeyToken(token: string): boolean {
  if (NAMED_KEYS.has(token)) return true
  if (/^f([1-9]|1\d|2[0-4])$/.test(token)) return true

  return token.length === 1 && /[a-z0-9`~!@#$%^&*()\-_=+[\]{}\\|;:'",.<>/?]/.test(token)
}

/**
 * Electron registers whatever it is given and reports failure only as `false`,
 * which is indistinguishable from "another app owns this chord". Checking the
 * shape first is what lets those two be told apart in the message a user sees.
 *
 * An accelerator is modifiers + exactly one key, in Electron's own vocabulary.
 */
export function isValidAccelerator(value: unknown): value is string {
  if (typeof value !== 'string') return false

  const tokens = value.split('+').map((token) => token.trim().toLowerCase())
  if (tokens.length < 2 || tokens.some((token) => token === '')) return false

  const key = tokens[tokens.length - 1]
  const modifiers = tokens.slice(0, -1)

  if (!isKeyToken(key)) return false
  if (modifiers.length === 0) return false

  return modifiers.every((modifier) => MODIFIERS.has(modifier))
}

export type QuickEntryRegistration =
  { register: true; accelerator: string } | { register: false; reason: 'disabled' | 'invalid' }

/** "Disabled" must mean the OS shortcut is never claimed at all — not claimed
 * and ignored. A hotkey held by a feature that is off is a hotkey stolen from
 * every other app on the machine. */
export function decideRegistration(settings: {
  enabled: boolean
  shortcut?: unknown
}): QuickEntryRegistration {
  if (!settings.enabled) return { register: false, reason: 'disabled' }

  const shortcut = settings.shortcut ?? DEFAULT_QUICK_ENTRY_SHORTCUT
  if (!isValidAccelerator(shortcut)) return { register: false, reason: 'invalid' }

  return { register: true, accelerator: shortcut }
}

export interface DisplayArea {
  x: number
  y: number
  width: number
  height: number
}

/** Placed on the display the pointer is on, not the primary one: the window
 * exists to appear where the person is already looking. Rounded because
 * fractional bounds make Windows blur the whole frame. */
export function quickEntryBounds(work: DisplayArea): DisplayArea {
  return {
    x: Math.round(work.x + (work.width - QUICK_ENTRY_WIDTH) / 2),
    y: Math.round(work.y + work.height * TOP_FRACTION),
    width: QUICK_ENTRY_WIDTH,
    height: QUICK_ENTRY_HEIGHT
  }
}

export type QuickEntryTarget = 'current' | 'new'

export function isQuickEntryTarget(value: unknown): value is QuickEntryTarget {
  return value === 'current' || value === 'new'
}
