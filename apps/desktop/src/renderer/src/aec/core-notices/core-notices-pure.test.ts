import { describe, expect, it } from 'vitest'

import type { GatewayEvent } from '../../../../shared/gateway/types'

import { coreNoticeAction } from './core-notices-pure'

function event(type: string, payload: unknown): GatewayEvent {
  return { type, payload } as unknown as GatewayEvent
}

describe('status.update (задача 4D-1)', () => {
  it('показывает lifecycle человеку — это объяснение, почему работа встала', () => {
    expect(
      coreNoticeAction(event('status.update', { kind: 'lifecycle', text: 'Кончились кредиты' }))
    ).toEqual({ kind: 'toast', text: 'Кончились кредиты' })
  })

  it('уводит warn в лог, а не в ленту', () => {
    // Деградация побочного пути: человеку тут нечего решать, а лента из таких
    // строк — это лента, которую перестают читать.
    expect(
      coreNoticeAction(event('status.update', { kind: 'warn', text: 'Сжатие не удалось' }))
    ).toEqual({ kind: 'log', text: 'Сжатие не удалось' })
  })

  it.each(['compacting', 'compacted', 'process', 'goal'])(
    'молчит про «%s» — это уже обрабатывает донор',
    (kind) => {
      // Показать второй раз то, что уже показано, хуже, чем не показать.
      expect(coreNoticeAction(event('status.update', { kind, text: 'что-то' }))).toBeNull()
    }
  )

  it('молчит на пустом тексте', () => {
    expect(coreNoticeAction(event('status.update', { kind: 'lifecycle', text: '   ' }))).toBeNull()
  })
})

describe('tool.output_risk (задача 4D-2)', () => {
  const risky = {
    tool_id: 'call-1',
    name: 'read_file',
    risk: 'high',
    findings: ['prompt_injection', 'role_switch'],
    redacted: false
  }

  it('называет инструмент и число находок', () => {
    expect(coreNoticeAction(event('tool.output_risk', risky))).toEqual({
      kind: 'risk',
      tool: 'read_file',
      findings: 2
    })
  })

  it('молчит, когда сканер ничего не нашёл', () => {
    // Уведомление, которое приходит и на чистом результате, приучает закрывать
    // его не читая — а тогда оно не сработает в тот единственный раз, когда важно.
    expect(coreNoticeAction(event('tool.output_risk', { ...risky, risk: 'low' }))).toBeNull()
    expect(coreNoticeAction(event('tool.output_risk', { ...risky, findings: [] }))).toBeNull()
  })

  it('молчит без имени инструмента — предупреждение «о чём-то» бесполезно', () => {
    expect(coreNoticeAction(event('tool.output_risk', { ...risky, name: '' }))).toBeNull()
  })
})

describe('всё остальное — не наше', () => {
  it.each([
    ['message.delta', { text: 'привет' }],
    ['tool.start', { tool_id: 't1' }],
    ['notification.show', { text: 'их собственное' }]
  ])('%s не порождает действия', (type, payload) => {
    expect(coreNoticeAction(event(type, payload))).toBeNull()
  })
})
