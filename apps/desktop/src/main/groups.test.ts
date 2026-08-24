// Ход комнаты (задача 3C.6, контракт — specs/agent-roster.md §Р5).
//
// Ядро здесь поддельное: `profiles.list` отдаёт то, что записали, а `prompt.submit`
// отвечает заранее заготовленной репликой. Проверяется не разбор — он в
// `group-pure.test.ts`, — а ПОРЯДОК: кто и в какой очерёдности спрошен, что
// записано в поля профиля и когда, и на чём круг останавливается.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MAX_MESSAGES, MAX_ROUNDS, type GroupEvent, type GroupTurn } from './group-pure'
import {
  TURN_TIMEOUT_MS,
  askRoom,
  configureGroups,
  createRoom,
  disbandRoom,
  listRooms,
  willAnswer
} from './groups'
import { OUR_META_KEY } from './roster-pure'

interface FakeProfile {
  name: string
  ui_meta: Record<string, unknown>
}

/** Ответ, означающий «участник сорвался»: его сессия шлёт ошибку вместо конца
 * хода. Отдельно от молчания нарочно — правило §Р5 требует различать. */
const CRASH = '!сорвался'

/** Ответ, означающий «участник ещё думает»: его сессия не отвечает ничем, и
 * комната перестаёт его ждать по сроку. */
const SLOW = '!думает'

/** Что ответит участник, когда его спросят. Ключ — имя профиля. */
let answers: Record<string, string[]>
let profiles: FakeProfile[]
let transcripts: Record<string, GroupTurn[]>
let asked: { member: string; text: string }[]
let sessions: Record<string, string>
let listeners: ((event: unknown) => void)[]
let minted: number
/** Сессии, которые не ответили в срок: тест доложит за них позже. */
let slow: string[]

function profileOf(name: string): FakeProfile {
  const found = profiles.find((one) => one.name === name)
  if (found === undefined) throw new Error(`нет профиля ${name}`)
  return found
}

/** Кому принадлежит сессия. Подделка ядра держит это сама. */
function memberOfSession(sessionId: string): string {
  return Object.entries(sessions).find(([, id]) => id === sessionId)?.[0] ?? ''
}

async function request(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  if (method === 'profiles.list') return { profiles: profiles.map((one) => ({ ...one })) }

  if (method === 'profiles.configure') {
    const target = profileOf(String(params.name))
    const patch = (params.ui_meta ?? {}) as Record<string, unknown>
    // Ядро сливает по ключам верхнего уровня — подделка делает то же.
    target.ui_meta = { ...target.ui_meta, [OUR_META_KEY]: patch[OUR_META_KEY] }
    return { ok: true }
  }

  if (method === 'session.create') {
    const member = String(params.profile)
    sessions[member] = `с-${member}-${(minted += 1)}`
    return { session_id: sessions[member] }
  }

  if (method === 'prompt.submit') {
    const sessionId = String(params.session_id)
    const member = memberOfSession(sessionId)
    asked.push({ member, text: String(params.text) })

    const queued = answers[member] ?? []
    const text = queued.length > 0 ? (queued.shift() as string) : '(pass)'

    // Медленный участник не отвечает ВООБЩЕ: его ход заканчивается сроком, и
    // ответ придёт потом — уже после круга.
    if (text === SLOW) {
      slow.push(sessionId)
      return { ok: true }
    }

    // Ход агента заканчивается событием его сессии — не ответом на вызов. И
    // приходит оно СВОИМ путём: подделка нарочно шлёт его в микрозадаче, то
    // есть раньше, чем разрешится сам вызов. Комната обязана это пережить.
    queueMicrotask(() => {
      for (const listener of listeners) {
        listener(
          text === CRASH
            ? { type: 'error', session_id: sessionId, payload: { message: 'модель отказала' } }
            : {
                type: 'message.complete',
                session_id: sessionId,
                payload: { text, status: 'complete' }
              }
        )
      }
    })
    return { ok: true }
  }

  throw new Error(`подделка не знает метода ${method}`)
}

