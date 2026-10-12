// Задача 3L.6: что предложить файлу — по его строке описи.

import { describe, expect, it } from 'vitest'

import type { InventoryFile } from '../../../../shared/ipc'
import { documentActions, waitingScans } from './document-actions'

const file = (patch: Partial<InventoryFile> = {}): InventoryFile => ({
  errors: [],
  graph: 'none',
  index: 'indexed',
  reason: null,
  rel_path: 'a.pdf',
  scans: null,
  size: 1,
  source_id: 's1',
  ...patch
})

describe('documentActions (3L.6)', () => {
  it('в описи — «Индексировать» в любом состоянии и «Убрать»', () => {
    for (const index of ['indexed', 'stale', 'missing', 'failed'] as const) {
      expect(documentActions(file({ index }), false)).toEqual(['index', 'exclude'])
    }
  })

  it('ждут сканы — «Продолжить распознавание» вместо «Индексировать»', () => {
    const partial = file({
      index: 'partial',
      scans: { done: 3, error: null, failed: 1, total: 10 }
    })
    expect(waitingScans(partial)).toBe(6)
    expect(documentActions(partial, false)).toEqual(['continueScans', 'exclude'])
  })

  it('сбойные страницы прогон не повторяет — «продолжать» нечего', () => {
    const failedOnly = file({
      index: 'partial',
      scans: { done: 9, error: 'x', failed: 1, total: 10 }
    })
    expect(documentActions(failedOnly, false)).toEqual(['index', 'exclude'])
  })

  it('убранный или ещё не сканированный — только «Индексировать»', () => {
    expect(documentActions(file(), true)).toEqual(['index'])
    expect(documentActions(null, false)).toEqual(['index'])
  })

  it('формат не читается — индексировать нечего, убрать из описи можно', () => {
    expect(documentActions(file({ index: 'skipped', reason: 'unsupported' }), false)).toEqual([
      'exclude'
    ])
  })
})
