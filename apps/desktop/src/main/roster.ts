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

import { planCanonicalChat } from './canonical-chat-pure'
import {
  displayNameOf,
  duplicateName,
  failedSections,
  isValidSpecialistName,
  metaPatch,
  parseRoster,
  parseSpecialist,
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
  // --- расширенные возможности (задача 3C.2) ---
  /** Своя модель. Ядро пишет её ТОЛЬКО парой с провайдером — по одному полю
   * назначения не происходит вовсе. */
  model?: string
  provider?: string
  /** Свой SOUL: полная замена файла, а не дополнение. */
  soul?: string
  /** Замещающая семантика: присланный список СТАНОВИТСЯ списком. */
  disabledSkills?: string[]
  enabledToolsets?: string[]
  enabledMcpServers?: string[]
  /** С кого клонировать при создании. Умеет само ядро: копирует настройки,
   * скилы и (по умолчанию) доступы, чтобы новый специалист мог думать сразу. */
  cloneFrom?: string
}

export interface SpecialistOutcome {
  ok: boolean
  name?: string
  /** Куда легли наши поля: на сервер, только сюда или никуда. */
  outcome?: SaveOutcome
  /** Разделы, которые ядро не применило: модель легла, а скилы нет — и человек
   * должен увидеть именно это, а не общее «сохранено». */
  failed?: string[]
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
    // Клонирование, SOUL и модель ядро умеет прямо при создании — и делает это
    // лучше, чем мы вторым шагом: `clone_from` копирует настройки и скилы, а
    // `mirror_credentials` (по умолчанию) даёт новому специалисту доступы, без
    // которых он не смог бы ответить ни разу.
    await core().request('profiles.create', {
      name: input.name,
      ...(input.description === undefined ? {} : { description: input.description }),
      ...(input.cloneFrom === undefined || input.cloneFrom === ''
        ? {}
        : { clone_from: input.cloneFrom }),
      ...(input.soul === undefined ? {} : { soul: input.soul }),
      ...(input.model && input.provider ? { model: input.model, provider: input.provider } : {})
    })
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
  if (input.soul !== undefined) params.soul = input.soul
  // Модель уходит ТОЛЬКО парой: ядро молча пропускает половину назначения, и
  // отправить одну провайдера значит ничего не сделать, отчитавшись успехом.
  if (input.model && input.provider) {
    params.model = input.model
    params.provider = input.provider
  }
  if (input.disabledSkills !== undefined) params.disabled_skills = input.disabledSkills
  if (input.enabledToolsets !== undefined) params.enabled_toolsets = input.enabledToolsets
  if (input.enabledMcpServers !== undefined) params.enabled_mcp_servers = input.enabledMcpServers

