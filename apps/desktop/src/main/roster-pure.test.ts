// Задачи 3C.1 и 3D.6 (SPEC UR27, контракт — specs/agent-roster.md §Р6).
//
// Проверяется единственное, что от разбора осталось после переезда роестра на
// их плагин: из чего складывается СНИМОК, по которому инструмент `aec-roster`
// находит специалиста по имени. Всё остальное — лицо, занятость, версия наших
// полей, поиск и скрытие — теперь дело их плагина, и проверять его нашими
// тестами значило бы держать в дереве второе мнение о чужом коде.
//
// ГЛАВНОЕ ЗДЕСЬ — ЦЕПОЧКА ПОДПИСИ. Их плагин пишет имя специалиста в свой ключ
// `ui_meta`, наш прежний роестр писал в наш. Прочитать только свой значило бы,
// что `@Смета` не находит специалиста, заведённого после переезда: снимок
// принёс бы пустую подпись, и отказ выглядел бы как «такого нет».

import { describe, expect, it } from 'vitest'

import { parseRoster, parseSpecialist } from './roster-pure'

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'smeta',
    ui_meta: { 'hermes-bots': { title: 'Смета' } },
    ...overrides
  }
}

describe('разбор ответа ядра', () => {
  it('имя профиля и подпись доезжают', () => {
    expect(parseSpecialist(row())).toEqual({ name: 'smeta', title: 'Смета' })
  })

  it('ряд без имени — не специалист, а мусор', () => {
    expect(parseSpecialist({ ui_meta: { 'hermes-bots': { title: 'Смета' } } })).toBeNull()
    expect(parseSpecialist(null)).toBeNull()
  })

  it('профиль без наших полей — тоже специалист, просто без подписи', () => {
    expect(parseSpecialist(row({ ui_meta: undefined }))?.title).toBe('')
  })

  it('парсится список, а не что попало', () => {
    expect(parseRoster({ profiles: [row(), { name: 'gip' }, 42] })).toEqual([
      { name: 'smeta', title: 'Смета' },
      { name: 'gip', title: '' }
    ])
    expect(parseRoster({ profiles: 'нет' })).toEqual([])
    expect(parseRoster(undefined)).toEqual([])
  })
})

describe('откуда берётся подпись (задача 3D.6)', () => {
  it('подпись из ИХ ключа: специалист, заведённый в их поверхности', () => {
    expect(parseSpecialist(row())?.title).toBe('Смета')
  })

  it('подпись из НАШЕГО ключа: специалист, заведённый до переезда', () => {
    const parsed = parseSpecialist(row({ ui_meta: { aecpilot: { title: 'Электрика' } } }))

    expect(parsed?.title).toBe('Электрика')
  })

  it('их подпись старше нашей: переименовали там, где роестр рисуют сейчас', () => {
    const parsed = parseSpecialist(
      row({ ui_meta: { aecpilot: { title: 'Старое' }, 'hermes-bots': { title: 'Новое' } } })
    )

    expect(parsed?.title).toBe('Новое')
  })

  it('в хвосте — собственное поле ядра, если подписи нет ни у кого', () => {
    const parsed = parseSpecialist(row({ ui_meta: {}, display_name: 'Нормоконтроль' }))

    expect(parsed?.title).toBe('Нормоконтроль')
  })

  it('пробельная подпись — это отсутствие подписи, а не подпись из пробелов', () => {
    const parsed = parseSpecialist(
      row({ ui_meta: { 'hermes-bots': { title: '   ' } }, display_name: 'ГИП' })
    )

    expect(parsed?.title).toBe('ГИП')
  })

  it('чужое в ui_meta не мешает и не подставляется вместо подписи', () => {
    const parsed = parseSpecialist(
      row({ ui_meta: { 'hermes-bots': { chat: 'их-сессия' }, kanban: { title: 'Чужое' } } })
    )

    expect(parsed?.title).toBe('')
  })
})
