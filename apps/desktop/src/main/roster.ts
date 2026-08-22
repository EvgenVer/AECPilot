// Роестр специалистов — обращения к ядру (задача 3C.1, SPEC UR27).
//
// Решения и разбор — в `roster-pure.ts`; здесь только вызовы ядра и порядок, в
// котором они идут. Контракт целиком — `specs/agent-roster.md`.
//
// ПОЧЕМУ RPC, А НЕ REST. Список профилей есть и там, и там, но `profiles.list`
// по RPC отдаёт вместе с рядом наши поля (`ui_meta`), признак картинки и
// последнюю реплику — то, из чего состоит строка роестра. Через REST пришлось бы
// добирать это тремя запросами на каждого специалиста.
//
// СОЗДАНИЕ ИДЁТ В ДВА ШАГА и не может быть иначе: ядро заводит профиль по имени,
// а имя на экране, роль и облик — наши поля, которые кладутся следом. Если второй
// шаг не удался, профиль ОСТАЁТСЯ: он уже создан, и делать вид, что нет, значило
// бы потерять его молча.

import {
  displayNameOf,
  duplicateName,
  isValidSpecialistName,
  metaPatch,
  parseRoster,
  refuseSpecialistDeletion,
  saveOutcome,
  type SaveOutcome,
  type Specialist,
  type SpecialistFace
} from './roster-pure'

export interface RosterDeps {
  /** Вызов метода ядра. Приходит снаружи: где живёт шлюз, знает `index.ts`. */
  request: (method: string, params?: Record<string, unknown>) => Promise<unknown>
  /** Удаление профиля. ОТДЕЛЬНО от `request` не по вкусу, а по факту: метода
   * `profiles.delete` в ядре 0.20.4 НЕТ (замерено — в реестре шлюза только
   * list/create/describe/configure/set_asset/get_asset), удаление живёт по REST.
   * Их собственный тест на удаление говорит о том же: «предпочитает REST-путь». */
  deleteProfile: (name: string) => Promise<unknown>
}

let deps: RosterDeps | undefined

export function configureRoster(value: RosterDeps): void {
  deps = value
}

function core(): RosterDeps {
  if (!deps) throw new Error('роестр не подключён к ядру')
  return deps
}

export async function listRoster(): Promise<Specialist[]> {
  // `include_sessions` даёт последнюю реплику для строки списка. Без него
  // роестр — голые имена, по которым не видно, кто чем занят.
  return parseRoster(await core().request('profiles.list', { include_sessions: true }))
}

export interface SpecialistInput {
  name: string
  title?: string
  role?: string
  description?: string
  face?: SpecialistFace | null
}

export interface SpecialistOutcome {
  ok: boolean
  name?: string
  /** Куда легли наши поля: на сервер, только сюда или никуда. */
  outcome?: SaveOutcome
  error?: string
}

/**
 * Заводит специалиста.
 *
 * Имя проверяется здесь, а не только в окне: оно уезжает в имя каталога на
 * машине ядра, и «окно проверило» — не основание.
 */
export async function createSpecialist(input: SpecialistInput): Promise<SpecialistOutcome> {
  if (!isValidSpecialistName(input.name)) {
    return { ok: false, error: 'Имя из латинских букв, цифр, дефиса и подчёркивания' }
  }

  try {
    await core().request('profiles.create', { name: input.name })
  } catch (error: unknown) {
    return { ok: false, error: describe(error) }
  }

  const saved = await saveSpecialist(input)

  // Профиль создан — значит специалист есть, даже если подпись не легла.
  return { ok: true, name: input.name, outcome: saved.outcome, error: saved.error }
}

/** Меняет наши поля и описание. Отсутствующее поле не отправляется вовсе — см.
 * `metaPatch`: ядро сливает `ui_meta` по ключам, и пустое значение затёрло бы
 * то, что поставили на другой машине. */
export async function saveSpecialist(input: SpecialistInput): Promise<SpecialistOutcome> {
  if (!isValidSpecialistName(input.name)) {
    return { ok: false, error: 'Недопустимое имя специалиста' }
  }

  const params: Record<string, unknown> = {
    name: input.name,
    ui_meta: metaPatch({
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.role === undefined ? {} : { role: input.role }),
      ...(input.face === undefined ? {} : { face: input.face })
    })
  }
  if (input.description !== undefined) params.description = input.description

  try {
    const answer = await core().request('profiles.configure', params)
    return { ok: true, name: input.name, outcome: saveOutcome(answer) }
  } catch (error: unknown) {
    return { ok: false, name: input.name, outcome: 'refused', error: describe(error) }
  }
}

/**
 * Дубль: облик и роль копируются, ПОСТОЯННЫЙ ЧАТ — нет.
 *
 * Их тест на это отдельный, и причина видна сразу: скопированная привязка чата
 * означала бы двух специалистов, пишущих в одну переписку.
 */
export async function duplicateSpecialist(name: string): Promise<SpecialistOutcome> {
  const roster = await listRoster()
  const source = roster.find((specialist) => specialist.name === name)
  if (!source) return { ok: false, error: 'Такого специалиста нет' }

  const copyName = duplicateName(
    source.name,
    roster.map((specialist) => specialist.name)
  )

  return createSpecialist({
    name: copyName,
    title: source.title === '' ? '' : `${displayNameOf(source)} (копия)`,
    role: source.role,
    description: source.description,
    face: source.face
  })
}

/**
 * Удаляет специалиста вместе с его профилем.
 *
 * РАЗРУШИТЕЛЬНО: у профиля свои настройки, ключи, скилы и история сессий.
 * Поэтому три проверки стоят ЗДЕСЬ, а не в окне: подтверждение, имя (оно уезжает
 * в путь) и запрет трогать специалиста по умолчанию.
 */
export async function deleteSpecialist(
  name: unknown,
  confirmed: unknown
): Promise<SpecialistOutcome> {
  if (confirmed !== true) return { ok: false, error: 'Удаление требует подтверждения' }
  if (!isValidSpecialistName(name)) return { ok: false, error: 'Недопустимое имя специалиста' }

  const roster = await listRoster()
  const refusal = refuseSpecialistDeletion(roster.find((specialist) => specialist.name === name))
  if (refusal) return { ok: false, error: refusal }

  try {
    await core().deleteProfile(name)
    return { ok: true, name }
  } catch (error: unknown) {
    return { ok: false, error: describe(error) }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
