import { describe, expect, it } from 'vitest'

import { parseServerKeySave, serverKeyRows } from './server-keys-pure'

describe('serverKeyRows (T35.2)', () => {
  it('merges suggested and stored names, sorted, without duplicates', () => {
    const rows = serverKeyRows(
      ['OPENAI_API_KEY', null, 'GEMINI_API_KEY'],
      ['GEMINI_API_KEY', 'MY_PROXY_KEY'],
      () => false
    )
    expect(rows.map((row) => row.envVar)).toEqual([
      'GEMINI_API_KEY',
      'MY_PROXY_KEY',
      'OPENAI_API_KEY'
    ])
    expect(rows.find((row) => row.envVar === 'GEMINI_API_KEY')?.hasKey).toBe(true)
    expect(rows.find((row) => row.envVar === 'OPENAI_API_KEY')?.hasKey).toBe(false)
  })

  it('keeps a stored key the catalogue no longer names — otherwise it cannot be removed', () => {
    expect(serverKeyRows([], ['OLD_API_KEY'], () => false)).toEqual([
      { envVar: 'OLD_API_KEY', hasKey: true, envOverrides: false }
    ])
  })

  it('drops names that are not credential variables', () => {
    expect(serverKeyRows(['lower_case', 'X', ''], ['PATH;rm'], () => false)).toEqual([])
  })

  it('reports a .env override per name', () => {
    const rows = serverKeyRows(['GEMINI_API_KEY'], [], (name) => name === 'GEMINI_API_KEY')
    expect(rows[0].envOverrides).toBe(true)
  })

  it('carries names and flags only — no field for a value', () => {
    const [row] = serverKeyRows([], ['GEMINI_API_KEY'], () => false)
    expect(Object.keys(row).sort()).toEqual(['envOverrides', 'envVar', 'hasKey'])
  })
})

describe('parseServerKeySave (T35.2)', () => {
  it('accepts a name and a trimmed key', () => {
    expect(parseServerKeySave({ envVar: ' GEMINI_API_KEY ', key: '  abc  ' })).toEqual({
      ok: true,
      envVar: 'GEMINI_API_KEY',
      key: 'abc'
    })
  })

  it('treats key null as removal', () => {
    expect(parseServerKeySave({ envVar: 'GEMINI_API_KEY', key: null })).toEqual({
      ok: true,
      envVar: 'GEMINI_API_KEY',
      key: null
    })
  })

  it('refuses an empty key instead of treating it as removal', () => {
    expect(parseServerKeySave({ envVar: 'GEMINI_API_KEY', key: '   ' })).toEqual({
      ok: false,
      error: 'emptyKey'
    })
    expect(parseServerKeySave({ envVar: 'GEMINI_API_KEY' })).toEqual({
      ok: false,
      error: 'emptyKey'
    })
  })

  it('refuses a malformed name or payload', () => {
    for (const payload of [null, {}, { envVar: 'gemini', key: 'x' }, { envVar: 42, key: 'x' }]) {
      expect(parseServerKeySave(payload)).toEqual({ ok: false, error: 'badName' })
    }
  })
})

describe('parseServerKeySave — names and values the core must not take (review 2026-10-21)', () => {
  it('refuses to store a key under a process-control variable', () => {
    for (const envVar of [
      'PATH',
      'NODE_OPTIONS',
      'PYTHONWARNINGS',
      'PYTHONPATH',
      'BROWSER',
      'LD_PRELOAD',
      'XDG_CONFIG_HOME',
      'AEC_PROVIDER_KEY_NAMES',
      'HERMES_HOME',
      'HERMES_DASHBOARD_SESSION_TOKEN'
    ]) {
      expect(parseServerKeySave({ envVar, key: 'x' }), envVar).toEqual({
        ok: false,
        error: 'badName'
      })
    }
  })

  it('keeps real core credentials that share a reserved-looking prefix', () => {
    for (const envVar of [
      'HERMES_CUSTOM_API_KEY',
      'BROWSERBASE_API_KEY',
      'MSGRAPH_CLIENT_SECRET'
    ]) {
      expect(parseServerKeySave({ envVar, key: 'x' }).ok, envVar).toBe(true)
    }
  })

  it('still removes a key stored earlier under a now-reserved name', () => {
    expect(parseServerKeySave({ envVar: 'NODE_OPTIONS', key: null })).toEqual({
      ok: true,
      envVar: 'NODE_OPTIONS',
      key: null
    })
  })

  it('refuses control characters and oversize values', () => {
    for (const key of ['ab\u0000cd', 'ab\ncd', 'ab\u007fcd', 'x'.repeat(8193)]) {
      expect(parseServerKeySave({ envVar: 'GEMINI_API_KEY', key })).toEqual({
        ok: false,
        error: 'badKey'
      })
    }
    expect(parseServerKeySave({ envVar: 'GEMINI_API_KEY', key: 'x'.repeat(8192) }).ok).toBe(true)
  })
})
