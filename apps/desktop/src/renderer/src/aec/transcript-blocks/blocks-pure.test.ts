// Задача 3.4б. Атрибуты пишет модель, поэтому проверяется не «разбор работает»,
// а «разбор переживает неряшливость»: пропущенное поле, мусор вместо числа,
// полуобрезанная ссылка.

import { describe, expect, it } from 'vitest'

import {
  conflictIsEmpty,
  readClauseBlock,
  readConflictBlock,
  readTableBlock,
  TABLE_DEFAULT_LIMIT,
  TABLE_MAX_LIMIT,
  tableKindOf,
  tablePreview
} from './blocks-pure'

const LABELS = { left: 'Первый источник', right: 'Второй источник' }

describe('readClauseBlock', () => {
  it('берёт название документа из ссылки, если его не назвали отдельно', () => {
    const block = readClauseBlock({
      src: '[src: normativy/СП 22.13330.2016.pdf#p12]',
      clause: '5.6.3'
    })

    expect(block.clause).toBe('5.6.3')
    expect(block.doc).toBe('СП 22.13330.2016.pdf')
    expect(block.source?.locator.page).toBe(12)
  })

  it('явное название документа сильнее имени файла', () => {
    const block = readClauseBlock({
      doc: 'СП 22.13330.2016',
      src: '[src: normativy/sp22.pdf#p12]'
    })

    expect(block.doc).toBe('СП 22.13330.2016')
  })

  it('неразобранная ссылка — не ошибка: блок просто останется без перехода', () => {
    const block = readClauseBlock({ clause: '5.6.3', src: 'СП 22.13330, где-то там' })

    expect(block.source).toBeNull()
    expect(block.clause).toBe('5.6.3')
  })

  it('пустые атрибуты дают пустой блок, а не бросок', () => {
    expect(readClauseBlock({})).toEqual({ clause: '', doc: '', note: '', source: null })
  })
})

describe('readConflictBlock', () => {
  it('собирает две стороны с их источниками', () => {
    const block = readConflictBlock(
      {
        subject: 'Отметка низа ростверка',
        left: '-2.400',
        'left-label': 'ТЗ',
        'left-src': '[src: tz/ТЗ-2024.pdf#p3]',
        right: '-2.700',
        'right-label': 'КЖ-01',
        'right-src': '[src: chertezhi/КЖ-01.pdf#p1]'
      },
      LABELS
    )

    expect(block.subject).toBe('Отметка низа ростверка')
    expect(block.left.value).toBe('-2.400')
    expect(block.left.label).toBe('ТЗ')
    expect(block.left.source?.relPath).toBe('ТЗ-2024.pdf')
    expect(block.right.source?.locator.page).toBe(1)
  })

  it('без подписей стороны называются по-человечески, а не пустотой', () => {
    const block = readConflictBlock({ left: 'да', right: 'нет' }, LABELS)

    expect(block.left.label).toBe('Первый источник')
    expect(block.right.label).toBe('Второй источник')
  })

  it('карточка без единого значения считается пустой', () => {
    expect(conflictIsEmpty(readConflictBlock({ subject: 'что-то' }, LABELS))).toBe(true)
    expect(conflictIsEmpty(readConflictBlock({ left: '-2.400' }, LABELS))).toBe(false)
  })
})

describe('readTableBlock', () => {
  it('читает файл, заголовок и источник', () => {
    const block = readTableBlock({
      file: 'workspace/vedomost.csv',
      title: 'Ведомость перемычек',
      source: 'proekt-2024'
    })

    expect(block).toMatchObject({
      file: 'workspace/vedomost.csv',
      title: 'Ведомость перемычек',
      sourceId: 'proekt-2024'
    })
  })

  it('мусор в limit не роняет блок и не открывает потолок', () => {
    expect(readTableBlock({ limit: 'много' }).limit).toBe(TABLE_DEFAULT_LIMIT)
    expect(readTableBlock({ limit: '0' }).limit).toBe(1)
    expect(readTableBlock({ limit: '100000' }).limit).toBe(TABLE_MAX_LIMIT)
    expect(readTableBlock({ limit: '5' }).limit).toBe(5)
  })
})

describe('tableKindOf', () => {
  it('различает то, что умеет читать, и всё остальное', () => {
    expect(tableKindOf('a/b.xlsx')).toBe('sheet')
    expect(tableKindOf('a/b.CSV')).toBe('csv')
    expect(tableKindOf('a/b.tsv')).toBe('csv')
    expect(tableKindOf('a/b.pdf')).toBe('unsupported')
    expect(tableKindOf('bez-rasshireniya')).toBe('unsupported')
  })
})

describe('tablePreview', () => {
  const rows = [
    ['Марка', 'Кол-во'],
    ['ПР-1', '12'],
    ['ПР-2', '7'],
    ['ПР-3', '3']
  ]

  it('отделяет шапку и считает скрытое', () => {
    const view = tablePreview(rows, 2)

    expect(view.head).toEqual(['Марка', 'Кол-во'])
    expect(view.body).toHaveLength(2)
    expect(view.hidden).toBe(1)
  })

  it('на пустом файле не выдумывает шапку', () => {
    expect(tablePreview([], 10)).toEqual({ body: [], head: [], hidden: 0 })
  })

  it('короткая ведомость показывается целиком', () => {
    expect(tablePreview(rows, 50).hidden).toBe(0)
  })
})
