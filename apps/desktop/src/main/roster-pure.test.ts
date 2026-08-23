// Задача 3C.1 (SPEC UR27, контракт — specs/agent-roster.md). Проверяется то, от
// чего зависит, увидит ли человек своих специалистов такими, какими их оставил:
// разбор ответа ядра, наши поля рядом с чужими, исходы сохранения и запрет
// удалить того, на ком всё держится. Исходов стало четыре (3C.4в): расхождение
// версий — не «сохранено локально», а «сохранять было уже некуда».

import { describe, expect, it } from 'vitest'

import {
  duplicateName,
  displayNameOf,
  hasHidden,
  isValidSpecialistName,
  metaPatch,
  OUR_META_KEY,
  parseRoster,
  parseSpecialist,
  refuseSpecialistDeletion,
  saveOutcome,
  searchRoster,
  visibleRoster,
  type Specialist
} from './roster-pure'

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'smeta',
    is_default: false,
    model: 'gpt-5',
    provider: 'openai',
    description: 'считает объёмы',
    ui_meta: { aecpilot: { title: 'Смета', role: 'сметчик' } },
    has_avatar: false,
    last_session: { preview: 'посчитал раздел 3', updated_at: '2026-08-22T10:00:00Z' },
    ...overrides
  }
}

function specialist(overrides: Partial<Specialist> = {}): Specialist {
  return {
    name: 'smeta',
    title: 'Смета',
    role: 'сметчик',
    description: '',
    isDefault: false,
    model: '',
    provider: '',
    face: null,
    hasAvatar: false,
    hidden: false,
    chatSessionId: '',
    preview: '',
    previewAt: '',
    busy: false,
    ...overrides
  }
}

describe('разбор ответа ядра', () => {
  it('имя, подпись, роль и последняя реплика доезжают', () => {
    const parsed = parseSpecialist(row())

    expect(parsed).toEqual({
      name: 'smeta',
      title: 'Смета',
      role: 'сметчик',
      description: 'считает объёмы',
      isDefault: false,
      model: 'gpt-5',
      provider: 'openai',
      face: null,
      hasAvatar: false,
      hidden: false,
      chatSessionId: '',
      preview: 'посчитал раздел 3',
      previewAt: '2026-08-22T10:00:00Z',
      busy: false
    })
  })

  // Задача 3C.4в. Ядро 0.20.5 отдаёт в строке профиля рабочую сессию и версию
  // наших метаданных; ядро постарше — нет, и это не ошибка, а «проверять нечем».
  it('рабочая сессия читается как «сейчас занят»', () => {
    expect(parseSpecialist(row({ worker_session: { id: 'w-1', source: 'kanban' } }))?.busy).toBe(
      true
    )
    expect(parseSpecialist(row({ worker_session: null }))?.busy).toBe(false)
    expect(parseSpecialist(row())?.busy).toBe(false)
  })

  it('версия метаданных читается, а её отсутствие — это отсутствие, а не ноль', () => {
    expect(parseSpecialist(row({ ui_meta_revisions: { aecpilot: 3 } }))?.revision).toBe(3)
    expect(parseSpecialist(row({ ui_meta_revisions: {} }))?.revision).toBeUndefined()
    expect(parseSpecialist(row())?.revision).toBeUndefined()
    expect(
      parseSpecialist(row({ ui_meta_revisions: { aecpilot: 'три' } }))?.revision
    ).toBeUndefined()
  })

  it('ряд без имени — не специалист, а мусор', () => {
    expect(parseSpecialist({ description: 'без имени' })).toBeNull()
    expect(parseSpecialist(null)).toBeNull()
  })

  it('профиль без наших полей — тоже специалист, просто без подписи', () => {
    const parsed = parseSpecialist(row({ ui_meta: undefined }))

    expect(parsed?.title).toBe('')
    expect(displayNameOf(parsed as Specialist), 'подписью служит имя профиля').toBe('smeta')
  })

  it('чужие поля в ui_meta не мешают', () => {
    const parsed = parseSpecialist(
      row({ ui_meta: { 'hermes-bots': { chat: 'их-сессия' }, aecpilot: { title: 'Наш' } } })
    )

    expect(parsed?.title).toBe('Наш')
    expect(parsed?.chatSessionId, 'чужая привязка чата — не наша').toBe('')
  })

  it('лицо принимается только цветом и известной формой', () => {
    expect(
      parseSpecialist(row({ ui_meta: { aecpilot: { face: { shape: 'hex', color: '#ff0' } } } }))
        ?.face
    ).toEqual({
      shape: 'hex',
      color: '#ff0'
    })
    expect(
      parseSpecialist(
        row({ ui_meta: { aecpilot: { face: { shape: 'hex', color: 'red; content:x' } } } })
      )?.face,
      'строка из чужих данных не должна уезжать в стиль'
    ).toBeNull()
    expect(
      parseSpecialist(row({ ui_meta: { aecpilot: { face: { shape: 'звезда', color: '#fff' } } } }))
        ?.face
    ).toBeNull()
  })

  it('ответ без списка — пустой роестр, а не падение', () => {
    expect(parseRoster({})).toEqual([])
    expect(parseRoster(null)).toEqual([])
    expect(parseRoster({ profiles: [row(), { нет: 'имени' }] })).toHaveLength(1)
  })
})

