// Task 1.6.9 — the picker's pure logic. Everything here is a decision the UI
// would otherwise make silently: which models are offered, which knobs are
// shown, and when a switch is refused before it is attempted.

import { describe, expect, it } from 'vitest'
import {
  REASONING_LEVELS,
  isReasoningLevel,
  knobsFor,
  modelSwitchBlockedReason,
  pickerSummary,
  reasoningLabel,
  toModelRows
} from './model-picker-pure'
import type { ModelOptionsResult } from '../../../shared/gateway/types'

const OPTIONS: ModelOptionsResult = {
  model: 'opus',
  provider: 'anthropic',
  providers: [
    {
      slug: 'anthropic',
      name: 'Anthropic',
      authenticated: true,
      models: ['opus', 'haiku'],
      capabilities: {
        opus: { fast: true, reasoning: true },
        haiku: { fast: false, reasoning: false }
      }
    },
    {
      slug: 'deepseek',
      name: 'DeepSeek',
      authenticated: false,
      auth_type: 'api_key',
      key_env: 'DEEPSEEK_API_KEY',
      models: ['deepseek-chat']
    }
  ]
}

describe('toModelRows', () => {
  it('flattens providers in the order the gateway sent them', () => {
    const rows = toModelRows(OPTIONS, 'opus')
    expect(rows.map((r) => r.model)).toEqual(['opus', 'haiku', 'deepseek-chat'])
    expect(rows[0]).toMatchObject({ current: true, providerName: 'Anthropic' })
  })

  it('shows an unconfigured provider instead of hiding it, and says why', () => {
    const row = toModelRows(OPTIONS, 'opus').find((r) => r.providerSlug === 'deepseek')
    expect(row?.disabledReason).toBe('нужен ключ DEEPSEEK_API_KEY')
  })

  it('disables a model the account may not select', () => {
    const rows = toModelRows(
      {
        providers: [
          {
            slug: 'nous',
            name: 'Nous',
            authenticated: true,
            models: ['free-one', 'paid-one'],
            unavailable_models: ['paid-one']
          }
        ]
      },
      ''
    )
    expect(rows[0].disabledReason).toBeUndefined()
    expect(rows[1].disabledReason).toBe('недоступна на текущем тарифе')
  })

  it('treats a missing capabilities map as unknown, not as "supports nothing"', () => {
    // An older gateway omits it entirely; assuming false would hide both knobs
    // on every model.
    const rows = toModelRows(
      { providers: [{ slug: 'x', name: 'X', authenticated: true, models: ['m'] }] },
      ''
    )
    expect(rows[0]).toMatchObject({ supportsFast: true, supportsReasoning: true })
  })

  it('falls back to the reported current model when the caller has none yet', () => {
    expect(toModelRows(OPTIONS, '').find((r) => r.current)?.model).toBe('opus')
  })

  it('survives an empty answer', () => {
    expect(toModelRows({}, '')).toEqual([])
  })
})

describe('knobsFor', () => {
  it('hides the knobs a model does not support', () => {
    const rows = toModelRows(OPTIONS, 'opus')
    expect(knobsFor(rows, 'haiku')).toEqual({ fast: false, reasoning: false })
    expect(knobsFor(rows, 'opus')).toEqual({ fast: true, reasoning: true })
  })

  it('offers both for a model absent from the catalogue', () => {
    expect(knobsFor(toModelRows(OPTIONS, 'opus'), 'custom-endpoint-model')).toEqual({
      fast: true,
      reasoning: true
    })
  })
})

describe('modelSwitchBlockedReason', () => {
  it('blocks during a turn — their side answers 4009 there', () => {
    expect(modelSwitchBlockedReason({ connected: true, streaming: true })).toBe(
      'идёт ход — сначала остановите его'
    )
  })

  it('blocks with no gateway', () => {
    expect(modelSwitchBlockedReason({ connected: false, streaming: false })).toBe(
      'нет связи со шлюзом'
    )
  })

  it('allows an idle connected session', () => {
    expect(modelSwitchBlockedReason({ connected: true, streaming: false })).toBeUndefined()
  })
})

describe('reasoning levels', () => {
  it('matches the levels their parser accepts', () => {
    expect(REASONING_LEVELS).toEqual(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
    expect(isReasoningLevel('max')).toBe(true)
    expect(isReasoningLevel('turbo')).toBe(false)
  })

  it('does not confuse "provider default" with "thinking off"', () => {
    expect(reasoningLabel('')).toBe('по умолчанию')
    expect(reasoningLabel('none')).toBe('без рассуждений')
  })

  it('passes an unknown level through rather than inventing a label', () => {
    expect(reasoningLabel('ultra')).toBe('ultra')
  })
})

describe('pickerSummary', () => {
  it('names only what was actually chosen', () => {
    expect(pickerSummary({ model: 'opus', reasoningEffort: '', fast: false })).toBe('opus')
    expect(pickerSummary({ model: 'opus', reasoningEffort: 'high', fast: true })).toBe(
      'opus · высокие · быстрый'
    )
  })

  it('says so when there is no model yet', () => {
    expect(pickerSummary({ model: '', reasoningEffort: '', fast: false })).toBe('модель не выбрана')
  })
})
