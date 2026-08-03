// Pure logic behind the Ctrl+K command palette (tasks 1.6.B5.17–B5.19).
// Contract: specs/agent-sessions.md §Палитра команд.
//
// Three sources, one list: the gateway's own command registry
// (`commands.catalog` — so the palette always describes THIS build, not a list
// we maintain), the sessions of the open project, and the app's own screens.
//
// Command names stay English, exactly as the core sends them (owner decision
// B5-4): a translation table would drift from the core on every upgrade and
// there would be nothing to reconcile it against.

import type { CommandDispatchResult, CommandsCatalogResult } from '../../../shared/gateway/types'

export type PaletteItemKind = 'command' | 'session' | 'screen'

export interface PaletteItem {
  /** Unique across the whole list — the React key and the selection anchor. */
  id: string
  kind: PaletteItemKind
  /** Section heading this item belongs to. */
  section: string
  label: string
  hint?: string
  /** What running it needs: a command name, a stored session id, a screen id. */
  value: string
}

export interface PaletteSource {
  catalog?: CommandsCatalogResult
  sessions?: { id: string; title?: string; preview?: string }[]
  screens?: { id: string; label: string }[]
}

export const SESSIONS_SECTION = 'Сессии'
export const SCREENS_SECTION = 'Экраны'

/** Builds the full list, sections in the order the gateway gave them.
 *
 * Their `categories` order is not alphabetical and not stable across builds —
 * it is the order their registry declares, which groups related commands
 * together. Re-sorting it would scatter them. */
export function buildPaletteItems(source: PaletteSource): PaletteItem[] {
  const items: PaletteItem[] = []

  for (const category of source.catalog?.categories ?? []) {
    for (const pair of category.pairs ?? []) {
      const name = pair[0] ?? ''
      if (name === '') continue
      items.push({
        id: `cmd:${category.name}:${name}`,
        kind: 'command',
        section: category.name,
        label: name,
        hint: pair[1] ?? '',
        value: name
      })
    }
  }

  for (const session of source.sessions ?? []) {
    const label = (session.title ?? '').trim() || (session.preview ?? '').trim() || session.id
    items.push({
      id: `session:${session.id}`,
      kind: 'session',
      section: SESSIONS_SECTION,
      label,
      value: session.id
    })
  }

  for (const screen of source.screens ?? []) {
    items.push({
      id: `screen:${screen.id}`,
      kind: 'screen',
      section: SCREENS_SECTION,
      label: screen.label,
      value: screen.id
    })
  }

  return items
}

/** The canonical command a typed name refers to, if their `canon` map knows it.
 *
 * `canon` holds every alias AND every command's own name, lowercased, mapped to
 * `/name`. Without this, typing an alias the user knows from the CLI would find
 * nothing: the alias appears in no label. */
export function resolveCanonical(
  canon: Record<string, string> | undefined,
  typed: string
): string | undefined {
  const key = typed.trim().toLowerCase()
  if (key === '') return undefined
  const withSlash = key.startsWith('/') ? key : `/${key}`
  return canon?.[withSlash]
}

/** Filters the list by a substring of the label or the hint, case-insensitively,
 * and additionally surfaces the command a typed ALIAS resolves to. */
export function filterPaletteItems(
  items: readonly PaletteItem[],
  query: string,
  canon?: Record<string, string>
): PaletteItem[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return [...items]

  const canonical = resolveCanonical(canon, needle)
  const matched = items.filter((item) => {
    if (canonical !== undefined && item.kind === 'command' && item.value === canonical) return true
    return (
      item.label.toLowerCase().includes(needle) || (item.hint ?? '').toLowerCase().includes(needle)
    )
  })
  // The alias match goes first: the user typed a name, not a description.
  if (canonical === undefined) return matched
  const index = matched.findIndex((item) => item.kind === 'command' && item.value === canonical)
  if (index <= 0) return matched
  const [item] = matched.splice(index, 1)
  return item ? [item, ...matched] : matched
}

/** Sections in source order, empty ones dropped. */
export function groupPaletteItems(
  items: readonly PaletteItem[]
): { name: string; items: PaletteItem[] }[] {
  const order: string[] = []
  const map = new Map<string, PaletteItem[]>()
  for (const item of items) {
    if (!map.has(item.section)) {
      map.set(item.section, [])
      order.push(item.section)
    }
    map.get(item.section)?.push(item)
  }
  return order.map((name) => ({ name, items: map.get(name) ?? [] }))
}

/** What to DO with a `command.dispatch` answer.
 *
 * Five shapes their dispatcher can return, and each means something different.
 * An unrecognised `type` is an explicit outcome rather than a default: quietly
 * submitting an unexpected shape as a user turn is the failure worth avoiding
 * (the same rule `/learn` already follows, task 1.6.B3.13). */
export type PaletteAction =
  | { kind: 'send'; message: string; notice?: string }
  | { kind: 'output'; text: string }
  | { kind: 'alias'; target: string }
  | { kind: 'error'; message: string }

export function decideDispatchAction(result: CommandDispatchResult | undefined): PaletteAction {
  const type = result?.type
  if (type === 'send' || type === 'skill') {
    const message = (result?.message ?? '').trim()
    if (message === '') {
      return { kind: 'error', message: `Ядро вернуло «${type}» без текста — отправлять нечего.` }
    }
    return { kind: 'send', message, notice: result?.notice }
  }
  if (type === 'exec' || type === 'plugin') {
    return { kind: 'output', text: (result?.output ?? '').trim() || '(команда ничего не вывела)' }
  }
  if (type === 'alias') {
    const target = (result?.target ?? '').trim()
    if (target === '') return { kind: 'error', message: 'Алиас без цели — выполнять нечего.' }
    return { kind: 'alias', target }
  }
  return {
    kind: 'error',
    message: `Ядро ответило типом «${type ?? 'без типа'}» — такого палитра не знает, ничего не отправлено.`
  }
}

/** Moves the highlighted row, wrapping at both ends. */
export function moveHighlight(count: number, index: number, direction: 1 | -1): number {
  if (count === 0) return 0
  return (index + direction + count) % count
}

export const PALETTE_EMPTY_HINT = 'Ничего не нашлось — попробуйте другое слово.'