function room(members: string[], each: Partial<Record<string, unknown>> = {}): void {
  for (const member of members) {
    const profile = profileOf(member)
    const ours = (profile.ui_meta[OUR_META_KEY] ?? {}) as Record<string, unknown>
    // Подпись специалиста ОСТАЁТСЯ: комнаты лежат рядом с ней в том же блоке, и
    // затереть её здесь значило бы проверять комнату в мире, где `@Смета` не
    // находит никого.
    profile.ui_meta = {
      [OUR_META_KEY]: {
        ...ours,
        groups: {
          'к-1': {
            title: 'Раздел 5',
            members,
            face: null,
            needsYou: false,
            session: '',
            seen: 0,
            ...each
          }
        }
      }
    }
  }
}

function meta(member: string): Record<string, unknown> {
  const ours = (profileOf(member).ui_meta[OUR_META_KEY] ?? {}) as Record<string, unknown>
  const groups = (ours.groups ?? {}) as Record<string, unknown>
  return (groups['к-1'] ?? {}) as Record<string, unknown>
}

beforeEach(() => {
  answers = {}
  transcripts = {}
  asked = []
  sessions = {}
  listeners = []
  minted = 0
  slow = []
  profiles = [
    { name: 'smeta', ui_meta: { [OUR_META_KEY]: { title: 'Смета' } } },
    { name: 'elektrika', ui_meta: { [OUR_META_KEY]: { title: 'Электрика' } } },
    { name: 'gip', ui_meta: { [OUR_META_KEY]: { title: 'Главный инженер' } } }
  ]

  configureGroups({
    request,
    onGatewayEvent: (listener) => {
      listeners.push(listener)
      return () => {
        listeners = listeners.filter((one) => one !== listener)
      }
    },
    loadTranscript: (id) => [...(transcripts[id] ?? [])],
    saveTranscript: (id, turns) => {
      transcripts[id] = turns
    },
    newRoomId: () => 'к-новая'
  })
})

describe('создание и роспуск', () => {
  it('запись кладётся каждому участнику — комната есть там, где о ней знают', async () => {
    const made = await createRoom(['smeta', 'gip'], 'Раздел 5')

    expect(made.ok).toBe(true)
    for (const member of ['smeta', 'gip']) {
      const groups = ((profileOf(member).ui_meta[OUR_META_KEY] as Record<string, unknown>).groups ??
        {}) as Record<string, unknown>
      expect(Object.keys(groups)).toEqual(['к-новая'])
    }
  })

  it('состав проверяется до записи', async () => {
    expect((await createRoom(['smeta'])).ok).toBe(false)
    expect((await createRoom(['smeta', 'smeta'])).ok).toBe(false)
  })

  it('комната видна одна, даже когда записей столько же, сколько участников', async () => {
    await createRoom(['smeta', 'gip'])

    expect((await listRooms()).map((one) => one.id)).toEqual(['к-новая'])
  })

  it('роспуск убирает запись у всех и стирает переписку', async () => {
    room(['smeta', 'gip'])
    transcripts['к-1'] = [{ from: '', text: 'было' }]

    expect((await disbandRoom('к-1')).ok).toBe(true)
    expect(await listRooms()).toEqual([])
    expect(transcripts['к-1']).toEqual([])
  })
})

