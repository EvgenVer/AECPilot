import { describe, expect, it } from 'vitest'
import { hasAnsiCodes, parseAnsi } from './ansi-pure'

// Task 1.6.11. The job of this parser is negative as much as positive: no
// escape sequence may survive into the text the user reads.
const ESC = ''

describe('parseAnsi', () => {
  it('обычный текст остаётся одним куском без стилей', () => {
    expect(parseAnsi('просто вывод')).toEqual([{ bold: false, fg: null, text: 'просто вывод' }])
  })

  it('цвет и жирность разбирает, а сами коды не показывает', () => {
    const segments = parseAnsi(`${ESC}[32mok${ESC}[0m готово`)
    expect(segments).toEqual([
      { bold: false, fg: 'green', text: 'ok' },
      { bold: false, fg: null, text: ' готово' }
    ])
    expect(segments.map((s) => s.text).join('')).not.toContain('[32m')
  })

  it('жирный и яркий цвет вместе', () => {
    expect(parseAnsi(`${ESC}[1;91mERROR${ESC}[0m`)).toEqual([
      { bold: true, fg: 'bright-red', text: 'ERROR' }
    ])
  })

  it('соседние куски одного стиля склеиваются', () => {
    expect(parseAnsi(`${ESC}[31mа${ESC}[31mб`)).toEqual([{ bold: false, fg: 'red', text: 'аб' }])
  })

  it('последовательности не-SGR съедаются, а не печатаются', () => {
    // Очистка экрана и перемещение курсора — типичный шум от команд.
    const segments = parseAnsi(`${ESC}[2J${ESC}[Hтекст`)
    expect(segments.map((s) => s.text).join('')).toBe('текст')
  })

  it('256-цветный код не роняет разбор и не печатает свои аргументы', () => {
    const segments = parseAnsi(`${ESC}[38;5;196mкрасный${ESC}[0m`)
    expect(segments.map((s) => s.text).join('')).toBe('красный')
    expect(segments.map((s) => s.text).join('')).not.toContain('196')
  })

  it('пустая строка — пустой разбор', () => {
    expect(parseAnsi('')).toEqual([])
  })
})

describe('hasAnsiCodes', () => {
  it('отличает вывод с кодами от обычного', () => {
    expect(hasAnsiCodes('обычный текст')).toBe(false)
    expect(hasAnsiCodes(`${ESC}[32mок`)).toBe(true)
  })
})
