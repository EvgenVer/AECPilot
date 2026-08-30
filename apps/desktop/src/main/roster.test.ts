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

/** Вызов записи наших полей. По номеру их искать нельзя: перед записью идёт
 * чтение — наш блок ядро сливает целиком, и писать его вслепую значит стирать
 * соседние поля (замерено, `runtime/ui-meta-merge-probe.mjs`). */
function called(method: string): Record<string, unknown> {
  const call = request.mock.calls.find((one) => one[0] === method)
  return (call?.[1] ?? {}) as Record<string, unknown>
}

function configured(): Record<string, unknown> {
  return called('profiles.configure')
}

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

    // Между ними — чтение: наш блок ядро сливает целиком, и писать его, не
    // прочитав, значит стереть соседние поля (`runtime/ui-meta-merge-probe.mjs`).
    expect(request.mock.calls.map((call) => call[0])).toEqual([
      'profiles.create',
      'profiles.list',
      'profiles.configure'
    ])
    expect(result).toEqual({ ok: true, name: 'smeta', outcome: 'server', error: undefined })
  })

  it('в ядро уходят только те наши поля, что заданы', async () => {
    request.mockResolvedValue({ applied: { ui_meta: true } })

    await createSpecialist({ name: 'smeta', title: 'Смета' })

    expect(configured()).toEqual({
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

// Задача 3C.4в. Весь роестр живёт в ОДНОМ поле метаданных, и запись туда — это
// запись поля целиком: без условия две правки из разных окон молча оставляли
// последнюю.
describe('одновременная правка из двух окон', () => {
  it('версия, на которой основана правка, уходит условием', async () => {
    request.mockResolvedValue({ applied: { ui_meta: true } })

    await saveSpecialist({ name: 'smeta', title: 'Смета', revision: 7 })

    expect(configured()).toMatchObject({
      ui_meta_expected_revisions: { aecpilot: 7 }
    })
  })

  it('версии нет — условия нет: ноль требовал бы, чтобы поле не трогали НИКОГДА', async () => {
    request.mockResolvedValue({ applied: { ui_meta: true } })

    await saveSpecialist({ name: 'smeta', title: 'Смета' })

    expect(configured()).not.toHaveProperty('ui_meta_expected_revisions')
  })

  it('расхождение — это отказ, а не «сохранено только здесь»', async () => {
    // Ядро сообщает расхождение УСПЕШНЫМ ответом, отказ лежит внутри
    // (замерено на 0.20.5). Читатель, смотрящий только на исключение, принял бы
    // отвергнутую запись за сохранённую.
    request.mockResolvedValue({
      ok: false,
      applied: {
        ui_meta: false,
        ui_meta_conflicts: { aecpilot: { expected: 0, actual: 1 } }
      }
    })

    expect(await saveSpecialist({ name: 'smeta', title: 'Смета', revision: 0 })).toMatchObject({
      ok: false,
      outcome: 'conflict'
    })
  })

  it('скрытие тоже идёт с условием', async () => {
    request.mockResolvedValue({ applied: { ui_meta: true } })

    await setSpecialistHidden('smeta', true, 4)

    expect(configured()).toMatchObject({
      ui_meta_expected_revisions: { aecpilot: 4 }
    })
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

    expect(configured()).toEqual({
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
      configured(),
      'половина назначения — это ничего не сделать, отчитавшись успехом'
    ).not.toHaveProperty('model')

    request.mockClear()

    await saveSpecialist({ name: 'smeta', model: 'gpt-5', provider: 'openai' })

    expect(configured()).toMatchObject({ model: 'gpt-5', provider: 'openai' })
  })

  it('скилы, тулсеты и MCP идут замещением, как их понимает ядро', async () => {
    request.mockResolvedValue({ applied: { ui_meta: true } })

    await saveSpecialist({
      name: 'smeta',
      disabledSkills: ['aec-qa'],
      enabledToolsets: ['files'],
      enabledMcpServers: ['aec-sources']
    })

    expect(configured()).toMatchObject({
      disabled_skills: ['aec-qa'],
      enabled_toolsets: ['files'],
      enabled_mcp_servers: ['aec-sources']
    })
  })

  it('пустой список — это «ничего не выбрано», а не «не менять»', async () => {
    request.mockResolvedValue({ applied: { ui_meta: true } })

    await saveSpecialist({ name: 'smeta', enabledToolsets: [] })

    expect(configured()).toMatchObject({ enabled_toolsets: [] })
  })

  it('неудачный раздел гасит «сохранено», а не прячется за ним', async () => {
    request.mockResolvedValue({ applied: { ui_meta: true, model: false, skills: true } })

    const result = await saveSpecialist({ name: 'smeta', model: 'gpt-5', provider: 'openai' })

    expect(result.ok, 'иначе человек уходит уверенным в том, чего не произошло').toBe(false)
    expect(result.failed).toEqual(['model'])
  })

  it('правка одного поля не стирает остальные — блок уходит целиком', async () => {
    // ЗАМЕРЕНО на живом ядре 0.20.5 (`runtime/ui-meta-merge-probe.mjs`): ядро
    // сливает `ui_meta` по ключам ВЕРХНЕГО уровня, то есть по `aecpilot`
    // целиком. Отправить `{aecpilot: {title}}` — значит стереть роль, облик,
    // признак скрытия, привязку постоянного чата и состав комнат. Первая
    // версия писала именно так; это тот тест, которого тогда не было.
    request.mockImplementation(async (method: string) =>
      method === 'profiles.list'
        ? {
            profiles: [
              profileRow('smeta', {
                ui_meta: {
                  aecpilot: {
                    title: 'Смета',
                    role: 'сметчик',
                    hidden: true,
                    chat: 'с-1',
                    groups: { 'к-1': { members: ['smeta', 'gip'] } }
                  }
                }
              })
            ]
          }
        : { applied: { ui_meta: true } }
    )

    await saveSpecialist({ name: 'smeta', title: 'Сметчик' })

    expect(configured().ui_meta).toEqual({
      aecpilot: {
        title: 'Сметчик',
        role: 'сметчик',
        hidden: true,
        chat: 'с-1',
        groups: { 'к-1': { members: ['smeta', 'gip'] } }
      }
    })
  })

  it('клонирование делает само ядро — вместе с доступами', async () => {
    request.mockResolvedValue({ applied: { ui_meta: true } })

    await createSpecialist({ name: 'norm', cloneFrom: 'smeta', soul: 'Ты нормоконтролёр.' })

    expect(called('profiles.create')).toMatchObject({
      name: 'norm',
      clone_from: 'smeta',
      soul: 'Ты нормоконтролёр.'
    })
  })
})

// Задача 3C.4, переписана под схему ядра 0.20.6 (задача 3.B2б): постоянный чат
// опознаётся ИМЕНЕМ в реестре ядра, а не нашей привязкой. Проверяется, что
// разговор переживает перезапуск и сжатие — и, главное, что недоступный реестр
// не превращается во второй чат.
describe('постоянный чат', () => {
  it('реестровая строка есть — открываем её и ничего не создаём', async () => {
    request.mockImplementation(async (method: string) => {
      if (method === 'session.list') return { sessions: [{ id: 'с-1', title: 'Bot Chat' }] }
      if (method === 'profiles.list') return { profiles: [profileRow('smeta')] }
      return {}
    })

    expect(await openCanonicalChat('smeta')).toEqual({
      ok: true,
      sessionId: 'с-1',
      created: false
    })
    expect(request.mock.calls.some((call) => call[0] === 'session.create')).toBe(false)
  })

  it('спрашиваем реестр точным поиском, а не перебором окна выдачи', async () => {
    request.mockImplementation(async (method: string) => {
      if (method === 'session.list') return { sessions: [{ id: 'с-1', title: 'Bot Chat' }] }
      if (method === 'profiles.list') return { profiles: [profileRow('smeta')] }
      return {}
    })

    await openCanonicalChat('smeta')

    // `title` — индексированный поиск: занятый профиль выталкивает вечный чат
    // за любое окно свежести. `include_hidden` — эти чаты всегда скрыты.
    expect(called('session.list')).toEqual({
      profile: 'smeta',
      title: 'Bot Chat',
      include_hidden: true
    })
  })

  it('РЕЕСТР НЕДОСТУПЕН — отказываем, а не заводим второй чат', async () => {
    request.mockImplementation(async () => {
      throw new Error('нет связи')
    })

    const result = await openCanonicalChat('smeta')

    expect(result.ok).toBe(false)
    expect(result.sessionId).toBeUndefined()
    // Вот это и есть суть проверки: их сбой жил ровно здесь — проглоченная
    // ошибка поиска уводила прямо в создание, и человек читал это как
    // «специалист забыл всё».
    expect(request.mock.calls.some((call) => call[0] === 'session.create')).toBe(false)
  })

  it('чата нет, но переписка была — называем её и скрываем', async () => {
    request.mockImplementation(async (method: string) => {
      if (method === 'session.list') return { sessions: [] }
      if (method === 'profiles.list') {
        return { profiles: [profileRow('smeta', { last_session: { session_id: 'старая' } })] }
      }
      return {}
    })

    expect(await openCanonicalChat('smeta')).toEqual({
      ok: true,
      sessionId: 'старая',
      created: false
    })

    expect(called('session.title')).toEqual({ session_id: 'старая', title: 'Bot Chat' })
    // Скрытость не косметика: ядро отказывает в переименовании только скрытой
    // строки, то есть без неё защита заголовка не включается.
    expect(called('session.set_hidden')).toEqual({ session_id: 'старая', hidden: true })
  })

  it('новый специалист: создаём и НЕМЕДЛЕННО называем', async () => {
    request.mockImplementation(async (method: string) => {
      if (method === 'session.list') return { sessions: [] }
      if (method === 'profiles.list') return { profiles: [profileRow('smeta')] }
      if (method === 'session.create') return { session_id: 'с-новая' }
      return {}
    })

    expect(await openCanonicalChat('smeta')).toEqual({
      ok: true,
      sessionId: 'с-новая',
      created: true
    })

    expect(called('session.create')).toMatchObject({
      profile: 'smeta',
      title: 'Bot Chat',
      hidden: true
    })
    // Второй шаг обязателен: `session.create` ленивый, строки в базе нет до
    // первого сообщения, и пока она не названа — реестра «Bot Chat» не
    // существует. Второй клик в это окно завёл бы дубликат.
    expect(called('session.title')).toEqual({ session_id: 'с-новая', title: 'Bot Chat' })
    // Третий шаг тоже обязателен, и это ЗАМЕР, а не осторожность: `session.title`
    // заводит строку, но отложенную скрытость не переносит
    // (`runtime/canonical-chat-probe.mjs`). А защита заголовка от переименования
    // включается только у скрытой строки — без этого шага личность держалась бы
    // на честном слове.
    expect(called('session.set_hidden')).toEqual({ session_id: 'с-новая', hidden: true })
  })

  it('заголовок заняли между промахом и записью — открываем победителя', async () => {
    let listed = 0
    request.mockImplementation(async (method: string) => {
      if (method === 'session.list') {
        listed += 1
        // Первый поиск ничего не нашёл, второй (после отказа) видит чужую
        // строку: её и открываем, свою пустую бросаем.
        return listed === 1 ? { sessions: [] } : { sessions: [{ id: 'победитель', title: 'Bot Chat' }] }
      }
      if (method === 'profiles.list') return { profiles: [profileRow('smeta')] }
      if (method === 'session.create') return { session_id: 'наша-пустая' }
      if (method === 'session.title') throw new Error("Title 'Bot Chat' is already in use by session победитель")
      return {}
    })

    expect(await openCanonicalChat('smeta')).toEqual({
      ok: true,
      sessionId: 'победитель',
      created: false
    })
  })

  it('сжатая переписка открывается живой вершиной, а не корнем реестра', async () => {
    request.mockImplementation(async (method: string) => {
      if (method === 'session.list') {
        return { sessions: [{ id: 'корень', resolved_id: 'вершина', root_title: 'Bot Chat' }] }
      }
      if (method === 'profiles.list') return { profiles: [profileRow('smeta')] }
      return {}
    })

    expect((await openCanonicalChat('smeta')).sessionId).toBe('вершина')
  })

  it('двойной клик не заводит два чата', async () => {
    let creates = 0
    request.mockImplementation(async (method: string) => {
      if (method === 'session.list') return { sessions: [] }
      if (method === 'profiles.list') return { profiles: [profileRow('smeta')] }
      if (method === 'session.create') {
        creates += 1
        return { session_id: 'с-новая' }
      }
      return {}
    })

    const [first, second] = await Promise.all([
      openCanonicalChat('smeta'),
      openCanonicalChat('smeta')
    ])

    expect(creates).toBe(1)
    expect(first.sessionId).toBe('с-новая')
    expect(second.sessionId).toBe('с-новая')
  })

  it('чужая строка с тем же заголовком в оконной выдаче не путается со своей', async () => {
    request.mockImplementation(async (method: string) => {
      if (method === 'session.list') {
        // Ядро без поддержки `title` вернёт окно целиком — узнаём свою по
        // заголовку, а не по порядку.
        return { sessions: [{ id: 'чужая', title: 'Смета за март' }, { id: 'наша', title: 'Bot Chat' }] }
      }
      if (method === 'profiles.list') return { profiles: [profileRow('smeta')] }
      return {}
    })

    expect((await openCanonicalChat('smeta')).sessionId).toBe('наша')
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

    expect(configured()).toMatchObject({ ui_meta: { aecpilot: { hidden: false } } })
  })

  it('негодное имя до ядра не доходит', async () => {
    expect((await setSpecialistHidden('../побег', true)).ok).toBe(false)
    expect(request).not.toHaveBeenCalled()
  })
})
