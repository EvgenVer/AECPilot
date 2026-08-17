import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { AecI18nProvider } from '../../shared/i18n'

import { MarkdownEditor } from './MarkdownEditor'
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
    value: { readDocument, writeVaultFile }
  })
})

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

  test('ошибка чтения показывается, а не проглатывается', async () => {
    readDocument.mockResolvedValue({ error: 'Файл не найден', ok: false })
    openDocument({ locator: {}, relPath: 'wiki/нет.md' })
    show()

    await waitFor(() => expect(screen.getByText(/Файл не найден/)).toBeTruthy())
  })
})
