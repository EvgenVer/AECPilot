// Notification queue for the shell's toasts and the status bar's journal
// (tasks 1.6.B6.4–B6.7, contract: specs/workbench-panels.md §Уведомления).
// Framework-free — no React import — so every rule below is pinned by node
// tests, same convention as chat-state.ts.
//
// Deliberately NOT part of the chat reducer: a notice is not a transcript
// item. It outlives the turn that raised it, it is addressed by a key rather
// than by position, and it must not be cleared when a session is reloaded.

import { isGatewayEventOfType, type GatewayEvent } from '../../../shared/gateway/types'

/** Their `AgentNotice.level` (`agent/credits_tracker.py:178`), verbatim. */
export type NotificationLevel = 'info' | 'warn' | 'error' | 'success'

export interface Notification {
  /** Monotonic, stable React key — the gateway's `key` cannot serve as one:
   * it is optional, and two notices may share it on purpose (dedupe). */
  id: number
  /** The gateway's dedupe/clear key, when it sent one. A second `show` with
   * the same key REPLACES the first (their comment: "dedupe /
   * fired-once-latch / clear key"), and `notification.clear` addresses it. */
  key?: string
  text: string
  level: NotificationLevel
  /** Auto-hide delay in ms. Undefined means the notice lives until it is
   * closed by hand or withdrawn by the core — their `sticky` kind. */
  ttlMs?: number
  /** When it arrived, supplied by the dispatcher so the reducer never reads a
   * clock (purity — same rule as `ChatReasoning.startedAt`). */
  receivedAt: number
}

export interface NotificationState {
  /** On screen right now, oldest first. */
  toasts: Notification[]
  /** Everything that arrived, newest first — a closed toast stays here. */
  journal: Notification[]
  /** How many arrived since the journal was last opened. */
  unread: number
  nextId: number
}

export const emptyNotificationState: NotificationState = {
  toasts: [],
  journal: [],
  unread: 0,
  nextId: 0
}

/** How many toasts may share the screen. Past this the OLDEST goes: a burst of
 * notices must not become a wall covering the app (spec: «поток уведомлений не
 * съедает окно»). Nothing is lost — the journal keeps them all. */
export const MAX_TOASTS = 4

/** How long the journal is. Old entries fall off the end rather than growing
 * a list nobody scrolls to the bottom of. */
export const MAX_JOURNAL = 50

/** TTL given to a background-process notice (`status.update {kind:"process"}`).
 * The core sends these as plain status lines with no ttl of their own, and a
 * finished `npm test` is worth a glance, not a click to dismiss. */
export const PROCESS_NOTICE_TTL_MS = 8000

const LEVELS: NotificationLevel[] = ['info', 'warn', 'error', 'success']

function toLevel(value: unknown): NotificationLevel {
  return LEVELS.includes(value as NotificationLevel) ? (value as NotificationLevel) : 'info'
}

/** What a notification is made of before it gets an id — the shape every
 * source (a `notification.show`, a process status line, browser progress)
 * is normalized into. */
export interface NotificationInput {
  text: string
  level?: NotificationLevel
  ttlMs?: number
  key?: string
}

/** The ttl the gateway actually means: their `ttl_ms` is honoured ONLY when
 * `kind` is `'ttl'` (`agent/credits_tracker.py:178` — "honored only when kind
 * == ttl"). A `sticky` notice with a ttl filled in still waits for a human. */
export function ttlFromNotice(kind: unknown, ttlMs: unknown): number | undefined {
  if (kind !== 'ttl') return undefined
  return typeof ttlMs === 'number' && ttlMs > 0 ? ttlMs : undefined
}

/** Normalizes a gateway event into a notification, or `undefined` when the
 * event is not one. Three sources, and only three:
 *
 * - `notification.show` — the core's own out-of-band notice;
 * - `status.update {kind:"process"}` — their notification poller announcing a
 *   background process (`server.py::_notification_poller_loop`). The other four kinds are not
 *   notifications: `compressing`/`compacting`/`status` drive the compaction
 *   indicator (task 1.6.B5.14) and `lifecycle`/`warn` are recorded in
 *   §Discovered as a separate question;
 * - `browser.progress` — see `notificationFromBrowserProgress` below for why
 *   it lands here rather than in a tool card.
 *
 * `kind: "goal"` is NOT handled, and cannot be: no such kind exists in hermes
 * 0.19.0 (specs/workbench-panels.md fact 9). The goal badge reads
 * `command.dispatch {name:'goal'}` instead (task 1.6.A5), so a goal update
 * produces no notification — pinned by test, since silence is easy to break
 * by accident. */
