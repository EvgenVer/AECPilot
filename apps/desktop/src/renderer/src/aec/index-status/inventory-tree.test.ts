import { describe, expect, it } from 'vitest'

import type { InventoryFile } from '../../../../shared/ipc'
import { buildInventoryTree, canRetry, type InventoryFolder, isProblem } from './inventory-tree'

const file = (rel_path: string, patch: Partial<InventoryFile> = {}): InventoryFile => ({
  errors: [],
  graph: 'none',
  index: 'indexed',
  reason: null,
  rel_path,
  scans: null,
  size: 1,
  source_id: 's',
  ...patch
})

const folder = (node: InventoryFolder, name: string): InventoryFolder =>
  node.children.find((c): c is InventoryFolder => c.kind === 'folder' && c.name === name)!

describe('buildInventoryTree (3J.10)', () => {
  const files = [
    file('Изыскания/ИГИ/отчёт.pdf', { index: 'failed' }),
    file('Изыскания/ИГДИ.pdf'),
    file('задание.pdf'),
    file('план.dwg', { index: 'skipped', reason: 'unsupported' }),
    file('чужой.pdf', { source_id: 'other' })
  ]

  it('корень — источник по имени, папки раньше файлов, счётчики по глубине', () => {
    const [root] = buildInventoryTree(files, [{ id: 's', name: 'Нагатинская' }])

    expect(root.name).toBe('Нагатинская')
    expect(root.children.map((c) => c.name)).toEqual(['Изыскания', 'задание.pdf', 'план.dwg'])
    expect([root.files, root.problems]).toEqual([4, 2])
    const surveys = folder(root, 'Изыскания')
    expect([surveys.files, surveys.problems, surveys.rel]).toEqual([2, 1, 'Изыскания'])
    expect(folder(surveys, 'ИГИ').rel).toBe('Изыскания/ИГИ')
  })

  it('«только проблемные» оставляет их и папки на пути к ним', () => {
    const [root] = buildInventoryTree(files, [{ id: 's', name: 'Н' }], true)

    expect(root.children.map((c) => c.name)).toEqual(['Изыскания', 'план.dwg'])
    expect(folder(root, 'Изыскания').children.map((c) => c.name)).toEqual(['ИГИ'])
  })

  it('файл неизвестного источника не попадает никуда', () => {
    const roots = buildInventoryTree(files, [{ id: 's', name: 'Н' }])
    expect(roots).toHaveLength(1)
    expect(roots[0].files).toBe(4)
  })
})

describe('isProblem / canRetry', () => {
  it('проблема — всё, что не в индексе, с ошибкой или с нечитаемой страницей', () => {
    expect(isProblem(file('a'))).toBe(false)
    expect(isProblem(file('a', { index: 'stale' }))).toBe(true)
    // 3L.4: часть сканов ещё не в индексе — тоже «требует внимания».
    expect(
      isProblem(file('a', { index: 'partial', scans: { done: 1, error: null, failed: 0, total: 3 } }))
    ).toBe(true)
    expect(isProblem(file('a', { scans: { done: 4, error: 'x', failed: 1, total: 5 } }))).toBe(true)
    expect(
      isProblem(
        file('a', { errors: [{ at: '', code: 'provider_limit', detail: '', stage: 'graph' }] })
      )
    ).toBe(true)
  })

  it('повторить можно только то, что индекс способен взять', () => {
    expect(
      ['failed', 'stale', 'missing'].map((index) =>
        canRetry(file('a', { index: index as InventoryFile['index'] }))
      )
    ).toEqual([true, true, true])
    expect(canRetry(file('a', { index: 'skipped' }))).toBe(false)
    expect(canRetry(file('a'))).toBe(false)
  })
})
