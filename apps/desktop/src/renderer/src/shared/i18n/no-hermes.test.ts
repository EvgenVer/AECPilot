// Имени чужого продукта в интерфейсе нет (требование владельца 2026-08-20).
//
// Проверка мерит не наш код, а СОБРАННЫЙ каталог — тот самый, из которого
// интерфейс берёт каждую подпись, подсказку и сообщение об ошибке. Так она
// переживает перенос донора: их новая строка с их именем провалит этот тест, а
// не тихо появится на экране.
//
// Отдельно проверяется русский: он частичный, и непереведённый ключ обязан
// падать на НАШУ английскую строку, а не на их.

import { describe, expect, it } from 'vitest'

import { TRANSLATIONS } from '../../donor/i18n/catalog'
import { aecLocales } from './aec-catalog'
import { UI_LOCALES } from './index'

/** Аргументы для строк-функций: значения не важны, важен результат. */
const DUMMY = ['X', 2, 'Y', 3, 'Z', 4, 'W', 5]

function stringsOf(value: unknown, path: string, out: [string, string][]): void {
  if (typeof value === 'string') {
    out.push([path, value])
    return
  }

  if (typeof value === 'function') {
    for (let arity = 0; arity <= 4; arity += 1) {
      try {
        const rendered = (value as (...args: unknown[]) => unknown)(...DUMMY.slice(0, arity))
        if (typeof rendered === 'string') {
          out.push([`${path}()`, rendered])
          return
        }
      } catch {
        // не та арность — пробуем следующую
      }
    }
    return
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => stringsOf(item, `${path}[${index}]`, out))
    return
  }

  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      stringsOf(child, path ? `${path}.${key}` : key, out)
    }
  }
}

function mentions(source: unknown): string[] {
  const out: [string, string][] = []
  stringsOf(source, '', out)
  return out.filter(([, text]) => /hermes/i.test(text)).map(([path, text]) => `${path}: ${text}`)
}

describe('в интерфейсе нет чужого имени', () => {
  it('английский каталог — ни одной строки', () => {
    expect(mentions(TRANSLATIONS.en)).toEqual([])
  })

  it('русский каталог — ни одной строки, включая непереведённые ключи', () => {
    expect(mentions(TRANSLATIONS.ru)).toEqual([])
  })

  it('каталог наших собственных поверхностей — тоже', () => {
    expect(mentions(aecLocales)).toEqual([])
  })

  it('предлагаются только языки, каталоги которых проверены (SPEC C7)', () => {
    // Их японский, китайский и арабский каталоги называют их продукт, и переписывать
    // четыре чужих перевода незачем: по SPEC интерфейс — английский и русский.
    expect(UI_LOCALES.map((locale) => locale.id).sort()).toEqual(['en', 'ru'])
  })
})
