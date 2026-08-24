// Правила комнаты (задача 3C.6, контракт — specs/agent-roster.md §Р5).
//
// Каждое правило здесь стоит денег: круг в комнате из шести — это шесть
// обращений к модели. Поэтому проверяется не только «кто ответит», но и «кто
// НЕ ответит»: лишний участник в очереди — не косметика, а счёт.

import { describe, expect, it } from 'vitest'

import {
  MAX_MESSAGES,
  MAX_ROUNDS,
  addressed,
  briefFor,
  budgetLeft,
  checkMembers,
  defaultTitle,
  isSilence,
  nextRound,
  parseRooms,
  parseMemberRooms,
  roomsPatch,
  roundQueue,
  wantsYou
} from './group-pure'

const MEMBERS = ['smeta', 'elektrika', 'gip']
const TITLES = { smeta: 'Смета', elektrika: 'Электрика', gip: 'Главный инженер' }

describe('молчание', () => {
  it('их формы, русские формы и пустой ответ', () => {
    for (const silence of ['(pass)', 'pass', 'pass.', 'PASS', ' пас ', '(Пас)', '', '   ']) {
      expect(isSilence(silence)).toBe(true)
    }
  })

  it('обычный ответ молчанием не считается', () => {
    expect(isSilence('Пас не дам, тут перерасход')).toBe(false)
    expect(isSilence('нет')).toBe(false)
  })
})

describe('кто отвечает', () => {
  it('без упоминаний отвечают все, кроме автора', () => {
    expect(addressed('что скажете по разделу?', MEMBERS, TITLES)).toEqual(MEMBERS)
    expect(addressed('а вы?', MEMBERS, TITLES, 'smeta')).toEqual(['elektrika', 'gip'])
  })

  it('`@все` поднимает комнату так же, как отсутствие упоминаний', () => {
    expect(addressed('@все жду позиций', MEMBERS, TITLES)).toEqual(MEMBERS)
    expect(addressed('@everyone status', MEMBERS, TITLES)).toEqual(MEMBERS)
  })

  it('отвечают только названные — и по подписи, и по имени профиля', () => {
    expect(addressed('@Смета посчитай', MEMBERS, TITLES)).toEqual(['smeta'])
    expect(addressed('@smeta посчитай', MEMBERS, TITLES)).toEqual(['smeta'])
    expect(addressed('@Главный-инженер решай', MEMBERS, TITLES)).toEqual(['gip'])
  })

  it('позвали того, кого в комнате нет — не будим всех', () => {
    // Человек обращался не к ним. Разбудить комнату «на всякий случай» значило
    // бы заплатить за шесть ответов на вопрос, заданный не им.
    expect(addressed('@Бухгалтерия посчитай', MEMBERS, TITLES)).toEqual([])
  })

  it('адрес почты и незнакомая собачка проходят текстом', () => {
    expect(addressed('пиши на mail@smeta.ru', MEMBERS, TITLES)).toEqual(MEMBERS)
  })
})

describe('следующий круг', () => {
  it('участник, которого позвал другой участник, отвечает следующим', () => {
    const replies = [{ from: 'smeta', text: '@Электрика подтвердишь сечение?' }]

    expect(nextRound(replies, MEMBERS, TITLES)).toEqual(['elektrika'])
  })

  it('позвавший сам себя круг не продлевает', () => {
    const replies = [{ from: 'smeta', text: 'я же @Смета, мне и считать' }]

    expect(nextRound(replies, MEMBERS, TITLES)).toEqual([])
  })

  it('`@все` внутри реплики участника новый круг НЕ поднимает', () => {
    // Один вежливый оборот раскрутил бы счёт до предела, ничего не добавив.
    const replies = [{ from: 'smeta', text: 'спасибо @все' }]

    expect(nextRound(replies, MEMBERS, TITLES)).toEqual([])
  })

  it('молчание никого не зовёт', () => {
    expect(nextRound([{ from: 'gip', text: '(pass)' }], MEMBERS, TITLES)).toEqual([])
  })

  it('обычный ответ без упоминаний круг не продлевает', () => {
    const replies = [{ from: 'smeta', text: 'по разделу 5 перерасход 12%' }]

    expect(nextRound(replies, MEMBERS, TITLES)).toEqual([])
  })
})

describe('пределы', () => {
  it('дальше третьего круга не идём', () => {
    expect(roundQueue(MEMBERS, MAX_ROUNDS, 0)).toEqual(MEMBERS)
    expect(roundQueue(MEMBERS, MAX_ROUNDS + 1, 0)).toEqual([])
  })

  it('предел реплик режет очередь, а не круг целиком', () => {
    // Лучше услышать двоих, чем никого.
    expect(roundQueue(MEMBERS, 1, MAX_MESSAGES - 2)).toEqual(['smeta', 'elektrika'])
    expect(roundQueue(MEMBERS, 1, MAX_MESSAGES)).toEqual([])
  })

  it('потраченное сверх предела не уходит в минус', () => {
    expect(budgetLeft(MAX_MESSAGES + 5)).toBe(0)
  })
})