describe('ход комнаты', () => {
  it('вопрос без обращений получает ответы минимум от двоих', async () => {
    room(['smeta', 'elektrika', 'gip'])
    answers = { smeta: ['перерасход 12%'], elektrika: ['сечение мало'], gip: ['(pass)'] }

    const result = await askRoom('к-1', 'что скажете по разделу 5?')

    expect(result.ok).toBe(true)
    const said = (result.turns ?? []).filter((turn) => turn.from !== '')
    expect(said.map((one) => one.from)).toEqual(['smeta', 'elektrika'])
  })

  it('молчание — это ответ, а не сбой', async () => {
    room(['smeta', 'gip'])
    answers = { smeta: ['(pass)'], gip: ['я посмотрю'] }
    const events: GroupEvent[] = []

    await askRoom('к-1', 'вопрос', (event) => events.push(event))

    expect(events.filter((one) => one.kind === 'passed').map((one) => one.member)).toEqual([
      'smeta'
    ])
    expect(events.some((one) => one.kind === 'finished')).toBe(true)
  })

  it('адресный вопрос будит только названного', async () => {
    room(['smeta', 'elektrika', 'gip'])
    answers = { smeta: ['считаю'] }

    await askRoom('к-1', '@Смета посчитай раздел 5')

    expect(asked.map((one) => one.member)).toEqual(['smeta'])
  })

  it('участник, позванный другим участником, отвечает следующим кругом', async () => {
    room(['smeta', 'elektrika'])
    answers = { smeta: ['@Электрика подтвердишь сечение?'], elektrika: ['подтверждаю', 'да'] }

    await askRoom('к-1', '@Смета начни')

    // Первый круг — только Смета; второй — Электрика, которую она позвала.
    expect(asked.map((one) => one.member)).toEqual(['smeta', 'elektrika'])
  })

  it('круги не раскручиваются дальше предела', async () => {
    room(['smeta', 'elektrika'])
    // Двое зовут друг друга без конца — остановить это может только предел.
    answers = {
      smeta: Array(20).fill('@Электрика что скажешь?'),
      elektrika: Array(20).fill('@Смета а ты?')
    }

    await askRoom('к-1', '@Смета начни')

    expect(asked.length).toBeLessThanOrEqual(MAX_ROUNDS)
    expect(asked.length).toBeLessThanOrEqual(MAX_MESSAGES)
  })

  it('предел реплик останавливает ход, а не роняет его', async () => {
    room(['smeta', 'elektrika', 'gip'])
    // Все зовут всех — без предела это не кончится никогда.
    answers = {
      smeta: Array(20).fill('@Электрика и @Главный-инженер, что скажете?'),
      elektrika: Array(20).fill('@Смета пересчитай'),
      gip: Array(20).fill('@Смета и @Электрика, ещё раз')
    }

    const result = await askRoom('к-1', 'общий вопрос')

    expect(result.ok).toBe(true)
    expect(asked.length).toBeLessThanOrEqual(MAX_MESSAGES)
  })
})

describe('нужны вы', () => {
  it('участник позвал человека — пометка встала у всех', async () => {
    room(['smeta', 'gip'])
    answers = { smeta: ['@user тут решать вам'], gip: ['(pass)'] }

    await askRoom('к-1', 'вопрос')

    expect(meta('smeta').needsYou).toBe(true)
    expect(meta('gip').needsYou).toBe(true)
    expect((await listRooms())[0].needsYou).toBe(true)
  })

  it('следующее сообщение человека пометку снимает', async () => {
    room(['smeta', 'gip'], { needsYou: true })
    answers = { smeta: ['ладно'], gip: ['(pass)'] }

    await askRoom('к-1', 'решаю так')

    expect(meta('smeta').needsYou).toBe(false)
  })
})

describe('сессии и повторы', () => {
  it('у каждого участника своя сессия, записанная сразу', async () => {
    room(['smeta', 'gip'])
    answers = { smeta: ['раз'], gip: ['два'] }

    await askRoom('к-1', 'вопрос')

    expect(meta('smeta').session).toBe('с-smeta-1')
    expect(meta('gip').session).toBe('с-gip-2')
    expect(meta('smeta').session).not.toBe(meta('gip').session)
  })

  it('заведённая сессия переиспользуется, а не заводится заново', async () => {
    room(['smeta', 'gip'], { session: 'с-старая' })
    sessions.smeta = 'с-старая'
    answers = { smeta: ['раз'] }

    await askRoom('к-1', '@Смета вопрос')

    expect(meta('smeta').session).toBe('с-старая')
  })

  it('второе сообщение несёт только новое, а не всю историю', async () => {
    room(['smeta', 'gip'])
    answers = { smeta: ['перерасход', 'потому что бетон'], gip: ['(pass)', '(pass)'] }

    await askRoom('к-1', 'посчитайте раздел 5')
    asked.length = 0
    await askRoom('к-1', 'а причина?')

    const second = asked.find((one) => one.member === 'smeta')
    expect(second?.text).toBe('Человек: а причина?')
    expect(second?.text).not.toContain('посчитайте раздел 5')
  })

  it('участник слышит то, что сказали до него в этом же круге', async () => {
    room(['smeta', 'gip'])
    answers = { smeta: ['перерасход 12%'], gip: ['вижу'] }

    await askRoom('к-1', 'вопрос')

    expect(asked.find((one) => one.member === 'gip')?.text).toContain('Смета: перерасход 12%')
  })
})

