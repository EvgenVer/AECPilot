import { describe, expect, it } from 'vitest'
import {
  PROVIDER_STATUS_LABELS,
  runtimeVerdict,
  toProviderRows,
  type ProviderConnection
} from './providers-pure'

function options(providers: unknown[], extra: Record<string, unknown> = {}) {
  return { providers, ...extra } as Parameters<typeof toProviderRows>[0]
}

describe('toProviderRows', () => {
  it('reports the three states apart', () => {
    const rows = toProviderRows(
      options([
        { slug: 'openai', name: 'OpenAI', authenticated: true, models: ['gpt-5'] },
        { slug: 'nous', name: 'Nous', authenticated: true, warning: 'free tier expires soon' },
        {
          slug: 'xai',
          name: 'xAI',
          authenticated: false,
          auth_type: 'api_key',
          key_env: 'XAI_API_KEY'
        }
      ])
    )
    expect(rows.map((row) => row.connection)).toEqual<ProviderConnection[]>([
      'connected',
      'warned',
      'disconnected'
    ])
  })

  it('shows their warning text verbatim on a warned provider', () => {
    const [row] = toProviderRows(
      options([{ slug: 'nous', authenticated: true, warning: 'free tier expires soon' }])
    )
    expect(row.hint).toBe('free tier expires soon')
  })

  it('names the env var an api_key provider needs', () => {
    const [row] = toProviderRows(
      options([{ slug: 'xai', authenticated: false, auth_type: 'api_key', key_env: 'XAI_API_KEY' }])
    )
    expect(row.hint).toContain('XAI_API_KEY')
  })

  it('says an oauth/cli provider is activated outside the app rather than offering a field', () => {
    const rows = toProviderRows(
      options([
        { slug: 'copilot', authenticated: false, auth_type: 'cli' },
        { slug: 'claude', authenticated: false, auth_type: 'oauth' }
      ])
    )
    expect(rows[0].hint).toContain('вне приложения')
    expect(rows[1].hint).toContain('вне приложения')
  })

  it('gives a connected provider no hint at all', () => {
    const [row] = toProviderRows(options([{ slug: 'openai', authenticated: true }]))
    expect(row.hint).toBeUndefined()
  })

  // The gateway asked for canonical_order; re-sorting here would make this the
  // only hermes surface with a different provider order.
  it('preserves the order the gateway sent', () => {
    const rows = toProviderRows(options([{ slug: 'zzz' }, { slug: 'aaa' }, { slug: 'mmm' }]))
    expect(rows.map((row) => row.slug)).toEqual(['zzz', 'aaa', 'mmm'])
  })

  it('marks the current provider from either signal', () => {
    const byFlag = toProviderRows(options([{ slug: 'openai', is_current: true }]))
    const byField = toProviderRows(options([{ slug: 'openai' }], { provider: 'OpenAI' }))
    expect(byFlag[0].current).toBe(true)
    expect(byField[0].current).toBe(true)
  })

  it('treats a missing authenticated flag as connected, not as broken', () => {
    const [row] = toProviderRows(options([{ slug: 'custom', models: ['local-model'] }]))
    expect(row.connection).toBe('connected')
    expect(row.modelCount).toBe(1)
  })

  it('survives an empty catalogue', () => {
    expect(toProviderRows(options([]))).toEqual([])
    expect(toProviderRows({} as Parameters<typeof toProviderRows>[0])).toEqual([])
  })
})

describe('runtimeVerdict', () => {
  it('is silent when the runtime resolves', () => {
    expect(runtimeVerdict({ ok: true, provider: 'openai' })).toBeUndefined()
    expect(runtimeVerdict(undefined)).toBeUndefined()
  })

  it('names the provider and repeats the core error', () => {
    expect(
      runtimeVerdict({ ok: false, provider: 'xai', error: 'No usable credentials found for xai.' })
    ).toEqual({ provider: 'xai', message: 'No usable credentials found for xai.' })
  })

  it('still says something when the core gave no error text', () => {
    const verdict = runtimeVerdict({ ok: false })
    expect(verdict?.message).not.toBe('')
    expect(verdict?.provider).not.toBe('')
  })
})

describe('PROVIDER_STATUS_LABELS', () => {
  it('has a label for every state', () => {
    const states: ProviderConnection[] = ['connected', 'warned', 'disconnected']
    for (const state of states) expect(PROVIDER_STATUS_LABELS[state]).toBeTruthy()
  })
})
