// Tasks 1.6.B5.18–B5.19 — what the palette is made of and what it does with
// the gateway's answer. The two rules worth pinning: an alias the user knows
// from the CLI has to find its command (it appears in no label), and an answer
// shape the palette does not know must send NOTHING.

import { describe, expect, it } from 'vitest'
import {
  buildPaletteItems,
  decideDispatchAction,
  filterPaletteItems,
  groupPaletteItems,
  moveHighlight,
  resolveCanonical,
  SCREENS_SECTION,
  SESSIONS_SECTION
} from './command-palette-pure'

const CATALOG = {
  pairs: [],
  categories: [
    {
      name: 'Session',
      pairs: [
        ['/compact', 'Compress the conversation'],
        ['/resume', 'Resume a previous session']
      ]
    },
    { name: 'Agent', pairs: [['/model', 'Switch the model']] }
  ],
  canon: { '/compact': '/compact', '/c': '/compact', '/model': '/model' },
  warning: ''
}

describe('buildPaletteItems', () => {
  it('keeps the gateway section order rather than sorting it', () => {
    const sections = groupPaletteItems(buildPaletteItems({ catalog: CATALOG })).map((s) => s.name)
    // Their order groups related commands; alphabetical would scatter them.
    expect(sections).toEqual(['Session', 'Agent'])
  })

  it('adds sessions and screens as their own sections', () => {
    const items = buildPaletteItems({
      catalog: CATALOG,
      sessions: [{ id: 'stored-1', title: 'Смета' }],
      screens: [{ id: 'explorer', label: 'Проводник' }]
    })
    const sections = groupPaletteItems(items).map((s) => s.name)
    expect(sections).toEqual(['Session', 'Agent', SESSIONS_SECTION, SCREENS_SECTION])
  })

  it('names an untitled session by its preview', () => {
    const items = buildPaletteItems({ sessions: [{ id: 'x', title: '', preview: 'посчитай' }] })
    expect(items[0]?.label).toBe('посчитай')
  })

  it('survives a catalog with nothing in it', () => {
    expect(buildPaletteItems({})).toEqual([])
  })
})

describe('resolveCanonical', () => {
  it('finds the command an alias stands for', () => {
    expect(resolveCanonical(CATALOG.canon, '/c')).toBe('/compact')
  })

  it('accepts a name typed without the slash', () => {
    expect(resolveCanonical(CATALOG.canon, 'c')).toBe('/compact')
  })

  it('is undefined for something the core never heard of', () => {
    expect(resolveCanonical(CATALOG.canon, '/nope')).toBeUndefined()
  })
})

describe('filterPaletteItems', () => {
  const items = buildPaletteItems({ catalog: CATALOG })

  it('matches the label and the description', () => {
    expect(filterPaletteItems(items, 'switch').map((i) => i.label)).toEqual(['/model'])
  })

  it('surfaces the canonical command for a typed alias, first', () => {
    // "/c" also matches "/compact" by substring, but the point is that an
    // alias with no textual overlap would work too.
    const found = filterPaletteItems(items, '/c', CATALOG.canon)
    expect(found[0]?.label).toBe('/compact')
  })

  it('finds an alias that shares no letters with its command', () => {
    const canon = { ...CATALOG.canon, '/zz': '/model' }
    expect(filterPaletteItems(items, '/zz', canon).map((i) => i.label)).toEqual(['/model'])
  })

  it('returns everything for a blank query', () => {
    expect(filterPaletteItems(items, '   ')).toHaveLength(3)
  })
})

describe('decideDispatchAction', () => {
  it('sends a `send` result as a normal user turn', () => {
    expect(decideDispatchAction({ type: 'send', message: 'выучи X', notice: '⚡' })).toEqual({
      kind: 'send',
      message: 'выучи X',
      notice: '⚡'
    })
  })

  it('sends a `skill` result the same way — it is a prompt too', () => {
    expect(decideDispatchAction({ type: 'skill', message: 'сделай Y', name: 'plan' })).toEqual({
      kind: 'send',
      message: 'сделай Y',
      notice: undefined
    })
  })

  it('shows the output of `exec` and `plugin`', () => {
    expect(decideDispatchAction({ type: 'exec', output: 'ok' })).toEqual({
      kind: 'output',
      text: 'ok'
    })
    expect(decideDispatchAction({ type: 'plugin', output: '' })).toEqual({
      kind: 'output',
      text: '(команда ничего не вывела)'
    })
  })

  it('reports an alias by its target rather than guessing', () => {
    expect(decideDispatchAction({ type: 'alias', target: '/model' })).toEqual({
      kind: 'alias',
      target: '/model'
    })
  })

  it('sends NOTHING for a type it does not know, and names the type', () => {
    const action = decideDispatchAction({ type: 'teleport' } as never)
    expect(action.kind).toBe('error')
    expect(action.kind === 'error' && action.message).toContain('teleport')
  })

  it('refuses a `send` with no text instead of submitting an empty turn', () => {
    expect(decideDispatchAction({ type: 'send', message: '   ' }).kind).toBe('error')
  })

  it('treats a missing answer as an error, not as silence', () => {
    expect(decideDispatchAction(undefined).kind).toBe('error')
  })
})

describe('moveHighlight', () => {
  it('wraps in both directions', () => {
    expect(moveHighlight(3, 2, 1)).toBe(0)
    expect(moveHighlight(3, 0, -1)).toBe(2)
  })

  it('stays at zero on an empty list', () => {
    expect(moveHighlight(0, 0, 1)).toBe(0)
  })
})
