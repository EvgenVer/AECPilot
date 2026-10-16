import { describe, expect, it } from 'vitest'

import { MEM0_DISTRIBUTIONS, distributionsInstalled } from './core-packages-pure'

describe('distributionsInstalled (T20.10)', () => {
  it('пакеты Mem0 стоят — да, по именам каталогов dist-info', () => {
    const entries = [
      'mem0',
      'mem0ai-2.0.10.dist-info',
      'qdrant_client',
      'qdrant_client-1.19.0.dist-info',
      'httpx-0.28.1.dist-info'
    ]
    expect(distributionsInstalled(entries, MEM0_DISTRIBUTIONS)).toBe(true)
  })

  it('нет одного — нет: модуль без dist-info пакетом не считается', () => {
    expect(
      distributionsInstalled(['mem0ai-2.0.10.dist-info', 'qdrant_client'], MEM0_DISTRIBUTIONS)
    ).toBe(false)
    expect(distributionsInstalled([], MEM0_DISTRIBUTIONS)).toBe(false)
  })

  it('похожее имя — не тот пакет', () => {
    expect(
      distributionsInstalled(
        ['mem0ai_extra-1.0.dist-info', 'qdrant_client-1.19.0.dist-info'],
        MEM0_DISTRIBUTIONS
      )
    ).toBe(false)
  })
})
