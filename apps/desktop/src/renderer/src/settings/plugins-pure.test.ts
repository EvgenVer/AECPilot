import { describe, expect, it } from 'vitest'
import {
  groupPlugins,
  needsEnableConfirmation,
  normalizePluginState,
  PLUGIN_STATE_LABELS,
  toPluginEntries,
  type PluginState
} from './plugins-pure'

const rows = [
  { name: 'a', version: '1.0', description: 'bundled one', source: 'bundled', status: 'enabled' },
  { name: 'b', version: '', description: '', source: 'bundled', status: 'not enabled' },
  { name: 'c', version: '2.0', description: 'mine', source: 'user', status: 'disabled' }
]

describe('normalizePluginState', () => {
  // Measured by the probe: three states, and "not enabled" (never touched) is
  // NOT the same as "disabled" (switched off on purpose).
  it('keeps all three of their states apart', () => {
    expect(normalizePluginState('enabled')).toBe('enabled')
    expect(normalizePluginState('disabled')).toBe('disabled')
    expect(normalizePluginState('not enabled')).toBe('untouched')
  })

  it('does not guess for a status it has not seen', () => {
    expect(normalizePluginState('quantum')).toBe('unknown')
    expect(normalizePluginState(undefined)).toBe('unknown')
  })

  it('labels every state', () => {
    const all: PluginState[] = ['enabled', 'disabled', 'untouched', 'unknown']
    for (const state of all) expect(PLUGIN_STATE_LABELS[state]).toBeTruthy()
  })
})

describe('toPluginEntries', () => {
  it('maps the gateway rows', () => {
    expect(toPluginEntries(rows)).toEqual([
      { name: 'a', version: '1.0', description: 'bundled one', bundled: true, state: 'enabled' },
      { name: 'b', version: '', description: '', bundled: true, state: 'untouched' },
      { name: 'c', version: '2.0', description: 'mine', bundled: false, state: 'disabled' }
    ])
  })

  it('drops nameless rows and survives an empty answer', () => {
    expect(
      toPluginEntries([{ name: '', version: '', description: '', source: '', status: '' }])
    ).toEqual([])
    expect(toPluginEntries(undefined)).toEqual([])
  })
})

describe('groupPlugins', () => {
  it('splits user plugins from bundled ones, and the counts match the groups', () => {
    const groups = groupPlugins(toPluginEntries(rows))
    expect(groups.user.map((entry) => entry.name)).toEqual(['c'])
    expect(groups.bundled.map((entry) => entry.name)).toEqual(['a', 'b'])
    expect(groups.user.length + groups.bundled.length).toBe(rows.length)
  })
})

describe('needsEnableConfirmation', () => {
  it('asks before enabling third-party code, and never when disabling', () => {
    const [bundled, , user] = toPluginEntries(rows)
    expect(needsEnableConfirmation(user, true)).toBe(true)
    expect(needsEnableConfirmation(user, false)).toBe(false)
    expect(needsEnableConfirmation(bundled, true)).toBe(false)
  })
})
