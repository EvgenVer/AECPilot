import { beforeEach, describe, expect, test } from 'vitest'

import {
  $activeTab,
  $openDocument,
  $tabs,
  closeAllDocuments,
  closeDocument,
  closeTab,
  openDocument,
  requestedPage,
  selectDocument,
  setAfterOpenDocument,
  tabKey
} from './viewer-store'

/** Задача 4.1. Вкладки — про одно: сверяя ответ, инженер держит открытыми
 *  несколько документов, и третья ссылка не должна закрывать первые две. */

beforeEach(() => {
  closeAllDocuments()
  setAfterOpenDocument(null)
})

function open(relPath: string, page?: number, sourceId?: string): void {
  openDocument({ locator: page === undefined ? {} : { page }, relPath, sourceId })
}

describe('показ панели (D-91)', () => {
  test('каждое открытие дёргает хук — и новая вкладка, и переезд по той же', () => {
    let shown = 0
    setAfterOpenDocument(() => {
      shown += 1
    })

    open('ТУ.pdf', 3)
    open('ТУ.pdf', 17)

    expect(shown).toBe(2)
  })

  test('без хука открытие работает как раньше', () => {
    open('ТУ.pdf')

    expect($openDocument.get()?.relPath).toBe('ТУ.pdf')
  })
})

describe('вкладки', () => {
  test('разные документы открываются рядом, последний — активный', () => {
    open('ТУ.pdf')
    open('ведомость.xlsx')

    expect($tabs.get().map((tab) => tab.relPath)).toEqual(['ТУ.pdf', 'ведомость.xlsx'])
    expect($openDocument.get()?.relPath).toBe('ведомость.xlsx')
  })

  test('второй ссылкой на тот же файл вкладка переезжает, а не удваивается', () => {
    open('ТУ.pdf', 3)
    const first = $openDocument.get()?.token
    open('ТУ.pdf', 17)

    expect($tabs.get()).toHaveLength(1)
    expect($openDocument.get()?.locator.page).toBe(17)
    // Токен всё равно новый: тот же документ на той же странице должен
    // прокрутиться заново, иначе повторный клик по ссылке выглядит сломанным.
    expect($openDocument.get()?.token).not.toBe(first)
  })

  test('один и тот же путь в vault и в источнике — разные вкладки', () => {
    open('смета.pdf')
    open('смета.pdf', undefined, 'src-7')

    expect($tabs.get()).toHaveLength(2)
  })

  test('закрытие активной вкладки передаёт эстафету соседке слева', () => {
    open('а.pdf')
    open('б.pdf')
    open('в.pdf')

    closeDocument()

    expect($tabs.get().map((tab) => tab.relPath)).toEqual(['а.pdf', 'б.pdf'])
    expect($openDocument.get()?.relPath).toBe('б.pdf')
  })

  test('закрытие неактивной вкладки не меняет того, что на экране', () => {
    open('а.pdf')
    open('б.pdf')

    closeTab(tabKey({ relPath: 'а.pdf' }))

    expect($openDocument.get()?.relPath).toBe('б.pdf')
  })

  test('после последней вкладки просмотрщик пуст', () => {
    open('а.pdf')
    closeDocument()

    expect($openDocument.get()).toBeNull()
    expect($activeTab.get()).toBeNull()
  })

  test('выбор несуществующей вкладки игнорируется', () => {
    open('а.pdf')
    selectDocument('нет такой')

    expect($openDocument.get()?.relPath).toBe('а.pdf')
  })
})

describe('страница из ссылки', () => {
  test('без страницы документ открывается с начала', () => {
    open('а.pdf')
    expect(requestedPage($openDocument.get())).toBe(1)
  })

  test('страница из ссылки уважается', () => {
    open('а.pdf', 12)
    expect(requestedPage($openDocument.get())).toBe(12)
  })
})

describe('файл проекта в индексе (3K.6)', () => {
  test('ссылка project/… открывает файл папки проекта, а не источника', () => {
    open('wiki/КР.md', undefined, 'project')

    expect($openDocument.get()?.relPath).toBe('wiki/КР.md')
    expect($openDocument.get()?.sourceId).toBeUndefined()
  })

  test('та же вкладка, что открыта из дерева проекта', () => {
    open('wiki/КР.md')
    open('wiki/КР.md', undefined, 'project')

    expect($tabs.get()).toHaveLength(1)
  })
})
