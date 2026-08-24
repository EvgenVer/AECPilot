// Задача 3C.7 (SPEC UR27, контракт — specs/agent-roster.md §Р6). Главное, что
// здесь проверяется: чужое `@` не трогается. Человек пишет письмо, а не команду,
// и превратить собачку в вызов там, где её не звали, — испортить сообщение.

import { describe, expect, it } from 'vitest'

import {
  mentionCompletions,
  mentionedSpecialists,
  mentionHandle,
  applyMention,
  mentionAtCaret
} from './mentions-pure'

const ROSTER = [
  { handle: 'smeta', title: 'Смета', role: 'сметчик', device: '' },
  { handle: 'norm', title: 'Нормоконтроль', role: 'проверка', device: '' },
  { handle: 'smeta', title: 'Смета', role: 'сметчик', device: 'сервер' }
]

describe('имя, под которым откликаются', () => {
  it('подпись, а не имя профиля — человек зовёт так, как видит', () => {
    expect(mentionHandle(ROSTER[0])).toBe('Смета')
  })

  it('без подписи откликается имя профиля', () => {
    expect(mentionHandle({ handle: 'gip', title: '', role: '', device: '' })).toBe('gip')
  })

  it('пробелы в подписи не рвут обращение', () => {
    expect(mentionHandle({ handle: 'g', title: 'Главный инженер', role: '', device: '' })).toBe(
      'Главный-инженер'
    )
  })

  it('одинаковые имена на разных машинах различаются машиной', () => {
    expect(mentionHandle(ROSTER[2])).toBe('Смета-сервер')
  })
})

describe('подсказка по началу имени', () => {
  it('предлагает совпадающих, сохраняя порядок роестра', () => {
    expect(mentionCompletions(ROSTER, 'см', '').map(mentionHandle)).toEqual([
      'Смета',
      'Смета-сервер'
    ])
  })

  it('себя не предлагает — обращение к себе это путаница, а не обращение', () => {
    expect(mentionCompletions(ROSTER, '', 'smeta').map(mentionHandle)).toEqual([
      'Нормоконтроль',
      'Смета-сервер'
    ])
  })

  it('пустой запрос — весь роестр', () => {
    expect(mentionCompletions(ROSTER, '  ', '')).toHaveLength(3)
  })

  it('пустой роестр не роняет подсказку', () => {
    expect(mentionCompletions([], 'см', '')).toEqual([])
  })
})

describe('кого позвали в тексте', () => {
  it('находит по подписи и по имени профиля', () => {
    expect(mentionedSpecialists('@Смета посчитай раздел 3', ROSTER)[0].handle).toBe('smeta')
    expect(mentionedSpecialists('спроси @norm про это', ROSTER)[0].handle).toBe('norm')
  })

  it('специалиста на другой машине зовут его полным именем', () => {
    expect(mentionedSpecialists('@Смета-сервер посчитай', ROSTER)[0].device).toBe('сервер')
  })

  it('адрес почты обращением не считается', () => {
    expect(mentionedSpecialists('напиши на ivan@smeta.ru', ROSTER)).toEqual([])
  })

  it('неизвестное имя проходит текстом', () => {
    expect(mentionedSpecialists('@незнакомец привет', ROSTER)).toEqual([])
  })

  it('один и тот же названный дважды считается один раз', () => {
    expect(mentionedSpecialists('@Смета и снова @Смета', ROSTER)).toHaveLength(1)
  })

  it('текст без собачки — пусто', () => {
    expect(mentionedSpecialists('посчитай смету', ROSTER)).toEqual([])
  })
})

describe('подсказка под курсором', () => {
  it('видит незаконченное обращение и место собачки', () => {
    expect(mentionAtCaret('спроси @см', 10)).toEqual({ query: 'см', start: 7 })
    expect(mentionAtCaret('@', 1)).toEqual({ query: '', start: 0 })
  })

  it('в адресе почты не срабатывает', () => {
    // Собачка после буквы — это почта, а не обращение. Человек пишет письмо.
    expect(mentionAtCaret('пиши на mail@smeta', 18)).toBeNull()
  })

  it('после пробела обращение кончилось', () => {
    expect(mentionAtCaret('@Смета посчитай', 15)).toBeNull()
  })

  it('курсор не в обращении — показывать нечего', () => {
    expect(mentionAtCaret('просто текст', 12)).toBeNull()
    expect(mentionAtCaret('', 0)).toBeNull()
  })

  it('вставка заменяет набранное и дописывает пробел', () => {
    expect(applyMention('спроси @см', 7, 10, 'Смета')).toEqual({
      text: 'спроси @Смета ',
      caret: 14
    })
  })

  it('вставка не съедает то, что стоит после курсора', () => {
    expect(applyMention('@см посчитай', 0, 3, 'Смета').text).toBe('@Смета  посчитай')
  })
})
