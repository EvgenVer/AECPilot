import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { AecI18nProvider } from '../../shared/i18n'

import { DocumentViewer } from './DocumentViewer'
import { $openDocument, closeAllDocuments, openDocument } from './viewer-store'

/**
 * Задача 4.1. Полоса вкладок проверяется отдельно от просмотрщиков: она общая
 * для всех форматов, и её поведение — единственное, что связывает открытые
 * документы между собой.
 *
 * Сам PDF-просмотрщик замокан: он тянет pdf.js вместе с воркером, а к вкладкам
 * это отношения не имеет.
 */
vi.mock('./PdfViewer', () => ({
  PdfViewer: (): React.JSX.Element => <div data-testid="pdf" />
}))

function show(): void {
  render(
    <AecI18nProvider>
      <DocumentViewer />
    </AecI18nProvider>
  )
}

beforeEach(() => {
  closeAllDocuments()
})

afterEach(() => {
  // В dom-проекте автоочистки нет: без этого разметка прошлого теста остаётся
  // на экране и следующий тест находит СВОИ вкладки вперемешку с чужими.
  cleanup()
})

describe('полоса вкладок', () => {
  test('на одном документе полосы нет', () => {
    openDocument({ locator: {}, relPath: 'ТУ.pdf' })
    show()

    expect(screen.queryByRole('button', { name: /Закрыть ТУ.pdf/ })).toBeNull()
    expect(screen.getByTestId('pdf')).toBeTruthy()
  })

  test('со второго документа появляется полоса, и по ней переключаются', () => {
    openDocument({ locator: {}, relPath: 'ТУ.pdf' })
    openDocument({ locator: {}, relPath: 'ведомость.xlsx' })
    show()

    // Активна последняя открытая — и она не PDF, значит показан честный ответ
    // про формат, а не пустой просмотрщик.
    expect(screen.getByText('Этот формат откроется во встроенном просмотрщике позже.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'ТУ.pdf' }))

    expect($openDocument.get()?.relPath).toBe('ТУ.pdf')
    expect(screen.getByTestId('pdf')).toBeTruthy()
  })

  test('крестик на вкладке закрывает её, а не ту, что на экране', () => {
    openDocument({ locator: {}, relPath: 'ТУ.pdf' })
    openDocument({ locator: {}, relPath: 'смета.pdf' })
    show()

    fireEvent.click(screen.getByRole('button', { name: 'Закрыть ТУ.pdf' }))

    expect($openDocument.get()?.relPath).toBe('смета.pdf')
    // Осталась одна — полоса снова прячется.
    expect(screen.queryByRole('button', { name: 'Закрыть смета.pdf' })).toBeNull()
  })

  test('вкладка подписана именем файла, а полный путь — в подсказке', () => {
    openDocument({ locator: {}, relPath: 'tasks/ЭОМ/задание.pdf' })
    openDocument({ locator: {}, relPath: 'смета.pdf' })
    show()

    const tab = screen.getByRole('button', { name: 'задание.pdf' })

    expect(tab.getAttribute('title')).toBe('tasks/ЭОМ/задание.pdf')
  })
})
