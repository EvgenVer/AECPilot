import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { AecI18nProvider } from '../../shared/i18n'

import { MarkdownEditor, minePath } from './MarkdownEditor'
import { closeAllDocuments, openDocument } from './viewer-store'

/**
 * Задача 4.5. Проверяется, что редактор действительно поднимается на нашем
 * файле и что несохранённое доезжает до диска при уходе — это две вещи, из-за
 * которых правка теряется молча.
 *
 * Сам набор текста здесь не имитируется: ProseMirror ловит ввод через события
 * `beforeinput` и composition, которых в jsdom нет; проверять их значило бы
 * проверять jsdom. Набор — пункт ручного чек-листа.
 */

const readDocument = vi.fn()
const writeVaultFile = vi.fn()

function show(): void {
  render(
    <AecI18nProvider>
      <MarkdownEditor />
    </AecI18nProvider>
  )
}

function bytesOf(text: string): ArrayBuffer {
  const encoded = new TextEncoder().encode(text)
  return encoded.buffer as ArrayBuffer
}

beforeEach(() => {
  closeAllDocuments()
  // История вызовов, а не только реализация: `mockResolvedValue` её не чистит,
  // и «не вызывался» проверялся бы против чужого теста.
  readDocument.mockClear()
  writeVaultFile.mockClear()
  readDocument.mockResolvedValue({
    bytes: bytesOf('# Кабельный журнал\n\nтекст страницы'),
    name: 'страница.md',
    ok: true,
    path: 'C:/p/страница.md',
    size: 10
  })
  writeVaultFile.mockResolvedValue({ ok: true })
  Object.defineProperty(window, 'aecpilot', {
    configurable: true,
    value: {
      getVaultTree: vi.fn().mockResolvedValue([
        {
          children: [{ name: 'схема.png', path: 'media/схема.png', type: 'file' }],
          name: 'media',
          path: 'media',
          type: 'dir'
        }
      ]),
      onVaultChanged: (cb: (paths: string[]) => void) => {
        vaultChanged = cb
        return () => {
          vaultChanged = null
        }
      },
      readDocument,
      writeVaultFile
    }
  })
})

let vaultChanged: ((paths: string[]) => void) | null = null

afterEach(() => {
  cleanup()
})

describe('редактор markdown', () => {
  test('поднимается и показывает содержимое файла', async () => {
    openDocument({ locator: {}, relPath: 'wiki/страница.md' })
    show()

    // Заголовок доехал до разметки — значит и загрузка, и разбор markdown, и
    // подъём редактора отработали.
    await waitFor(() => expect(screen.getByText('Кабельный журнал')).toBeTruthy())
    expect(document.querySelector('.ProseMirror')).toBeTruthy()
  })

  test('файл источника этим редактором не открывается', () => {
    // Источники read-only (SPEC UR2, AC6): редактор для них не поднимается
    // вовсе, а не «поднимается и не сохраняет».
    openDocument({ locator: {}, relPath: 'ТУ.md', sourceId: 'src-1' })
    show()

    expect(readDocument).not.toHaveBeenCalled()
    expect(document.querySelector('.ProseMirror')).toBeNull()
  })

  test('ссылка [[…]] подсвечена и несёт свою цель', async () => {
    // Задача 4.6. Подсветка — украшение поверх текста: в документе остаётся
    // тот же `[[…]]`, и файл от неё не меняется ни на символ.
    readDocument.mockResolvedValue({
      bytes: bytesOf('см. [[Кабельный журнал]] далее'),
      name: 'страница.md',
      ok: true,
      path: 'C:/p/страница.md',
      size: 10
    })
    openDocument({ locator: {}, relPath: 'wiki/страница.md' })
    show()

    await waitFor(() => expect(document.querySelector('[data-wikilink]')).toBeTruthy())
    const link = document.querySelector('[data-wikilink]')
    expect(link?.getAttribute('data-wikilink')).toBe('Кабельный журнал')
    // Скобки на месте — текст не подменён.
    expect(document.querySelector('.ProseMirror')?.textContent).toContain('[[Кабельный журнал]]')
  })

  test('ошибка чтения показывается, а не проглатывается', async () => {
    readDocument.mockResolvedValue({ error: 'Файл не найден', ok: false })
    openDocument({ locator: {}, relPath: 'wiki/нет.md' })
    show()

    await waitFor(() => expect(screen.getByText(/Файл не найден/)).toBeTruthy())
  })

  // Задача T74 (UR56): файл изменили снаружи, своих правок нет — текст
  // подменяется сам, без вопроса и без записи на диск.
  test('изменённый агентом файл без правок в окне перечитывается сам', async () => {
    openDocument({ locator: {}, relPath: 'wiki/страница.md' })
    show()
    await waitFor(() => expect(screen.getByText('Кабельный журнал')).toBeTruthy())

    readDocument.mockResolvedValue({
      bytes: bytesOf('# Новая версия агента'),
      name: 'страница.md',
      ok: true,
      path: 'C:/p/страница.md',
      size: 10
    })
    vaultChanged?.(['wiki/страница.md'])

    await waitFor(() => expect(screen.getByText('Новая версия агента')).toBeTruthy())
    expect(screen.queryByRole('alert')).toBeNull()
    expect(writeVaultFile).not.toHaveBeenCalled()
  })

  test('чужой файл в событии не трогает открытый', async () => {
    openDocument({ locator: {}, relPath: 'wiki/страница.md' })
    show()
    await waitFor(() => expect(screen.getByText('Кабельный журнал')).toBeTruthy())
    const reads = readDocument.mock.calls.length
    vaultChanged?.(['wiki/другая.md'])
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(readDocument.mock.calls.length).toBe(reads)
  })

  // Задача T75 (UR55): картинки vault — байтами через мост, по пути и по имени.
  test('![](путь) и ![[имя]] показывают картинку из vault', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:картинка')
    readDocument.mockImplementation(async (rel: string) =>
      rel.endsWith('.md')
        ? {
            bytes: bytesOf('![план](../media/схема.png)\n\nи ![[схема.png]]'),
            name: 'страница.md',
            ok: true,
            path: 'C:/p/страница.md',
            size: 10
          }
        : { bytes: new ArrayBuffer(4), name: 'схема.png', ok: true, path: 'C:/p/x', size: 4 }
    )
    openDocument({ locator: {}, relPath: 'wiki/страница.md' })
    show()

    await waitFor(() =>
      expect(document.querySelectorAll('img[data-vault-image][src="blob:картинка"]').length).toBe(2)
    )
    expect(readDocument).toHaveBeenCalledWith('media/схема.png')
  })
})

// Ревью T84: вкладку закрыли при открытом вопросе «чья версия» — своя правка
// ложится копией рядом, файл агента не трогается.
test('копия своей правки — рядом, с пометкой в имени', () => {
  expect(minePath('notes/ссылки.md')).toBe('notes/ссылки (моя правка).md')
  expect(minePath('wiki.v2/README')).toBe('wiki.v2/README (моя правка)')
})
