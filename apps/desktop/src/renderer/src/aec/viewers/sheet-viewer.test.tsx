import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { AecI18nProvider } from '../../shared/i18n'

import { SheetViewer } from './SheetViewer'
import { closeAllDocuments, openDocument } from './viewer-store'

/**
 * Задача 4.4. Ссылка на таблицу обещает лист и диапазон. Диапазон проверяется
 * чистой функцией (`locator-pure`), а здесь — единственное, что нельзя
 * проверить без разметки: открылся ли ТОТ лист.
 *
 * Строки сетки здесь не проверяются: в jsdom у прокручиваемого узла нулевая
 * высота, виртуализатор честно не рисует ни одной строки, и тест про строки
 * проверял бы jsdom, а не нас.
 */

const readSheets = vi.fn()

function show(): void {
  render(
    <AecI18nProvider>
      <SheetViewer />
    </AecI18nProvider>
  )
}

beforeEach(() => {
  closeAllDocuments()
  readSheets.mockResolvedValue({
    ok: true,
    sheets: [
      { name: 'Титул', rows: [['а']], totalRows: 1, truncated: false },
      { name: 'Ведомость', rows: [['б']], totalRows: 1, truncated: false }
    ]
  })
  Object.defineProperty(window, 'aecpilot', {
    configurable: true,
    value: { readDocument: vi.fn(), readSheets }
  })
})

afterEach(() => {
  cleanup()
})

/** Выбранный лист донор рисует вариантом `secondary`, у которого своя заливка;
 *  остальные — `ghost`, без неё. Сравнивать классы двух кнопок между собой
 *  бесполезно: они различались бы при любом выборе, в том числе неверном. */
function isActive(button: HTMLElement): boolean {
  return button.className.includes('bg-(--ui-bg-quaternary)')
}

describe('лист из ссылки', () => {
  test('открывается названный лист, а не первый', async () => {
    openDocument({ locator: { range: 'B2:C3', sheet: 'Ведомость' }, relPath: 'смета.xlsx' })
    show()

    await waitFor(() =>
      expect(isActive(screen.getByRole('button', { name: 'Ведомость' }))).toBe(true)
    )
    expect(isActive(screen.getByRole('button', { name: 'Титул' }))).toBe(false)
  })

  test('нет такого листа — остаётся первый, а не чужой', async () => {
    openDocument({ locator: { sheet: 'Кабельный журнал' }, relPath: 'смета.xlsx' })
    show()

    await waitFor(() => expect(isActive(screen.getByRole('button', { name: 'Титул' }))).toBe(true))
    expect(isActive(screen.getByRole('button', { name: 'Ведомость' }))).toBe(false)
  })

  test('ошибка разбора книги показывается, а не проглатывается', async () => {
    readSheets.mockResolvedValue({ error: 'файл повреждён', ok: false })
    openDocument({ locator: {}, relPath: 'битая.xlsx' })
    show()

    await waitFor(() => expect(screen.getByText(/файл повреждён/)).toBeTruthy())
  })
})
