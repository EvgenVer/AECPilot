// Задача 3C.5 (SPEC UR27, контракт — specs/agent-roster.md §Р7). Главное здесь:
// рутина принадлежит СПЕЦИАЛИСТУ, и привязка не должна теряться по дороге —
// поручить расписание не тому агенту значит узнать об этом, когда оно сработает.

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  configureRoutines,
  createRoutine,
  listRoutines,
  parseRoutine,
  runRoutineNow,
  setRoutineEnabled
} from './routines'

const rest = vi.fn()

beforeEach(() => {
  rest.mockReset()
  configureRoutines({ rest, target: () => undefined })
})

describe('разбор расписания', () => {
  it('берёт человеческую запись расписания, а не выражение cron', () => {
    expect(
      parseRoutine({
        id: 'j1',
        name: 'Пересчёт объёмов',
        prompt: 'посчитай',
        schedule_display: 'каждую пятницу в 9:00',
        schedule: { expr: '0 9 * * 5' },
        enabled: true
      })
    ).toMatchObject({ schedule: 'каждую пятницу в 9:00', enabled: true })
  })

  it('без человеческой записи показывает выражение — молчать нельзя', () => {
    expect(parseRoutine({ id: 'j1', schedule: { expr: '0 9 * * 5' } })?.schedule).toBe('0 9 * * 5')
  })

  it('ряд без идентификатора — мусор', () => {
    expect(parseRoutine({ name: 'без id' })).toBeNull()
    expect(parseRoutine(null)).toBeNull()
  })
})

describe('список рутин специалиста', () => {
  it('спрашивается ЕГО профиль, а не текущий', async () => {
    rest.mockResolvedValue([])

    await listRoutines('smeta')

    expect(rest.mock.calls[0]).toEqual(['/api/cron/jobs', { query: { profile: 'smeta' } }])
  })

  it('считает и общее число — ради фразы «рутины есть, но не у этого»', async () => {
    rest.mockImplementation(async (_path: string, options: { query: { profile: string } }) =>
      options.query.profile === 'smeta' ? [] : [{ id: 'j1' }, { id: 'j2' }]
    )

    expect(await listRoutines('smeta')).toEqual({ routines: [], totalOfAll: 2 })
  })

  it('неудача общего счёта не роняет свой список', async () => {
    rest.mockImplementation(async (_path: string, options: { query: { profile: string } }) => {
      if (options.query.profile === 'all') throw new Error('не спросили')
      return [{ id: 'j1', name: 'Моя' }]
    })

    const result = await listRoutines('smeta')

    expect(result.routines).toHaveLength(1)
    expect(result.totalOfAll).toBe(0)
  })
})

describe('создание', () => {
  it('профиль уходит в запросе — иначе рутина достанется не тому', async () => {
    rest.mockResolvedValue({})

    await createRoutine('smeta', {
      name: 'Пересчёт',
      prompt: 'посчитай объёмы',
      schedule: 'каждую пятницу'
    })

    expect(rest.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      query: { profile: 'smeta' },
      body: { name: 'Пересчёт', prompt: 'посчитай объёмы', schedule: 'каждую пятницу' }
    })
  })

  it('без задания или расписания до ядра не идём', async () => {
    expect((await createRoutine('smeta', { name: 'x', prompt: '  ', schedule: 'пт' })).ok).toBe(
      false
    )
    expect(rest).not.toHaveBeenCalled()
  })

  it('отказ ядра доходит словами', async () => {
    rest.mockImplementation(async () => {
      throw new Error('расписание не разобрано')
    })

    expect(await createRoutine('smeta', { name: '', prompt: 'п', schedule: 'с' })).toEqual({
      ok: false,
      error: 'расписание не разобрано'
    })
  })
})

describe('пауза и запуск', () => {
  it('пауза и возврат — разные точки ядра', async () => {
    rest.mockResolvedValue({})

    await setRoutineEnabled('smeta', 'j1', false)
    await setRoutineEnabled('smeta', 'j1', true)

    expect(rest.mock.calls[0][0]).toBe('/api/cron/jobs/j1/pause')
    expect(rest.mock.calls[1][0]).toBe('/api/cron/jobs/j1/resume')
  })

  it('«выполнить сейчас» идёт с профилем специалиста', async () => {
    rest.mockResolvedValue({})

    await runRoutineNow('smeta', 'j1')

    expect(rest.mock.calls[0]).toEqual([
      '/api/cron/jobs/j1/trigger',
      { method: 'POST', query: { profile: 'smeta' } }
    ])
  })

  it('неудачная пауза — это ответ, а не исключение наружу', async () => {
    rest.mockImplementation(async () => {
      throw new Error('занято')
    })

    expect((await setRoutineEnabled('smeta', 'j1', false)).ok).toBe(false)
  })
})
