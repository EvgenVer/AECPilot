import { describe, expect, it } from 'vitest'
import {
  applyReferenceCompletion,
  applySlashCompletion,
  describeSteerOutcome,
  describeSubmitOutcome,
  isSteerUnsupported,
  moveSelection,
  navigateHistory,
  referenceQuery,
  rememberPrompt,
  slashQuery
} from './composer-pure'

// Task 1.6.8. History is the place where a wrong rule silently eats what the
// user typed, so its edges get pinned here. (The send queue used to live here
// too; task 1.6.B5.26 handed that job back to the core — see composer-pure.ts.)

const HISTORY = ['первый', 'второй', 'третий']

describe('navigateHistory', () => {
  it('вверх идёт от самого свежего к старым', () => {
    const a = navigateHistory(HISTORY, undefined, 'older', 'черновик')
    expect(a).toEqual({ cursor: 0, text: 'третий' })
    const b = navigateHistory(HISTORY, a!.cursor, 'older', 'черновик')
    expect(b).toEqual({ cursor: 1, text: 'второй' })
    const c = navigateHistory(HISTORY, b!.cursor, 'older', 'черновик')
    expect(c).toEqual({ cursor: 2, text: 'первый' })
  })

  it('на самом старом вверх — ничего, а не заворот к свежему', () => {
    expect(navigateHistory(HISTORY, 2, 'older', 'черновик')).toBeUndefined()
  })

  it('вниз возвращается и отдаёт черновик обратно', () => {
    expect(navigateHistory(HISTORY, 1, 'newer', 'черновик')).toEqual({ cursor: 0, text: 'третий' })
    expect(navigateHistory(HISTORY, 0, 'newer', 'черновик')).toEqual({
      cursor: undefined,
      text: 'черновик'
    })
  })

  it('вниз вне истории ничего не делает', () => {
    expect(navigateHistory(HISTORY, undefined, 'newer', 'черновик')).toBeUndefined()
  })

  it('пустая история не навигируется', () => {
    expect(navigateHistory([], undefined, 'older', 'черновик')).toBeUndefined()
  })
})

describe('rememberPrompt', () => {
  it('добавляет отправленное', () => {
    expect(rememberPrompt(['а'], 'б')).toEqual(['а', 'б'])
  })

  it('не копит подряд идущие повторы', () => {
    expect(rememberPrompt(['а', 'б'], 'б')).toEqual(['а', 'б'])
    expect(rememberPrompt(['а', 'б'], ' б ')).toEqual(['а', 'б'])
  })

  it('пустое и пробельное не запоминает', () => {
    expect(rememberPrompt(['а'], '   ')).toEqual(['а'])
  })
})

describe('slashQuery', () => {
  it('слэш только в начале строки', () => {
    expect(slashQuery('/he')).toBe('/he')
    expect(slashQuery('см. /help')).toBeUndefined()
    expect(slashQuery('обычный текст')).toBeUndefined()
  })

  it('после пробела подсказка про имя команды больше не нужна', () => {
    expect(slashQuery('/model gpt')).toBeUndefined()
    expect(slashQuery('/model ')).toBeUndefined()
  })

  it('подстановка оставляет пробел для аргументов', () => {
    expect(applySlashCompletion('/model')).toBe('/model ')
  })
})

describe('moveSelection', () => {
  it('ходит по кругу в обе стороны', () => {
    expect(moveSelection(3, 0, 1)).toBe(1)
    expect(moveSelection(3, 2, 1)).toBe(0)
    expect(moveSelection(3, 0, -1)).toBe(2)
  })

  it('на пустом списке остаётся на нуле', () => {
    expect(moveSelection(0, 0, 1)).toBe(0)
  })
})

// Задача 1.6.A3 — `@`-ссылки. В отличие от слэш-команды ссылка живёт в любом
// месте текста, поэтому её границы задаёт каретка, а не начало строки.
describe('referenceQuery', () => {
  it('находит ссылку в середине предложения', () => {
    const draft = 'посмотри @file:src/main.ts и скажи'
    // Каретка внутри ссылки: слово — то, что набрано ДО неё, но границы
    // токена тянутся до пробела, потому что правку можно вести и в середине.
    expect(referenceQuery(draft, 22)).toEqual({ word: '@file:src/mai', start: 9, end: 26 })
  })

  it('видит голую собаку — с неё начинается список подсказок шлюза', () => {
    expect(referenceQuery('@', 1)).toEqual({ word: '@', start: 0, end: 1 })
  })

  it('не считает ссылкой почтовый адрес', () => {
    expect(referenceQuery('пиши на ivan@example.com', 24)).toBeUndefined()
  })

  it('заканчивает ссылку на пробеле', () => {
    expect(referenceQuery('@file:a.ts дальше текст', 23)).toBeUndefined()
  })

  it('берёт последнюю ссылку, а не первую', () => {
    const draft = '@file:a.ts и @file:b'
    expect(referenceQuery(draft, 20)?.start).toBe(13)
  })

  it('без собаки ничего не предлагает', () => {
    expect(referenceQuery('обычный текст', 5)).toBeUndefined()
  })
})

describe('applyReferenceCompletion', () => {
  it('подставляет ссылку на место набранной, не трогая остальной текст', () => {
    const draft = 'посмотри @file:src/m и скажи'
    const range = { start: 9, end: 20 }
    expect(applyReferenceCompletion(draft, range, '@file:src/main.ts')).toEqual({
      text: 'посмотри @file:src/main.ts и скажи',
      caret: 26
    })
  })

  it('не ставит пробел после префикса — набор ссылки продолжается', () => {
    expect(applyReferenceCompletion('@fil', { start: 0, end: 4 }, '@file:').text).toBe('@file:')
  })

  it('не ставит пробел после папки — в неё ещё заходить', () => {
    expect(applyReferenceCompletion('@f', { start: 0, end: 2 }, '@folder:src/').text).toBe(
      '@folder:src/'
    )
  })

  it('после файла пробел ставит — ссылка закончена', () => {
    expect(applyReferenceCompletion('@a', { start: 0, end: 2 }, '@file:a.ts').text).toBe(
      '@file:a.ts '
    )
  })
})

// --- task 1.6.B5.26 / B5.16: reading the gateway's answers ------------------

describe('describeSubmitOutcome', () => {
  it('называет очередь и подруливание принятыми, а не отказом', () => {
    expect(describeSubmitOutcome('queued')).toContain('уйдёт следующим ходом')
    expect(describeSubmitOutcome('steered')).toContain('влито в идущий ход')
  })

  it('на обычной отправке молчит', () => {
    // `streaming` — это норма, и подтверждать её строкой значило бы шуметь на
    // каждое сообщение.
    expect(describeSubmitOutcome('streaming')).toBeUndefined()
    expect(describeSubmitOutcome(undefined)).toBeUndefined()
  })
})

describe('describeSteerOutcome', () => {
  it('разводит принятую подсказку и отклонённую', () => {
    expect(describeSteerOutcome('queued')).toContain('принята')
    expect(describeSteerOutcome('rejected')).toContain('не принял')
  })

  it('незнакомый статус показывает как есть, а не выдаёт за успех', () => {
    expect(describeSteerOutcome('maybe')).toContain('maybe')
  })
})

describe('isSteerUnsupported', () => {
  it('узнаёт 4010 — эта неспособность не изменится до конца сессии', () => {
    expect(isSteerUnsupported('4010: agent does not support steer')).toBe(true)
  })

  it('обычную ошибку за неё не принимает', () => {
    expect(isSteerUnsupported('5000: steer failed: boom')).toBe(false)
  })
})
