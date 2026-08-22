// Задача 3C.7 (SPEC UR27, контракт — specs/agent-roster.md §Р6). Главное, что
// здесь проверяется: чужое `@` не трогается. Человек пишет письмо, а не команду,
// и превратить собачку в вызов там, где её не звали, — испортить сообщение.

import { describe, expect, it } from 'vitest'

import { mentionCompletions, mentionedSpecialists, mentionHandle } from './mentions-pure'

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
