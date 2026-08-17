import { describe, expect, test } from 'vitest'

import { findPage, findWikiLinks, linkAt, pageFileName } from './wikilink-pure'

/** Задача 4.6. Ссылка вида `[[…]]` ведёт на страницу вики. Здесь проверяется
 *  разбор и переход; сама подсветка — украшение поверх текста и документ не
 *  меняет (см. комментарий в `wikilink-pure.ts`). */

describe('поиск ссылок в абзаце', () => {
  test('простая ссылка', () => {
    expect(findWikiLinks('см. [[Кабельный журнал]] далее')).toEqual([
      { end: 24, label: 'Кабельный журнал', start: 4, target: 'Кабельный журнал' }
    ])
  })

  test('ссылка с подписью: ведёт по цели, показывает подпись', () => {
    const [link] = findWikiLinks('[[ТП-1|трансформаторная]]')

    expect(link.target).toBe('ТП-1')
    expect(link.label).toBe('трансформаторная')
  })

  test('несколько ссылок в одном абзаце', () => {
    expect(findWikiLinks('[[А]] и [[Б]]').map((link) => link.target)).toEqual(['А', 'Б'])
  })

  test('пустая ссылка ссылкой не считается', () => {
    expect(findWikiLinks('[[]] и [[   ]]')).toEqual([])
  })

  test('одиночные скобки — не ссылка', () => {
    expect(findWikiLinks('массив[1] и [ссылка](url)')).toEqual([])
  })

  test('незакрытая ссылка — не ссылка', () => {
    expect(findWikiLinks('[[Страница')).toEqual([])
  })
})

describe('попадание клика в ссылку', () => {
  const text = 'см. [[Кабельный журнал]] далее'

  test('внутри — попал', () => {
    expect(linkAt(text, 10)?.target).toBe('Кабельный журнал')
  })

  test('на скобках — тоже попал', () => {
    // Человек целится в слово, но попасть может и в скобку.
    expect(linkAt(text, 4)?.target).toBe('Кабельный журнал')
    expect(linkAt(text, 24)?.target).toBe('Кабельный журнал')
  })

  test('снаружи — мимо', () => {
    expect(linkAt(text, 1)).toBeNull()
    expect(linkAt(text, 27)).toBeNull()
  })
})

describe('имя файла страницы', () => {
  test('к имени добавляется расширение', () => {
    expect(pageFileName('Кабельный журнал')).toBe('Кабельный журнал.md')
  })

  test('пробелы и дефисы в имени законны', () => {
    expect(pageFileName('ТП-1')).toBe('ТП-1.md')
  })

  test('уже с расширением — не удваивается', () => {
    expect(pageFileName('ТП-1.md')).toBe('ТП-1.md')
  })

  test('подпапка в цели отбрасывается — ищем по имени', () => {
    expect(pageFileName('entities/ТП-1')).toBe('ТП-1.md')
  })

  test('запрещённые символы — отказ', () => {
    // Отказ, а не «почищенное» имя: увести человека не туда хуже, чем не
    // открыть ничего.
    for (const bad of ['..', '.', '   ', 'C:', 'звёздочка*', 'знак?', 'кавычка"']) {
      expect(pageFileName(bad), bad).toBeNull()
    }
  })

  test('попытка выйти за пределы обезвреживается, а не отвергается', () => {
    // От пути остаётся только последнее имя, поэтому `../../` никуда не ведёт:
    // это будет обычная страница `passwd.md` внутри вики. Проверка на выход за
    // корень всё равно стоит в главном процессе — здесь второй рубеж.
    expect(pageFileName('../../etc/passwd')).toBe('passwd.md')
    expect(pageFileName('..\\..\\windows\\system32')).toBe('system32.md')
  })
})

describe('поиск страницы в дереве vault', () => {
  const tree = [
    {
      children: [
        { name: 'index.md', path: 'wiki/index.md', type: 'file' as const },
        {
          children: [{ name: 'ТП-1.md', path: 'wiki/entities/ТП-1.md', type: 'file' as const }],
          name: 'entities',
          path: 'wiki/entities',
          type: 'dir' as const
        }
      ],
      name: 'wiki',
      path: 'wiki',
      type: 'dir' as const
    }
  ]

  test('находит на любой глубине', () => {
    expect(findPage(tree, 'ТП-1.md')).toBe('wiki/entities/ТП-1.md')
  })

  test('регистр не важен', () => {
    // Ссылку пишет человек или модель, и «тп-1» должно находить «ТП-1.md».
    expect(findPage(tree, 'тп-1.md')).toBe('wiki/entities/ТП-1.md')
  })

  test('нет страницы — null (её создадут)', () => {
    expect(findPage(tree, 'Щитовая.md')).toBeNull()
  })
})