describe('ошибка участника', () => {
  it('сорвавшийся участник — это молчание, а не поломка комнаты', async () => {
    room(['smeta', 'gip'])
    answers = { smeta: [CRASH], gip: ['я на месте'] }
    const events: GroupEvent[] = []

    const result = await askRoom('к-1', 'вопрос', (event) => events.push(event))

    expect(result.ok).toBe(true)
    expect(events.filter((one) => one.kind === 'failed').map((one) => one.member)).toEqual([
      'smeta'
    ])
    // Комната договорила: сорвавшийся не уносит с собой остальных.
    expect((result.turns ?? []).some((turn) => turn.from === 'gip')).toBe(true)
  })
})

describe('чужие поля', () => {
  it('запись комнаты не стирает специалисту имя', async () => {
    // Замерено на живом ядре: `ui_meta` сливается по ключам ВЕРХНЕГО уровня.
    // Отправить одни комнаты — значит стереть подпись, роль и облик.
    room(['smeta', 'gip'])
    answers = { smeta: ['раз'], gip: ['два'] }

    await askRoom('к-1', 'вопрос')

    const ours = profileOf('smeta').ui_meta[OUR_META_KEY] as Record<string, unknown>
    expect(ours.title).toBe('Смета')
  })
})

describe('опоздавший ответ', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  /** Докладывает за медленного участника — уже после конца круга. */
  function answersLate(text: string): void {
    for (const sessionId of slow.splice(0)) {
      for (const listener of listeners) {
        listener({
          type: 'message.complete',
          session_id: sessionId,
          payload: { text, status: 'complete' }
        })
      }
    }
  }

  it('приходит в комнату сам, а не пропадает', async () => {
    // Без этого медленный специалист исчезает молча: комната перестала слушать,
    // а он всё-таки ответил — и человек об этом не узнаёт никогда.
    vi.useFakeTimers()
    room(['smeta', 'gip'])
    answers = { smeta: [SLOW], gip: ['я на месте'] }
    const events: GroupEvent[] = []

    const turn = askRoom('к-1', 'вопрос', (event) => events.push(event))
    await vi.advanceTimersByTimeAsync(TURN_TIMEOUT_MS + 1000)
    await turn

    expect(events.some((one) => one.kind === 'timeout' && one.member === 'smeta')).toBe(true)
    expect(transcripts['к-1'].some((turn) => turn.from === 'smeta')).toBe(false)

    answersLate('извините, считал долго: 12%')

    expect(transcripts['к-1'].at(-1)).toEqual({
      from: 'smeta',
      text: 'извините, считал долго: 12%'
    })
    expect(events.at(-1)).toEqual({ member: 'smeta', kind: 'answered', round: 1 })
  })

  it('опоздавшее молчание в переписку не лезет', async () => {
    vi.useFakeTimers()
    room(['smeta', 'gip'])
    answers = { smeta: [SLOW], gip: ['(pass)'] }
    const events: GroupEvent[] = []

    const turn = askRoom('к-1', 'вопрос', (event) => events.push(event))
    await vi.advanceTimersByTimeAsync(TURN_TIMEOUT_MS + 1000)
    await turn

    answersLate('(pass)')

    expect(transcripts['к-1'].some((one) => one.from === 'smeta')).toBe(false)
    expect(events.at(-1)?.kind).toBe('passed')
  })

  it('опоздавший нового круга не поднимает', async () => {
    // Круг закончен. Опоздавший, зовущий следующего, раскрутил бы разговор
    // заново — уже без человека.
    vi.useFakeTimers()
    room(['smeta', 'gip'])
    answers = { smeta: [SLOW], gip: ['(pass)'] }

    const turn = askRoom('к-1', 'вопрос', () => {})
    await vi.advanceTimersByTimeAsync(TURN_TIMEOUT_MS + 1000)
    await turn
    const before = asked.length

    answersLate('@Главный-инженер посмотри')

    expect(asked.length).toBe(before)
  })
})

describe('сколько ответит', () => {
  it('комната говорит это ДО отправки', async () => {
    room(['smeta', 'elektrika', 'gip'])

    expect(await willAnswer('к-1', 'общий вопрос')).toEqual(['smeta', 'elektrika', 'gip'])
    expect(await willAnswer('к-1', '@Смета только тебе')).toEqual(['smeta'])
  })
})
