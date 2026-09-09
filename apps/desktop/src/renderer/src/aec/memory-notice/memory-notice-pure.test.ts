// Задача 5.1б — три причины отказа второго слоя памяти.
//
// Ответы ядра здесь НЕ ВЫДУМАНЫ: сняты прогоном их же
// `_discover_memory_provider_statuses()` на профилях, собранных под каждую
// причину (см. шапку `memory-notice-pure.ts`). Поэтому «нет пакета» выглядит
// именно так, как выглядит у них, а не так, как удобно тесту.

import { describe, expect, it } from 'vitest'

import type { GatewayEvent } from '../../../../shared/gateway/types'
import { MEMORY_TOOL_FAILURES, memoryLayerVerdict, memoryToolFailure } from './memory-notice-pure'

/** Живой ответ: пакет на месте, ключей нет. */
const NEEDS_CONFIG = {
  name: 'mem0',
  available: false,
  configured: false,
  status: 'needs_config',
  setup: { dependencies_installed: true }
}

/** Живой ответ провайдера, чей пакет не установлен (замерено на `honcho`,
 *  `hindsight`, `byterover`, `supermemory` — форма у всех одна). */
const NO_PACKAGE = {
  name: 'mem0',
  available: false,
  configured: true,
  status: 'unavailable',
  setup: { dependencies_installed: false }
}

/** Живой ответ после записи наших четырёх ключей. */
const READY = {
  name: 'mem0',
  available: true,
  configured: true,
  status: 'ready',
  setup: { dependencies_installed: true }
}

const payload = (row: object) => ({ active: 'mem0', providers: [row], builtin_files: {} })

const toolComplete = (name: string, result: unknown): GatewayEvent =>
  ({
    type: 'tool.complete',
    payload: { tool_id: 't1', name, args: {}, duration_s: 0.1, result }
  }) as GatewayEvent

describe('причина 1: не установлен пакет', () => {
  it('распознаётся по их же признаку, а не по тексту описания', () => {
    expect(memoryLayerVerdict(payload(NO_PACKAGE))).toEqual({ kind: 'down', reason: 'package' })
  })

  it('тот же статус БЕЗ признака зависимостей не выдаётся за отсутствие пакета', () => {
    // Сказать «поставьте пакет» про установленный пакет — отправить человека
    // чинить не то. Причина, которой мы не знаем, так и называется.
    const row = { ...NO_PACKAGE, setup: { dependencies_installed: true } }

    expect(memoryLayerVerdict(payload(row))).toEqual({ kind: 'down', reason: 'unknown' })
  })
})

describe('причина 2: нет ключа / не настроено', () => {
  it('пустой профиль с выбранным провайдером — отказ по настройке', () => {
    expect(memoryLayerVerdict(payload(NEEDS_CONFIG))).toEqual({ kind: 'down', reason: 'config' })
  })

  it('провайдер выбран, а ядро его не знает', () => {
    expect(memoryLayerVerdict({ active: 'mem0', providers: [] })).toEqual({
      kind: 'down',
      reason: 'missing'
    })
  })
})

describe('причина 3: недоступен endpoint', () => {
  it('В СТАТУСЕ ЕЁ НЕТ — и это замер, а не упущение теста', () => {
    // Профиль с `openai_base_url: http://127.0.0.1:9/v1` даёт РОВНО тот же
    // ответ, что рабочий: сеть при опросе не трогается. Если однажды ядро
    // начнёт её проверять, этот тест покраснеет — и правильно сделает.
    expect(memoryLayerVerdict(payload(READY))).toEqual({ kind: 'ok' })
  })

  it('ловится отказом инструмента памяти, где текст пишет ядро', () => {
    const event = toolComplete(
      'mem0_search',
      JSON.stringify({
        error:
          'Mem0 backend not initialized: Connection refused. Check that qdrant is running and reachable.'
      })
    )

    expect(memoryToolFailure(event)).toContain('Check that qdrant is running')
  })

  it('срыв после нескольких неудач подряд — тоже отказ слоя', () => {
    const event = toolComplete('mem0_add', {
      error:
        'Mem0 temporarily unavailable (multiple consecutive failures). Will retry automatically.'
    })

    expect(memoryToolFailure(event)).toContain('Mem0 temporarily unavailable')
  })
})

describe('чего сообщение НЕ делает', () => {
  it('молчит, когда провайдер не выбран: это решение, а не отказ', () => {
    expect(memoryLayerVerdict({ active: '', providers: [] })).toEqual({ kind: 'off' })
    expect(memoryLayerVerdict(null)).toEqual({ kind: 'off' })
  })

  it('молчит, когда слой поднялся', () => {
    expect(memoryLayerVerdict(payload(READY))).toEqual({ kind: 'ok' })
  })

  it('не считает отказом успешный ход инструмента памяти', () => {
    expect(memoryToolFailure(toolComplete('mem0_search', '{"results": []}'))).toBeNull()
  })

  it('не встревает в отказ ЧУЖОГО инструмента', () => {
    // Иначе любая ошибка любого инструмента объявлялась бы поломкой памяти.
    const event = toolComplete('shell', JSON.stringify({ error: 'Mem0 backend not initialized' }))

    expect(memoryToolFailure(event)).toBeNull()
  })
})

describe('строки-приметы принадлежат ядру', () => {
  it('обе всё ещё стоят в их плагине', async () => {
    // Совпадение по тексту чужого кода живёт ровно до его правки. Пусть
    // покраснеет здесь.
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const source = readFileSync(
      join(__dirname, '../../../../../../../runtime/.hermes-src/plugins/memory/mem0/__init__.py'),
      'utf-8'
    )

    for (const marker of MEMORY_TOOL_FAILURES) expect(source).toContain(marker)
  })
})