export function notificationFromEvent(event: GatewayEvent): NotificationInput | undefined {
  if (isGatewayEventOfType(event, 'notification.show')) {
    const payload = event.payload ?? { text: '' }
    const text = typeof payload.text === 'string' ? payload.text.trim() : ''
    if (!text) return undefined
    return {
      text,
      level: toLevel(payload.level),
      ttlMs: ttlFromNotice(payload.kind, payload.ttl_ms),
      key: typeof payload.key === 'string' && payload.key ? payload.key : undefined
    }
  }

  if (isGatewayEventOfType(event, 'status.update')) {
    if (event.payload?.kind !== 'process') return undefined
    const text = typeof event.payload.text === 'string' ? event.payload.text.trim() : ''
    if (!text) return undefined
    return { text, level: 'info', ttlMs: PROCESS_NOTICE_TTL_MS }
  }

  if (isGatewayEventOfType(event, 'browser.progress')) {
    return notificationFromBrowserProgress(event.payload)
  }

  return undefined
}

/** Browser-connect progress (task 1.6.B6.10).
 *
 * The task asked for a line inside the browser tool's card. That is not
 * possible and the reason is in the payload: their only emitter is the RPC
 * `browser` with `action:"connect"` (`server.py`, `@method("browser")`), and it sends
 * `{message, level}` — no `tool_id`, no tool name. Attaching it to a card
 * would mean attaching it to an arbitrary card.
 *
 * So it becomes a toast under one fixed key: successive progress lines of the
 * same connection replace each other instead of stacking. This app does not
 * call `browser.connect` today, so nothing arrives — the handler exists so
 * that the day something does, it is visible rather than dropped. */
export function notificationFromBrowserProgress(payload: {
  message?: string
  level?: string
}): NotificationInput | undefined {
  const text = typeof payload?.message === 'string' ? payload.message.trim() : ''
  if (!text) return undefined
  return { text, level: toLevel(payload.level), key: 'browser.progress' }
}

export type NotificationAction =
  | { kind: 'show'; input: NotificationInput; receivedAt: number }
  /** The core withdrew a notice by its key (`notification.clear`). */
  | { kind: 'clear'; key: string }
  /** The user closed one toast by hand. It stays in the journal. */
  | { kind: 'dismiss'; id: number }
  /** Drops every toast whose ttl has run out. Driven by a timer in the view,
   * so the reducer itself never reads a clock. */
  | { kind: 'expire'; now: number }
  /** The journal was opened — everything in it counts as read. */
  | { kind: 'journal-opened' }

export function notificationsReducer(
  state: NotificationState,
  action: NotificationAction
): NotificationState {
  if (action.kind === 'show') {
    const { input, receivedAt } = action
    const notice: Notification = {
      id: state.nextId,
      key: input.key,
      text: input.text,
      level: input.level ?? 'info',
      ttlMs: input.ttlMs,
      receivedAt
    }

    // Dedupe by key: a repeat REPLACES, in both the toast stack and the
    // journal, keeping its place instead of jumping to the front — a counter
    // that ticks up ("осталось 3 попытки") would otherwise reorder the list
    // on every tick.
    if (notice.key !== undefined) {
      const toastIndex = state.toasts.findIndex((item) => item.key === notice.key)
      const journalIndex = state.journal.findIndex((item) => item.key === notice.key)
      if (toastIndex !== -1 || journalIndex !== -1) {
        const toasts =
          toastIndex === -1
            ? state.toasts
            : state.toasts.map((item, index) => (index === toastIndex ? notice : item))
        const journal =
          journalIndex === -1
            ? [notice, ...state.journal].slice(0, MAX_JOURNAL)
            : state.journal.map((item, index) => (index === journalIndex ? notice : item))
        return {
          toasts: toastIndex === -1 ? [...toasts, notice].slice(-MAX_TOASTS) : toasts,
          journal,
          // A replacement is not a new arrival: the unread counter must not
          // climb while one notice updates itself.
          unread: state.unread,
          nextId: state.nextId + 1
        }
      }
    }

    return {
      toasts: [...state.toasts, notice].slice(-MAX_TOASTS),
      journal: [notice, ...state.journal].slice(0, MAX_JOURNAL),
      unread: state.unread + 1,
      nextId: state.nextId + 1
    }
  }

  if (action.kind === 'clear') {
    // A key that was never shown is a no-op, and deliberately: `clear` can
    // arrive before its `show` (a recovery latch firing on a notice this
    // window never received). The journal keeps whatever it already has —
    // withdrawing a notice does not unsay it.
    const toasts = state.toasts.filter((item) => item.key !== action.key)
    return toasts.length === state.toasts.length ? state : { ...state, toasts }
  }

  if (action.kind === 'dismiss') {
    const toasts = state.toasts.filter((item) => item.id !== action.id)
    return toasts.length === state.toasts.length ? state : { ...state, toasts }
  }

  if (action.kind === 'expire') {
    const toasts = state.toasts.filter(
      (item) => item.ttlMs === undefined || item.receivedAt + item.ttlMs > action.now
    )
    return toasts.length === state.toasts.length ? state : { ...state, toasts }
  }

  // 'journal-opened'
  return state.unread === 0 ? state : { ...state, unread: 0 }
}

/** True while something on screen can still expire — the view uses this to
 * decide whether a timer is needed at all. */
export function hasExpiringToasts(state: NotificationState): boolean {
  return state.toasts.some((item) => item.ttlMs !== undefined)
}