describe('нужны вы', () => {
  it('участник позвал человека', () => {
    expect(wantsYou('@user тут нужно ваше решение')).toBe(true)
    expect(wantsYou('@вы решаете, я считаю')).toBe(true)
    expect(wantsYou('решаю сам')).toBe(false)
  })
})

describe('состав', () => {
  it('двое — минимум, шестеро — максимум', () => {
    expect(checkMembers(['smeta']).ok).toBe(false)
    expect(checkMembers(['smeta', 'gip']).ok).toBe(true)
    expect(checkMembers(['a', 'b', 'c', 'd', 'e', 'f']).ok).toBe(true)
    expect(checkMembers(['a', 'b', 'c', 'd', 'e', 'f', 'g']).ok).toBe(false)
  })

  it('дважды добавленный участник — это ошибка, а не пять участников', () => {
    expect(checkMembers(['smeta', 'smeta', 'gip']).ok).toBe(false)
  })

  it('имя по умолчанию складывается из имён участников', () => {
    expect(defaultTitle(['smeta', 'gip'], TITLES)).toBe('Смета, Главный инженер')
    // Безымянный специалист входит именем профиля: подпись пустая, а он есть.
    expect(defaultTitle(['smeta', 'novyi'], TITLES)).toBe('Смета, novyi')
  })
})

describe('что уходит участнику', () => {
  const transcript = [
    { from: '', text: 'посчитайте раздел 5' },
    { from: 'smeta', text: 'перерасход 12%' },
    { from: '', text: 'а причина?' }
  ]

  it('второе сообщение несёт только новое', () => {
    // Всю историю заново — это заплатить за разговор дважды.
    expect(briefFor(transcript, 2, TITLES)).toBe('Человек: а причина?')
  })

  it('новичок слышит всё, что было', () => {
    expect(briefFor(transcript, 0, TITLES)).toContain('посчитайте раздел 5')
    expect(briefFor(transcript, 0, TITLES)).toContain('Смета: перерасход 12%')
  })

  it('новых реплик нет — посылать нечего', () => {
    expect(briefFor(transcript, 3, TITLES)).toBe('')
    expect(briefFor(transcript, 99, TITLES)).toBe('')
  })

  it('каждая реплика подписана — иначе это речь ниоткуда', () => {
    expect(briefFor(transcript, 1, TITLES)).toBe('Смета: перерасход 12%\n\nЧеловек: а причина?')
  })
})

describe('где комната лежит', () => {
  const room = {
    id: 'к-1',
    title: 'Раздел 5',
    members: ['smeta', 'gip'],
    face: null,
    needsYou: false,
    session: 'с-смета',
    seen: 3
  }

  it('запись участника читается обратно целиком', () => {
    const written = roomsPatch([room])

    expect(parseMemberRooms({ groups: written.groups })).toEqual([room])
  })

  it('вся карта комнат пишется разом — иначе роспуск не роспуск', () => {
    // Ядро сливает по ключам: отправить одну комнату значит оставить остальные.
    const groups = roomsPatch([]).groups as Record<string, unknown>

    expect(Object.keys(groups)).toEqual([])
  })

  it('порченая запись пропускается, а не роняет остальные', () => {
    const rooms = parseMemberRooms({
      groups: { плохая: { title: 'без состава' }, 'к-1': { members: ['smeta', 'gip'] } }
    })

    expect(rooms.map((one) => one.id)).toEqual(['к-1'])
    expect(rooms[0].seen).toBe(0)
  })

  it('комната собирается по всему роестру и не двоится', () => {
    const answer = {
      profiles: [
        { name: 'smeta', ui_meta: { aecpilot: roomsPatch([room]) } },
        { name: 'gip', ui_meta: { aecpilot: roomsPatch([{ ...room, session: 'с-гип', seen: 1 }]) } }
      ]
    }

    expect(parseRooms(answer)).toEqual([
      { id: 'к-1', title: 'Раздел 5', members: ['smeta', 'gip'], face: null, needsYou: false }
    ])
  })

  it('«нужны вы» поставил один — видят все', () => {
    const answer = {
      profiles: [
        { name: 'smeta', ui_meta: { aecpilot: roomsPatch([room]) } },
        { name: 'gip', ui_meta: { aecpilot: roomsPatch([{ ...room, needsYou: true }]) } }
      ]
    }

    expect(parseRooms(answer)[0].needsYou).toBe(true)
  })

  it('пропавшая у одного запись комнату не рушит', () => {
    const answer = {
      profiles: [
        { name: 'smeta', ui_meta: { aecpilot: roomsPatch([room]) } },
        { name: 'gip', ui_meta: { aecpilot: {} } }
      ]
    }

    expect(parseRooms(answer)[0].members).toEqual(['smeta', 'gip'])
  })
})
