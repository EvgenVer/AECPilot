// Задача 3.4б. Проверяется ровно то, что обещано в задаче: директива абзацем
// становится блоком, чужое имя остаётся абзацем, а бросок при отрисовке даёт
// значок ВНУТРИ сообщения. С ядра 0.22.2 (задача T20.7) директива может стоять
// и посреди абзаца — их `segmentTranscriptDirectives` режет его на текст и
// блоки; прежнее «в середине текста остаётся текстом» у донора снято.
//
// Три из четырёх свойств принадлежат их механизму, а не нашим блокам, — и
// проверяются именно поэтому: мы на них опираемся, а вендорный код приезжает
// заново с каждым подъёмом пина.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { registry } from '../../donor/contrib/registry'
import { TranscriptDirectiveLeaf } from '../../donor/components/assistant-ui/transcript-directive'
import {
  segmentTranscriptDirectives,
  TRANSCRIPT_DIRECTIVE_AREA
} from '../../donor/lib/transcript-directives'
import { AecI18nProvider } from '../../shared/i18n'

import { registerTranscriptBlocks } from './register-blocks'

let dispose: (() => void) | undefined

const readDocument = vi.fn()
const readSheets = vi.fn()

function bytesOf(text: string): ArrayBuffer {
  const encoded = new TextEncoder().encode(text)
  return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength)
}

beforeEach(() => {
  dispose = registerTranscriptBlocks()
  readDocument.mockResolvedValue({
    bytes: bytesOf('Марка;Кол-во\nПР-1;12\nПР-2;7\n'),
    name: 'vedomost.csv',
    ok: true,
    path: 'D:/vault/workspace/vedomost.csv',
    size: 30
  })
  window.aecpilot = { readDocument, readSheets } as unknown as typeof window.aecpilot
})

afterEach(() => {
  dispose?.()
  cleanup()
  vi.clearAllMocks()
})

const show = (text: string) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AecI18nProvider>
        <TranscriptDirectiveLeaf text={text} />
      </AecI18nProvider>
    </QueryClientProvider>
  )

describe('директива как абзац', () => {
  it('карточка расхождения показывает предмет, обе стороны и их источники', async () => {
    show(
      '::aec-conflict{subject="Отметка низа ростверка" left="-2.400" left-label="ТЗ" ' +
        'left-src="[src: tz/ТЗ-2024.pdf#p3]" right="-2.700" right-label="КЖ-01"}'
    )

    expect(screen.getByText('Отметка низа ростверка')).toBeTruthy()
    expect(screen.getByText('-2.400')).toBeTruthy()
    expect(screen.getByText('-2.700')).toBeTruthy()
    expect(screen.getByText('ТЗ')).toBeTruthy()
    // Источник назван только у левой стороны — переход есть ровно один.
    expect(screen.getByRole('button', { name: 'ТЗ-2024.pdf' })).toBeTruthy()
  })

  it('пункт норматива предлагает открыть документ на месте', () => {
    show('::aec-clause{clause="5.6.3" src="[src: normativy/СП 22.13330.2016.pdf#p12]"}')

    expect(screen.getByText('Пункт 5.6.3')).toBeTruthy()
    expect(screen.getByText('СП 22.13330.2016.pdf')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Открыть на этом месте/ })).toBeTruthy()
  })

  it('без разборчивой ссылки блок честно говорит, что источника нет', () => {
    show('::aec-clause{clause="5.6.3" src="где-то в СП"}')

    expect(screen.getByText('Источник у этого пункта в ответе не назван.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Открыть на этом месте/ })).toBeNull()
  })

  it('ведомость читается из файла проекта и показывается таблицей', async () => {
    show('::aec-table{file="workspace/vedomost.csv" title="Ведомость перемычек"}')

    await waitFor(() => expect(screen.getByText('ПР-1')).toBeTruthy())
    expect(readDocument).toHaveBeenCalledWith('workspace/vedomost.csv', undefined)
    expect(screen.getByText('Ведомость перемычек')).toBeTruthy()
    expect(screen.getByText('Марка')).toBeTruthy()
    expect(screen.getByText('12')).toBeTruthy()
  })

  it('нечитаемый файл называет причину, а не оставляет пустую рамку', async () => {
    readDocument.mockResolvedValue({ error: 'файл не найден', ok: false })
    show('::aec-table{file="workspace/net-takogo.csv"}')

    await waitFor(() =>
      expect(screen.getByText('Не удалось прочитать файл: файл не найден')).toBeTruthy()
    )
  })

  it('формат, который блок не читает, назван вслух — и файл не читается вовсе', () => {
    show('::aec-table{file="chertezhi/KZH-01.pdf"}')

    expect(screen.getByText('Этот блок читает .csv, .tsv и .xlsx.')).toBeTruthy()
    expect(readDocument).not.toHaveBeenCalled()
  })
})

describe('границы механизма (донорские, но мы на них стоим)', () => {
  it('директива посреди текста режется на текст и блок, а `std::vector` — не директива', () => {
    expect(
      segmentTranscriptDirectives('Смотрите ::aec-conflict{left="1" right="2"} в таблице')
    ).toEqual([
      { kind: 'prose', text: 'Смотрите ' },
      {
        kind: 'directive',
        directive: {
          name: 'aec-conflict',
          attrs: { left: '1', right: '2' },
          source: '::aec-conflict{left="1" right="2"}'
        }
      },
      { kind: 'prose', text: ' в таблице' }
    ])
    // Имя, приклеенное к слову, — не директива.
    expect(segmentTranscriptDirectives('std::vector<int> v')).toBeNull()
    // Недочитанные атрибуты — тоже: полблока с молча потерянными полями не рисуется.
    expect(segmentTranscriptDirectives('::aec-conflict{left="1"')).toBeNull()
  })

  it('незанятое имя остаётся абзацем — блок не подставляется', () => {
    const { container } = show('::aec-nikto-ne-zanyal{left="1"}')

    expect(container.textContent).toBe('')
  })

  it('бросок при отрисовке даёт значок внутри сообщения, а не ломает его', () => {
    const boom = registry.register({
      id: 'aec.test.boom',
      area: TRANSCRIPT_DIRECTIVE_AREA,
      source: 'core',
      data: {
        name: 'aec-boom',
        render: () => {
          throw new Error('блок сломался')
        }
      }
    })

    // Их граница вклада ловит бросок; сообщение остаётся живым, а на месте
    // блока — значок. Консольный шум React о пойманной ошибке здесь ожидаем.
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = show('::aec-boom{}')

    expect(container.textContent).not.toBe('')
    expect(container.querySelector('[data-slot="aui_assistant-message-root"]')).toBeNull()
    quiet.mockRestore()
    boom()
  })
})
