import { beforeEach, describe, expect, test } from 'vitest'

import { $unverifiedQuotes, forgetVerdicts, rememberVerdicts } from './quote-verdicts'
import type { QuoteVerdict } from '../../../../shared/ipc'

/**
 * Задача 3.31b. Пометка живёт на фишке цитаты, поэтому весь вопрос здесь —
 * К КАКОЙ ссылке отнести не прошедшую проверку выдержку. Ошибись — и пометка
 * встанет на верную цитату, а неверная останется чистой.
 */

function verdict(text: string, start: number, ok: boolean): QuoteVerdict {
  return { text, start, end: start + text.length, ok, reason: ok ? '' : 'нет в источнике' }
}

beforeEach(() => {
  forgetVerdicts()
})

describe('раскладка вердиктов по ссылкам', () => {
  test('выдержка достаётся ближайшей ссылке ПЕРЕД ней', () => {
    const answer =
      'Мощность 250 кВт [src: p/а.pdf#p12](#cite) «выдумка про мощность объекта». ' +
      'Кабель ВВГнг [src: p/б.xlsx](#cite) «настоящая строка ведомости здесь».'

    rememberVerdicts(answer, [
      verdict('выдумка про мощность объекта', answer.indexOf('выдумка'), false),
      verdict('настоящая строка ведомости здесь', answer.indexOf('настоящая'), true)
    ])

    // Помечена ровно первая ссылка — вторая осталась чистой.
    expect($unverifiedQuotes.get()['[src: p/а.pdf#p12]']).toEqual(['выдумка про мощность объекта'])
    expect($unverifiedQuotes.get()['[src: p/б.xlsx]']).toBeUndefined()
  })

  test('подтверждённые выдержки не запоминаются', () => {
    const answer = 'Ответ [src: p/а.pdf](#cite) «эта фраза в документе есть».'

    rememberVerdicts(answer, [verdict('эта фраза в документе есть', answer.indexOf('эта'), true)])

    // Отсутствие в списке И ЕСТЬ «всё в порядке»; хранить оба состояния значило
    // бы завести второй источник правды об одном и том же.
    expect($unverifiedQuotes.get()).toEqual({})
  })

  test('выдержка до первой ссылки не метит ничего', () => {
    const answer = '«фраза до всякой ссылки в ответе» и потом [src: p/а.pdf](#cite).'

    rememberVerdicts(answer, [verdict('фраза до всякой ссылки в ответе', 1, false)])

    expect($unverifiedQuotes.get()).toEqual({})
  })

  test('две непрошедшие выдержки у одной ссылки копятся, повторы — нет', () => {
    const answer = '[src: p/а.pdf](#cite) «первая выдуманная фраза тут» и «вторая выдуманная фраза»'

    rememberVerdicts(answer, [
      verdict('первая выдуманная фраза тут', answer.indexOf('первая'), false),
      verdict('вторая выдуманная фраза', answer.indexOf('вторая'), false)
    ])
    rememberVerdicts(answer, [
      verdict('первая выдуманная фраза тут', answer.indexOf('первая'), false)
    ])

    expect($unverifiedQuotes.get()['[src: p/а.pdf]']).toEqual([
      'первая выдуманная фраза тут',
      'вторая выдуманная фраза'
    ])
  })

  test('ответ без единой непрошедшей выдержки не трогает хранилище', () => {
    const before = $unverifiedQuotes.get()

    rememberVerdicts('[src: p/а.pdf](#cite) «всё хорошо с этой фразой»', [
      verdict('всё хорошо с этой фразой', 30, true)
    ])

    // Та же ссылка на объект: лишний set перерисовал бы каждую фишку в ленте.
    expect($unverifiedQuotes.get()).toBe(before)
  })
})
