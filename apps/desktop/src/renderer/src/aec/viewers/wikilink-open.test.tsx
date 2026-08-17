import { beforeEach, describe, expect, test, vi } from 'vitest'

import { $openDocument, closeAllDocuments } from './viewer-store'
import { openWikiPage } from './wikilink-open'

/**
 * Задача 4.6. Переход по ссылке: существующая страница открывается там, где
 * лежит, а несуществующая заводится в `wiki/` и открывается сразу.
 *
 * Файл `.tsx`, хотя React тут ни при чём: в этом проекте расширение выбирает
 * окружение, а функции нужен `window`.
 */

const getVaultTree = vi.fn()
const createVaultFile = vi.fn()

const TREE = [
  {
    children: [{ name: 'ТП-1.md', path: 'wiki/entities/ТП-1.md', type: 'file' as const }],
    name: 'wiki',
    path: 'wiki',
    type: 'dir' as const
  }
]

beforeEach(() => {
  closeAllDocuments()
  getVaultTree.mockReset().mockResolvedValue(TREE)
  createVaultFile.mockReset().mockResolvedValue({ ok: true })
  Object.defineProperty(window, 'aecpilot', {
    configurable: true,
    value: { createVaultFile, getVaultTree }
  })
})

describe('переход по [[ссылке]]', () => {
  test('существующая страница открывается там, где лежит', async () => {
    await openWikiPage('ТП-1')

    expect($openDocument.get()?.relPath).toBe('wiki/entities/ТП-1.md')
    expect(createVaultFile).not.toHaveBeenCalled()
  })

  test('регистр в ссылке не мешает', async () => {
    await openWikiPage('тп-1')

    expect($openDocument.get()?.relPath).toBe('wiki/entities/ТП-1.md')
  })

  test('несуществующая страница заводится в wiki/ и открывается', async () => {
    await openWikiPage('Щитовая')

    expect(createVaultFile).toHaveBeenCalledWith('wiki', 'Щитовая.md')
    expect($openDocument.get()?.relPath).toBe('wiki/Щитовая.md')
  })

  test('если завести не удалось — ничего не открывается', async () => {
    createVaultFile.mockResolvedValue({ error: 'нет доступа', ok: false })

    await openWikiPage('Щитовая')

    // Открыть вкладку на несозданный файл значило бы показать пустой
    // просмотрщик с ошибкой чтения вместо внятного отказа.
    expect($openDocument.get()).toBeNull()
  })

  test('негодная цель не трогает ни дерево, ни диск', async () => {
    await openWikiPage('знак?')

    expect(getVaultTree).not.toHaveBeenCalled()
    expect(createVaultFile).not.toHaveBeenCalled()
    expect($openDocument.get()).toBeNull()
  })
})
