/** Composer logic that has nothing to do with the DOM (task 1.6.8): prompt
 * history, the slash-command trigger, and how the gateway's answers read.
 * Kept pure so the rules are pinned by node tests, and the component stays a
 * thin shell over them — same split the rest of this chat already uses
 * (`tool-label-pure`, `reasoning-meta-pure`).
 *
 * THE SEND QUEUE USED TO LIVE HERE and is gone since task 1.6.B5.26. Up to
 * hermes 0.18.0 a prompt sent mid-turn was rejected ("session busy") and every
 * client had to hold it itself. 0.19.0 replaced that with a policy the CORE
 * applies (`display.busy_input_mode`: queue / steer / interrupt), so a queue on
 * this side would be a second mechanism stacked on the first — two places
 * deciding when a message leaves, disagreeing under load. What is left is
 * reading their answer out loud. */

/** Where history navigation currently sits: `undefined` = not in history, the
 * user is looking at their own draft. `0` is the most recent sent prompt. */
export type HistoryCursor = number | undefined

/**
 * Moves through previously sent prompts, newest first.
 *
 * `history` is oldest-first (the order they were sent). Returns the new cursor
 * and the text to put in the composer, or `undefined` when the move is not
 * possible — the caller then leaves the draft alone, which is what makes Up at
 * the oldest entry a no-op instead of a wrap-around to the newest.
 *
 * Stepping Down past the newest entry leaves history and restores `draft` —
 * whatever the user had typed before they started walking back.
 */
export function navigateHistory(
  history: readonly string[],
  cursor: HistoryCursor,
  direction: 'older' | 'newer',
  draft: string
): { cursor: HistoryCursor; text: string } | undefined {
  if (history.length === 0) return undefined

  if (direction === 'older') {
    const next = cursor === undefined ? 0 : cursor + 1
    if (next >= history.length) return undefined
    return { cursor: next, text: history[history.length - 1 - next] as string }
  }

  if (cursor === undefined) return undefined
  if (cursor === 0) return { cursor: undefined, text: draft }
  const next = cursor - 1
  return { cursor: next, text: history[history.length - 1 - next] as string }
}

/** Appends a sent prompt to the history, skipping an exact repeat of the last
 * one — walking back through five identical "продолжай" is not history, it is
 * noise. Blank text never enters. */
export function rememberPrompt(history: readonly string[], text: string): string[] {
  const trimmed = text.trim()
  if (trimmed.length === 0) return [...history]
  if (history[history.length - 1] === trimmed) return [...history]
  return [...history, trimmed]
}

/**
 * The text to ask `complete.slash` about, or `undefined` when the composer is
 * not in a slash command at all.
 *
 * A slash command is only a slash command at the very start of the draft —
 * `/help` yes, `см. /help` no — which matches the gateway's own rule
 * (`complete.slash` returns nothing unless the text starts with "/"). Once a
 * space follows the command word the completion list is no longer about the
 * command name, so it stops there too.
 */
export function slashQuery(draft: string): string | undefined {
  if (!draft.startsWith('/')) return undefined
  if (/\s/.test(draft)) return undefined
  return draft
}

/** Replaces the typed command with the chosen completion, leaving a trailing
 * space so the user can keep typing arguments. */
export function applySlashCompletion(completion: string): string {
  return `${completion} `
}

/**
 * The `@`-reference being typed, and where it sits in the draft (task 1.6.A3).
 *
 * Unlike a slash command, a reference is valid anywhere in the text — "посмотри
 * @file:src/main.ts и скажи" is the normal case — so this finds the LAST `@`
 * that still belongs to the word under the caret.
 *
 * A reference ends at whitespace. That is their rule too: `@folder:src/` is one
 * token, and the space after it is what tells the gateway the reference is
 * finished. An `@` immediately after a non-space character is not a reference
 * (an e-mail address is the everyday case), so it is skipped.
 */
export function referenceQuery(
  draft: string,
  caret: number
): { word: string; start: number; end: number } | undefined {
  const upToCaret = draft.slice(0, caret)
  const at = upToCaret.lastIndexOf('@')
  if (at === -1) return undefined

  const before = at === 0 ? '' : draft[at - 1]
  if (before !== '' && !/\s/.test(before)) return undefined

  // Whitespace between the `@` and the caret means the reference already ended.
  const word = upToCaret.slice(at)
  if (/\s/.test(word)) return undefined

  // The token may continue past the caret if the user went back to edit it.
  let end = caret
  while (end < draft.length && !/\s/.test(draft[end] as string)) end += 1
  return { word, start: at, end }
}

/** Puts a chosen reference into the draft, replacing the token being typed.
 *
 * No trailing space is added for a completion that is itself a prefix (their
 * `@file:` / `@folder:` hints, and any directory, which they mark with a
 * trailing `/`): the user's next keystroke continues the same reference, and a
 * space there would have ended it. */
export function applyReferenceCompletion(
  draft: string,
  range: { start: number; end: number },
  completion: string
): { text: string; caret: number } {
  const continues = completion.endsWith(':') || completion.endsWith('/')
  // Don't add a space in front of one that is already there — completing a
  // reference in the middle of a sentence would otherwise leave a double gap.
  const spaceFollows = /\s/.test(draft[range.end] ?? '')
  const inserted = continues || spaceFollows ? completion : `${completion} `
  return {
    text: draft.slice(0, range.start) + inserted + draft.slice(range.end),
    caret: range.start + inserted.length
  }
}

/** Moves the highlighted row in an open completion list, wrapping at both
 * ends — a short list is faster to cycle than to walk. */
export function moveSelection(count: number, index: number, direction: 1 | -1): number {
  if (count === 0) return 0
  return (index + direction + count) % count
}

/** How to report what `prompt.submit` did with the message (task 1.6.B5.26).
 *
 * Three answers, and two of them are easy to mistake for failures. `queued`
 * and `steered` mean the message was ACCEPTED — the core applied the user's own
 * `display.busy_input_mode` policy — so saying nothing (as for `streaming`)
 * would leave the user watching a message that appears to have gone nowhere,
 * while an error would be a lie. */
export function describeSubmitOutcome(status: string | undefined): string | undefined {
  if (status === 'queued') return 'Сообщение принято — уйдёт следующим ходом.'
  if (status === 'steered')
    return 'Сообщение влито в идущий ход — агент увидит его на следующем шаге.'
  return undefined
}

/** How to report `session.steer`'s answer (task 1.6.B5.16). `rejected` is not
 * an error: the agent declined the note, usually because there is no tool
 * boundary left in this turn to attach it to. */
export function describeSteerOutcome(status: string | undefined): string {
  if (status === 'queued') return 'Подсказка принята — агент увидит её на следующем шаге.'
  if (status === 'rejected') return 'Агент не принял подсказку — сейчас её некуда вставить.'
  return `Шлюз ответил непонятным статусом: ${status ?? 'пусто'}`
}

/** True for the gateway's 4010 — this agent has no `steer` at all.
 *
 * Worth telling apart from every other failure: it will not change for the
 * life of the session, so the control is retired rather than left to fail on
 * each press. */
export function isSteerUnsupported(message: string): boolean {
  return /4010|does not support steer/i.test(message)
}