  try {
    const answer = await core().request('profiles.configure', params)
    const failed = failedSections(answer)
    return {
      // Раздел, который не лёг, — это не успех: их урок про «противоречивое
      // сообщение об успехе» (`model-inherit`).
      ok: failed.length === 0,
      name: input.name,
      outcome: saveOutcome(answer),
      ...(failed.length === 0 ? {} : { failed })
    }
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

/**
 * Картинка вместо геометрического лица.
 *
 * Хранится НА СЕРВЕРЕ, в каталоге профиля, — как и всё остальное про
 * специалиста: одна картинка на все машины, подключённые к этому ядру. В
 * `ui_meta` ей не место: там предел 64 КБ на весь блок, и блок этот едет с
 * каждым обновлением списка.
 *
 * Отправляется ТОЛЬКО когда изменилась (их урок `bot-meta-asset-sync`): иначе
 * каждое открытие карточки — лишняя запись на диск машины ядра.
 */
export async function setSpecialistAvatar(
  name: string,
  dataUrl: string | null
): Promise<SpecialistOutcome> {
  if (!isValidSpecialistName(name)) return { ok: false, error: 'Недопустимое имя специалиста' }

  try {
    await core().request(
      'profiles.set_asset',
      dataUrl === null
        ? { name, asset: 'avatar', clear: true }
        : { name, asset: 'avatar', data: dataUrl }
    )
    return { ok: true, name, outcome: 'server' }
  } catch (error: unknown) {
    return { ok: false, name, outcome: 'refused', error: describe(error) }
  }
}

/** Картинка специалиста, если она есть. `null` — её нет, и это ответ, а не
 * ошибка: у большинства специалистов лицо геометрическое. */
export async function specialistAvatar(name: string): Promise<string | null> {
  if (!isValidSpecialistName(name)) return null

  try {
    const answer = (await core().request('profiles.get_asset', { name, asset: 'avatar' })) as {
      found?: boolean
      data?: string
    }
    return answer?.found === true && typeof answer.data === 'string' ? answer.data : null
  } catch {
    return null
  }
}

/**
 * Скрыть специалиста или вернуть его в список (задача 3C.8).
 *
 * Скрытие НЕ отключает специалиста: обращения по имени доходят, рутины идут,
 * группы работают, метаданные синхронизируются. Оно убирает его из списка и из
 * уведомлений — не более. Их тринадцать правил на эту тему сводятся к одному:
 * скрытый специалист продолжает работать, просто не мозолит глаза.
 *
 * Состояние живёт в полях профиля, то есть на сервере: скрытый здесь скрыт и на
 * другой машине, подключённой к тому же ядру.
 */
export async function setSpecialistHidden(
  name: string,
  hidden: boolean
): Promise<SpecialistOutcome> {
  if (!isValidSpecialistName(name)) return { ok: false, error: 'Недопустимое имя специалиста' }

  try {
    const answer = await core().request('profiles.configure', {
      name,
      ui_meta: metaPatch({ hidden })
    })
    return { ok: true, name, outcome: saveOutcome(answer) }
  } catch (error: unknown) {
    return { ok: false, name, outcome: 'refused', error: describe(error) }
  }
}

/** Метка источника, которой помечены СОЗДАННЫЕ НАМИ постоянные чаты.
 *
 * Это опознавательный знак чата, и он выбран вместо заголовка сознательно
 * (задача 3C.4б). У донора личность канонического чата — его заголовок
 * «Bot Chat», и именно на этом раскрутился их бесконечный цикл: заголовок
 * переименовывает автоименователь модели, после чего чат перестаёт узнаваться
 * и создаётся заново. Источник не переименовывает никто, включая модель.
 *
 * Отсюда же ответ, почему мы НЕ берём их прибавку 0.20.5 — поиск сессии по
 * точному заголовку (`session.list` с `title`). Она лечит их болезнь, которой у
 * нас нет: нашим чатам заголовок вообще не назначается. */
const OUR_CHAT_SOURCE = 'aecpilot-roster'

/**
 * Постоянный чат специалиста (задача 3C.4).
 *
 * Возвращает сессию, которую надо открыть, — и, если её пришлось завести или
 * перепривязать, ЗАПИСЫВАЕТ привязку. Решение принимает `planCanonicalChat` по
 * фактам; здесь только сбор фактов и действие.
 *
 * Сессия создаётся СКРЫТОЙ (`hidden: true`) и всегда, без настройки: постоянные
 * чаты специалистов в общем списке сессий — это свалка, в которой не найти
 * собственную переписку. Их код делает так же и по той же причине.
 */
export async function openCanonicalChat(
  name: string,
  knownPin?: string
): Promise<{
  ok: boolean
  sessionId?: string
  created?: boolean
  error?: string
}> {
  if (!isValidSpecialistName(name)) return { ok: false, error: 'Недопустимое имя специалиста' }

  let pin = typeof knownPin === 'string' ? knownPin : ''
  let facts: Parameters<typeof planCanonicalChat>[0] = { pin, answered: false }

  try {
    // Привязку надо ЗНАТЬ, чтобы о ней спросить: ядро проверяет её по
    // `preferred_session_ids` и отвечает сводкой сессии или `null`. Окно обычно
    // уже держит список и присылает привязку с собой — тогда лишнего вызова
    // нет; на холодную приходится спросить список дважды.
    if (pin === '') {
      const known = parseRoster(await core().request('profiles.list', { include_sessions: true }))
      pin = known.find((specialist) => specialist.name === name)?.chatSessionId ?? ''
    }

    const answer = (await core().request('profiles.list', {
      include_sessions: true,
      ...(pin === '' ? {} : { preferred_session_ids: { [name]: pin } })
    })) as { profiles?: unknown[] }

    const row = (answer?.profiles ?? []).find(
      (candidate) => parseSpecialist(candidate)?.name === name
    ) as Record<string, unknown> | undefined

    const preferred = row?.preferred_session as
      { session_id?: string; id?: string } | null | undefined
    const latest = row?.last_session as { session_id?: string; id?: string } | null | undefined

    facts = {
      pin,
      answered: true,
      ...(pin === '' || preferred === undefined
        ? {}
        : { preferred: preferred === null ? null : { id: idOf(preferred) } }),
      ...(latest ? { latest: { id: idOf(latest) } } : { latest: null })
    }

    // Наш ли чат уже есть — спрашиваем ТОЛЬКО когда иначе пришлось бы усыновлять
    // или создавать. При живой привязке (самый частый случай) лишнего вызова нет.
    if (pin === '' || facts.preferred === null) {
      facts = { ...facts, ours: await findOurChat(name) }
    }
  } catch (error: unknown) {
    // Ядро молчит — это НЕ повод терять привязку (см. `planCanonicalChat`).
    console.warn('aecpilot: roster canonical chat lookup FAIL', error)
    facts = { pin, answered: false }
  }

  const plan = planCanonicalChat(facts)

  if (plan.action === 'open') return { ok: true, sessionId: plan.sessionId, created: false }

  if (plan.action === 'adopt') {
    await rememberChat(name, plan.sessionId)
    return { ok: true, sessionId: plan.sessionId, created: false }
  }

  try {
    const created = (await core().request('session.create', {
      source: OUR_CHAT_SOURCE,
      hidden: true,
      profile: name
    })) as { session_id?: string }

    const sessionId = typeof created?.session_id === 'string' ? created.session_id : ''
    if (sessionId === '') return { ok: false, error: 'Ядро не вернуло сессию' }

    await rememberChat(name, sessionId)
    return { ok: true, sessionId, created: true }
  } catch (error: unknown) {
    return { ok: false, error: describe(error) }
  }
}

/**
 * Ищет чат, созданный НАМИ для этого специалиста (задача 3C.4б).
 *
 * `include_hidden` обязателен: наши чаты рождаются скрытыми, и без него список
 * их не показывает вовсе — то есть проверка «есть ли уже чат» всегда отвечала бы
 * «нет», и чаты плодились бы при каждой потере привязки.
 *
 * Неудача здесь — это `null`, а не исключение: не нашли и не смогли спросить
 * различаются выше, в `planCanonicalChat`, по флагу `answered`; здесь ответ
 * означает только «нашего чата не видно».
 */
async function findOurChat(name: string): Promise<{ id: string } | null> {
  try {
    const answer = (await core().request('session.list', {
      profile: name,
      include_hidden: true
    })) as { sessions?: unknown[] }

    const rows = Array.isArray(answer?.sessions) ? answer.sessions : []
    const mine = rows
      .map((row) => row as Record<string, unknown>)
      .find((row) => typeof row.source === 'string' && row.source === OUR_CHAT_SOURCE)

    if (!mine) return null

    // `resolved_id` — живая вершина сжатой переписки. В обычной выдаче ядро
    // 0.20.5 её НЕ отдаёт (замер `runtime/own-chat-probe.mjs`: поля строки —
    // id, title, preview, started_at, message_count, source); поле читается на
    // случай, если начнёт отдавать. Сжатие в основном пути разрешает привязка.
    const id = idOf({
      session_id: typeof mine.resolved_id === 'string' ? mine.resolved_id : undefined,
      id: typeof mine.id === 'string' ? mine.id : undefined
    })

    return id === '' ? null : { id }
  } catch (error: unknown) {
    console.warn('aecpilot: roster own-chat lookup FAIL', error)
    return null
  }
}

/** Привязка пишется в наши поля профиля — то есть на сервер, и потому одна на
 * все машины. */
async function rememberChat(name: string, sessionId: string): Promise<void> {
  try {
    await core().request('profiles.configure', {
      name,
      ui_meta: metaPatch({ chat: sessionId })
    })
  } catch (error: unknown) {
    // Привязка не легла — чат всё равно открыт. Молча потерять его нельзя, но
    // и отменять открытие не за что.
    console.warn('aecpilot: roster chat pin not saved', error)
  }
}

function idOf(row: { session_id?: string; id?: string }): string {
  return row.session_id ?? row.id ?? ''
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
