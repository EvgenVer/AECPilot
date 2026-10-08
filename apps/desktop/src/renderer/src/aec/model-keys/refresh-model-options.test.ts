// 7.3.1 (приёмка 2026-10-08): после ключа из окна первого запуска «Изменить»
// показывал список моделей, снятый до ключа. Конец скрытого перезапуска ядра
// приходит событием `setup.ready` — по нему кэш списка моделей сбрасывается.
import { describe, expect, it, vi } from 'vitest'

import { refreshModelOptionsOnSetupReady } from './refresh-model-options'

function bridge() {
  const handlers = new Map<string, () => void>()
  return {
    on: (type: string, handler: () => void) => {
      handlers.set(type, handler)
      return () => handlers.delete(type)
    },
    fire: (type: string) => handlers.get(type)?.()
  }
}

describe('кэш списка моделей после ключа', () => {
  it('сбрасывается по `setup.ready`', () => {
    const source = bridge()
    const cache = { invalidateQueries: vi.fn(() => Promise.resolve()) }
    refreshModelOptionsOnSetupReady(source, cache)
    source.fire('setup.ready')
    expect(cache.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['model-options'] })
  })

  it('по другим событиям не трогается', () => {
    const source = bridge()
    const cache = { invalidateQueries: vi.fn(() => Promise.resolve()) }
    refreshModelOptionsOnSetupReady(source, cache)
    source.fire('message.complete')
    expect(cache.invalidateQueries).not.toHaveBeenCalled()
  })
})
