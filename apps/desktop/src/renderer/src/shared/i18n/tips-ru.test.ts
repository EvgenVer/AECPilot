// Подсказки-ротация переведены целиком (задача 3.B3е).
//
// ЗАЧЕМ ЭТО ОТДЕЛЬНЫЙ ТЕСТ. Русский каталог у нас ЧАСТИЧНЫЙ: ключ, которого в
// нём нет, молча падает на нашу английскую строку. Для большинства экранов это
// осознанная отсрочка (полный проход — задача 6.7), но подсказки показываются
// САМИ, без действия человека, и непереведённая уедет прямо на экран.
//
// Ловится здесь ровно один сценарий, и он повторится: на следующем подъёме пина
// в `TIP_CATALOG` приезжает новая подсказка, английский текст к ней приходит
// вместе с донором, а русского нет — и заметить это глазами нельзя, потому что
// ротация ждёт 5–10 минут после запуска.

import { describe, expect, it } from 'vitest'

import { TIP_CATALOG } from '../../donor/lib/tips/catalog'
import { en } from './en'
import { ru } from './ru'

describe('подсказки: русский каталог полон', () => {
  it('у каждой подсказки из их каталога есть русские заголовок и текст', () => {
    const missing = TIP_CATALOG.filter(tip => {
      const item = ru.tips.items[tip.id]
      return !item?.title?.trim() || !item?.text?.trim()
    }).map(tip => tip.id)

    expect(missing, 'подсказка без русского текста уедет на экран английской').toEqual([])
  })

  it('русский текст не совпадает с английским — то есть перевод правда есть', () => {
    // Без этой проверки заполнить каталог можно было бы копией английского, и
    // первая проверка стала бы зелёной, ничего не переводя.
    const untranslated = TIP_CATALOG.filter(tip => {
      const item = ru.tips.items[tip.id]
      const base = en.tips.items[tip.id]
      return item.title === base.title || item.text === base.text
    }).map(tip => tip.id)

    expect(untranslated).toEqual([])
  })

  it('кнопка «больше не показывать» тоже переведена', () => {
    expect(ru.tips.close).not.toBe(en.tips.close)
    expect(ru.tips.close.trim()).not.toBe('')
  })
})