describe('имя профиля', () => {
  it('годится в путь и в сегмент адреса', () => {
    expect(isValidSpecialistName('smeta')).toBe(true)
    expect(isValidSpecialistName('smeta-2')).toBe(true)
    expect(isValidSpecialistName('..')).toBe(false)
    expect(isValidSpecialistName('a/b')).toBe(false)
    expect(isValidSpecialistName('')).toBe(false)
    expect(isValidSpecialistName('-начинается-с-дефиса')).toBe(false)
    expect(isValidSpecialistName(42)).toBe(false)
  })
})

describe('запись наших полей', () => {
  it('уходит только то, что меняли — соседей не затираем', () => {
    expect(metaPatch({ title: '  Смета  ' })).toEqual({ [OUR_META_KEY]: { title: 'Смета' } })
    expect(metaPatch({})).toEqual({ [OUR_META_KEY]: {} })
  })

  it('лицо убирается явным null, а не пропуском поля', () => {
    expect(metaPatch({ face: null })).toEqual({ [OUR_META_KEY]: { face: null } })
  })

  it('наши поля лежат под своим именем — чужие рядом не страдают', () => {
    expect(Object.keys(metaPatch({ role: 'ГИП' }))).toEqual([OUR_META_KEY])
  })
})

describe('четыре исхода сохранения', () => {
  it('сервер принял', () => {
    expect(saveOutcome({ applied: { ui_meta: true } })).toBe('server')
  })

  it('старое ядро — сохранено только здесь, и это НЕ отказ', () => {
    expect(saveOutcome({ applied: { ui_meta: false } })).toBe('local-only')
    // Задача 3C.4в: расхождение версий — НЕ «сохранено только здесь». Правка не
    // сохранена нигде, и поверх лежит чужая; сказать «локально» значит соврать.
    expect(
      saveOutcome({
        ok: false,
        applied: { ui_meta: false, ui_meta_conflicts: { aecpilot: { expected: 0, actual: 1 } } }
      })
    ).toBe('conflict')
    expect(saveOutcome({ applied: { ui_meta: true, ui_meta_conflicts: {} } })).toBe('server')
    expect(saveOutcome({ applied: {} })).toBe('local-only')
    expect(saveOutcome(null)).toBe('local-only')
  })
})

describe('список на экране', () => {
  const roster = [
    specialist({ name: 'smeta', title: 'Смета', role: 'сметчик' }),
    specialist({ name: 'norm', title: 'Нормоконтроль', role: 'проверка' }),
    specialist({ name: 'gip', title: '', role: 'ГИП', hidden: true })
  ]

  it('поиск идёт по подписи, имени профиля и роли, порядок сохраняется', () => {
    expect(searchRoster(roster, 'СМЕТ').map((s) => s.name)).toEqual(['smeta'])
    expect(searchRoster(roster, 'norm').map((s) => s.name)).toEqual(['norm'])
    expect(searchRoster(roster, 'гип').map((s) => s.name)).toEqual(['gip'])
  })

  it('пустой запрос возвращает ТОТ ЖЕ список', () => {
    expect(searchRoster(roster, '   ')).toBe(roster)
  })

  it('скрытые не показываются, пока не попросят', () => {
    expect(visibleRoster(roster, false).map((s) => s.name)).toEqual(['smeta', 'norm'])
    expect(visibleRoster(roster, true)).toHaveLength(3)
    expect(hasHidden(roster)).toBe(true)
    expect(hasHidden(roster.slice(0, 2))).toBe(false)
  })
})

describe('удаление', () => {
  it('специалиста по умолчанию удалить нельзя', () => {
    expect(refuseSpecialistDeletion(specialist({ isDefault: true }))).toContain('по умолчанию')
  })

  it('обычного — можно', () => {
    expect(refuseSpecialistDeletion(specialist())).toBeNull()
  })

  it('несуществующего — отказ с причиной, а не тишина', () => {
    expect(refuseSpecialistDeletion(undefined)).toBe('Такого специалиста нет')
  })
})

describe('имя дубля', () => {
  it('первый дубль — с двойкой', () => {
    expect(duplicateName('smeta', ['smeta'])).toBe('smeta-2')
  })

  it('дубль дубля не растит хвост', () => {
    expect(duplicateName('smeta-2', ['smeta', 'smeta-2'])).toBe('smeta-3')
  })

  it('занятые номера пропускаются', () => {
    expect(duplicateName('smeta', ['smeta', 'smeta-2', 'smeta-3'])).toBe('smeta-4')
  })
})
