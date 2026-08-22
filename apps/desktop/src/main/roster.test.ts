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
  openCanonicalChat,
  saveSpecialist,
  setSpecialistHidden
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

// Задача 3C.2. Расширенные возможности специалиста: своя модель, свой SOUL,
// поштучный выбор скилов, тулсетов и MCP, клонирование с существующего.
describe('расширенные возможности', () => {
  it('модель уходит ТОЛЬКО парой с провайдером', async () => {
    request.mockResolvedValue({ applied: { ui_meta: true } })

    await saveSpecialist({ name: 'smeta', model: 'gpt-5' })

    expect(
      request.mock.calls[0][1],
      'половина назначения — это ничего не сделать, отчитавшись успехом'
    ).not.toHaveProperty('model')

    await saveSpecialist({ name: 'smeta', model: 'gpt-5', provider: 'openai' })

    expect(request.mock.calls[1][1]).toMatchObject({ model: 'gpt-5', provider: 'openai' })
  })

  it('скилы, тулсеты и MCP идут замещением, как их понимает ядро', async () => {
    request.mockResolvedValue({ applied: { ui_meta: true } })

    await saveSpecialist({
      name: 'smeta',
      disabledSkills: ['aec-qa'],
      enabledToolsets: ['files'],
      enabledMcpServers: ['aec-sources']
    })

    expect(request.mock.calls[0][1]).toMatchObject({
      disabled_skills: ['aec-qa'],
      enabled_toolsets: ['files'],
      enabled_mcp_servers: ['aec-sources']
    })
  })

  it('пустой список — это «ничего не выбрано», а не «не менять»', async () => {
    request.mockResolvedValue({ applied: { ui_meta: true } })

    await saveSpecialist({ name: 'smeta', enabledToolsets: [] })

    expect(request.mock.calls[0][1]).toMatchObject({ enabled_toolsets: [] })
  })

  it('неудачный раздел гасит «сохранено», а не прячется за ним', async () => {
    request.mockResolvedValue({ applied: { ui_meta: true, model: false, skills: true } })

    const result = await saveSpecialist({ name: 'smeta', model: 'gpt-5', provider: 'openai' })

    expect(result.ok, 'иначе человек уходит уверенным в том, чего не произошло').toBe(false)
    expect(result.failed).toEqual(['model'])
  })

  it('клонирование делает само ядро — вместе с доступами', async () => {
    request.mockResolvedValue({ applied: { ui_meta: true } })

    await createSpecialist({ name: 'norm', cloneFrom: 'smeta', soul: 'Ты нормоконтролёр.' })

    expect(request.mock.calls[0][1]).toMatchObject({
      name: 'norm',
      clone_from: 'smeta',
      soul: 'Ты нормоконтролёр.'
    })
  })
})

// Задача 3C.4. Постоянный чат: у специалиста один непрерывный разговор, и он
// обязан пережить перезапуск, сжатие и молчание ядра.
describe('постоянный чат', () => {
  it('живая привязка открывается как есть — ничего не создаём и не пишем', async () => {
    request.mockResolvedValue({
      profiles: [
        profileRow('smeta', {
          ui_meta: { aecpilot: { chat: 'с-1' } },
          preferred_session: { session_id: 'с-1' }
        })
      ]
    })

    const result = await openCanonicalChat('smeta', 'с-1')

    expect(result).toEqual({ ok: true, sessionId: 'с-1', created: false })
    expect(request.mock.calls.map((call) => call[0])).toEqual(['profiles.list'])
  })

  it('известная привязка избавляет от лишнего вопроса ядру', async () => {
    request.mockResolvedValue({
      profiles: [profileRow('smeta', { preferred_session: { session_id: 'с-1' } })]
    })

    await openCanonicalChat('smeta', 'с-1')

    expect(request.mock.calls[0][1]).toMatchObject({ preferred_session_ids: { smeta: 'с-1' } })
  })

  it('ядро молчит — открываем привязку и НИЧЕГО не переписываем', async () => {
    request.mockImplementation(async () => {
      throw new Error('нет связи')
    })

    expect(await openCanonicalChat('smeta', 'с-1')).toEqual({
      ok: true,
      sessionId: 'с-1',
      created: false
    })
  })

  it('сессия пропала — перепривязка на показанную, без новой', async () => {
    request.mockImplementation(async (method: string) => {
      if (method === 'profiles.list') {
        return {
          profiles: [
            profileRow('smeta', {
              preferred_session: null,
              last_session: { session_id: 'с-2' }
            })
          ]
        }
      }
      return { applied: { ui_meta: true } }
    })

    const result = await openCanonicalChat('smeta', 'с-1')

    expect(result).toEqual({ ok: true, sessionId: 'с-2', created: false })

    const configured = request.mock.calls.find((call) => call[0] === 'profiles.configure')
    expect(
      (configured?.[1] as { ui_meta: { aecpilot: { chat: string } } }).ui_meta.aecpilot.chat
    ).toBe('с-2')
  })

  it('нового специалиста ведём в СКРЫТУЮ сессию его профиля', async () => {
    request.mockImplementation(async (method: string) => {
      if (method === 'profiles.list') return { profiles: [profileRow('smeta')] }
      if (method === 'session.create') return { session_id: 'с-новая' }
      return { applied: { ui_meta: true } }
    })

    const result = await openCanonicalChat('smeta', '')

    expect(result).toEqual({ ok: true, sessionId: 'с-новая', created: true })

    const created = request.mock.calls.find((call) => call[0] === 'session.create')
    expect(created?.[1]).toMatchObject({ hidden: true, profile: 'smeta' })
  })

  it('привязка не легла — чат всё равно открыт', async () => {
    request.mockImplementation(async (method: string) => {
      if (method === 'profiles.list') return { profiles: [profileRow('smeta')] }
      if (method === 'session.create') return { session_id: 'с-новая' }
      throw new Error('метаданные не сохранились')
    })

    expect((await openCanonicalChat('smeta', '')).sessionId).toBe('с-новая')
  })

  it('негодное имя до ядра не доходит', async () => {
    expect((await openCanonicalChat('../побег')).ok).toBe(false)
    expect(request).not.toHaveBeenCalled()
  })
})

// Задача 3C.8. Скрытие — это поле в метаданных профиля, то есть на сервере:
// скрытый здесь скрыт и на другой машине. И ничего, кроме места в списке, оно
// не меняет.
describe('скрытие', () => {
  it('пишется в наши поля профиля, а не локально', async () => {
    request.mockResolvedValue({ applied: { ui_meta: true } })

    expect(await setSpecialistHidden('smeta', true)).toEqual({
      ok: true,
      name: 'smeta',
      outcome: 'server'
    })
    expect(request).toHaveBeenCalledWith('profiles.configure', {
      name: 'smeta',
      ui_meta: { aecpilot: { hidden: true } }
    })
  })

  it('возврат в список — то же поле со значением «нет»', async () => {
    request.mockResolvedValue({ applied: { ui_meta: true } })

    await setSpecialistHidden('smeta', false)

    expect(request.mock.calls[0][1]).toMatchObject({ ui_meta: { aecpilot: { hidden: false } } })
  })

  it('негодное имя до ядра не доходит', async () => {
    expect((await setSpecialistHidden('../побег', true)).ok).toBe(false)
    expect(request).not.toHaveBeenCalled()
  })
})
