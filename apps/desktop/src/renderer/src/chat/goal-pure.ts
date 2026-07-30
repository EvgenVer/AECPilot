// Reading the standing goal's state out of the gateway (task 1.6.A5).
//
// There is no structured RPC for this: their `GoalManager.status_line()`
// returns one human-readable English line, and `/goal status` hands it back
// verbatim. So this parses that line — conservatively, and never guessing:
// a line whose shape we do not recognise is reported as `unknown` with the
// raw text preserved, because inventing a state would be worse than showing
// what the gateway actually said.

/** Where the goal stands. `parked` is theirs: an active goal deliberately
 * waiting on a session, a pid or a timer. */
export type GoalStatus = 'none' | 'active' | 'parked' | 'paused' | 'done' | 'unknown'

export interface GoalState {
  status: GoalStatus
  /** The goal itself, when the line carried it. */
  text: string
  turnsUsed?: number
  maxTurns?: number
  /** Their line as received — shown as-is for `unknown`, and available as a
   * tooltip otherwise, so nothing they say is lost in our summary. */
  raw: string
}

export const NO_GOAL: GoalState = { status: 'none', text: '', raw: '' }

/** Their glyphs, from `status_line()`. Matching on these rather than on the
 * English words keeps the parse working if they reword the sentence, which is
 * the part most likely to change. */
const GLYPHS: Array<[string, GoalStatus]> = [
  ['⊙', 'active'],
  ['⏳', 'parked'],
  ['⏸', 'paused'],
  ['✓', 'done']
]

const TURNS = /(\d+)\/(\d+) turns/

export function parseGoalStatus(line: string): GoalState {
  const raw = line.trim()
  if (raw === '') return NO_GOAL
  // Their explicit "nothing set" line. Checked before the glyphs so that a
  // future glyph on it could not be read as an active goal.
  if (raw.startsWith('No active goal')) return { ...NO_GOAL, raw }

  const hit = GLYPHS.find(([glyph]) => raw.startsWith(glyph))
  if (!hit) return { status: 'unknown', text: '', raw }

  // Everything after the first ": " is the goal — their line puts the meta in
  // parentheses before it, and the goal itself may contain colons.
  const separator = raw.indexOf(': ')
  const text = separator === -1 ? '' : raw.slice(separator + 2).trim()

  const turns = TURNS.exec(raw)
  return {
    status: hit[1],
    text,
    turnsUsed: turns ? Number(turns[1]) : undefined,
    maxTurns: turns ? Number(turns[2]) : undefined,
    raw
  }
}

const LABELS: Record<GoalStatus, string> = {
  none: '',
  active: 'Цель активна',
  parked: 'Цель ждёт',
  paused: 'Цель на паузе',
  done: 'Цель достигнута',
  unknown: 'Цель'
}

/** What the badge says. The turn budget is included whenever it is known,
 * because it is the thing that answers "почему агент всё ещё сам ходит" — a
 * goal spends turns without being asked, and the count is how the user sees
 * how much of that is left. */
export function goalBadgeLabel(state: GoalState): string {
  if (state.status === 'none') return ''
  const budget =
    state.turnsUsed !== undefined && state.maxTurns !== undefined
      ? ` ${state.turnsUsed}/${state.maxTurns}`
      : ''
  return `${LABELS[state.status]}${budget}`
}

/** Which controls make sense right now. Offering "возобновить" on a goal that
 * is already running would suggest it is not. */
export function goalControls(state: GoalState): {
  pause: boolean
  resume: boolean
  clear: boolean
} {
  const live = state.status === 'active' || state.status === 'parked'
  return {
    pause: live,
    resume: state.status === 'paused',
    clear: state.status !== 'none'
  }
}

/** True when the badge should be on screen at all. `done` stays visible: the
 * agent stopping on its own is exactly the moment the user needs to be told
 * why it had been going. It leaves when the goal is cleared. */
export function shouldShowGoal(state: GoalState): boolean {
  return state.status !== 'none'
}
