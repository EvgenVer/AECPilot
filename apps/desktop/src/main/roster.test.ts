// Задача 3C.1 (SPEC UR27). Ядро подменяется: предмет проверки — ЧТО и в каком
// порядке мы у него просим, и что отвечаем человеку, когда часть шагов не
// удалась. Контракт — `specs/agent-roster.md`.

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  configureRoster,
  createSpecialist,
  deleteSpecialist,
  duplicateSpecialist,
  listRoster,
  saveSpecialist
} from './roster'

const request = vi.fn()
const deleteProfile = vi.fn()

function profileRow(name: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { name, is_default: false, description: '', ...extra }
}

beforeEach(() => {
  request.mockReset()
  deleteProfile.mockReset()
  configureRoster({ request, deleteProfile })
})

describe('список специалистов', () => {
  it('спрашивается вместе с последней репликой — иначе строки пустые', async () => {
    request.mockResolvedValue({ profiles: [] })

    await listRoster()

    expect(request).toHaveBeenCalledWith('profiles.list', { include_sessions: true })
  })

  it('разбирается в наши строки', async () => {
    request.mockResolvedValue({
      profiles: [profileRow('smeta', { ui_meta: { aecpilot: { title: 'Смета' } } })]
    })

    const roster = await listRoster()

    expect(roster).toHaveLength(1)
    expect(roster[0].title).toBe('Смета')
  })
})

describe('создание', () => {
  it('сначала профиль, потом наши поля', async () => {
    request.mockResolvedValue({ applied: { ui_meta: true } })

    const result = await createSpecialist({ name: 'smeta', title: 'Смета', role: 'сметчик' })

    expect(request.mock.calls.map((call) => call[0])).toEqual([
      'profiles.create',
      'profiles.configure'
    ])
    expect(result).toEqual({ ok: true, name: 'smeta', outcome: 'server', error: undefined })
  })

  it('в ядро уходят только те наши поля, что заданы', async () => {
    request.mockResolvedValue({ applied: { ui_meta: true } })

    await createSpecialist({ name: 'smeta', title: 'Смета' })

    expect(request.mock.calls[1][1]).toEqual({
      name: 'smeta',
      ui_meta: { aecpilot: { title: 'Смета' } }
    })
  })

  it('негодное имя не доходит до ядра — оно станет именем папки', async () => {
    const result = await createSpecialist({ name: '../побег' })

    expect(result.ok).toBe(false)
    expect(request).not.toHaveBeenCalled()
  })

  it('профиль создан, а подпись не легла — специалист ЕСТЬ, и это сказано', async () => {
    request.mockImplementation(async (method: string) => {
      if (method === 'profiles.create') return { ok: true }
      throw new Error('ядро отказало')
    })

    const result = await createSpecialist({ name: 'smeta', title: 'Смета' })

    expect(result.ok, 'делать вид, что профиля нет, значит потерять его молча').toBe(true)
    expect(result.outcome).toBe('refused')
    expect(result.error).toContain('ядро отказало')
  })

  it('ядро не завело профиль — это отказ, и второго шага нет', async () => {
    request.mockImplementation(async () => {
      throw new Error('такое имя занято')
    })

    const result = await createSpecialist({ name: 'smeta' })

    expect(result.ok).toBe(false)
    expect(request).toHaveBeenCalledTimes(1)
  })
})

describe('правка', () => {
  it('старое ядро — сохранено только здесь, а не «не удалось»', async () => {
    request.mockResolvedValue({ applied: { ui_meta: false } })

    expect(await saveSpecialist({ name: 'smeta', title: 'Смета' })).toEqual({
      ok: true,
      name: 'smeta',
      outcome: 'local-only'
    })
  })

  it('описание идёт отдельным полем ядра, а не в наши', async () => {
    request.mockResolvedValue({ applied: { ui_meta: true } })

    await saveSpecialist({ name: 'smeta', description: 'считает объёмы' })

    expect(request.mock.calls[0][1]).toEqual({
      name: 'smeta',
      description: 'считает объёмы',
      ui_meta: { aecpilot: {} }
    })
  })
})

describe('дубль', () => {
  it('копирует облик и роль, но не переписку', async () => {
    request.mockImplementation(async (method: string) => {
      if (method === 'profiles.list') {
        return {
          profiles: [
            profileRow('smeta', {
              ui_meta: {
                aecpilot: {
                  title: 'Смета',
                  role: 'сметчик',
                  chat: 'сессия-1',
                  face: { shape: 'hex', color: '#abc' }
                }
              }
            })
          ]
        }
      }
      return { applied: { ui_meta: true } }
    })

    const result = await duplicateSpecialist('smeta')

    expect(result.ok).toBe(true)
    expect(result.name).toBe('smeta-2')

    const configured = request.mock.calls.find((call) => call[0] === 'profiles.configure')
    const meta = (configured?.[1] as { ui_meta: { aecpilot: Record<string, unknown> } }).ui_meta
      .aecpilot

    expect(meta.role).toBe('сметчик')
    expect(meta.face).toEqual({ shape: 'hex', color: '#abc' })
    expect(meta.chat, 'скопированная привязка = двое пишут в одну переписку').toBeUndefined()
  })

  it('несуществующего дублировать нечего', async () => {
    request.mockResolvedValue({ profiles: [] })

    expect((await duplicateSpecialist('нет-такого')).ok).toBe(false)
  })
})

describe('удаление', () => {
  it('без подтверждения не спрашивается даже список', async () => {
    const result = await deleteSpecialist('smeta', false)

    expect(result.ok).toBe(false)
    expect(request).not.toHaveBeenCalled()
    expect(deleteProfile).not.toHaveBeenCalled()
  })

  it('специалист по умолчанию не удаляется', async () => {
    request.mockResolvedValue({ profiles: [profileRow('default', { is_default: true })] })

    const result = await deleteSpecialist('default', true)

    expect(result.ok).toBe(false)
    expect(result.error).toContain('по умолчанию')
    expect(deleteProfile).not.toHaveBeenCalled()
  })

  it('обычный удаляется по REST — метода RPC у ядра нет', async () => {
    request.mockResolvedValue({ profiles: [profileRow('smeta')] })
    deleteProfile.mockResolvedValue({ ok: true })

    expect(await deleteSpecialist('smeta', true)).toEqual({ ok: true, name: 'smeta' })
    expect(deleteProfile).toHaveBeenCalledWith('smeta')
  })

  it('негодное имя не доходит до ядра', async () => {
    const result = await deleteSpecialist('../..', true)

    expect(result.ok).toBe(false)
    expect(request).not.toHaveBeenCalled()
  })
})
