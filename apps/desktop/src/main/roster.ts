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

import { planCanonicalChat, type CanonicalChatFacts } from './canonical-chat-pure'
import {
  displayNameOf,
  duplicateName,
  failedSections,
  isValidSpecialistName,
  metaPatch,
  OUR_META_KEY,
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
  /**
   * Версия наших метаданных, НА КОТОРОЙ основана эта правка (задача 3C.4в).
   *
   * Приходит из роестра, который человек видел, — и только так она имеет смысл:
   * прочитать версию непосредственно перед записью значило бы всегда посылать
   * текущую и не поймать ни одного расхождения. Не указана — пишем без условия
   * (ядро постарше проверять всё равно нечем).
   */
  revision?: number
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

/**
 * Условие «поле никто не менял с тех пор, как я его прочитал» (задача 3C.4в).
 *
 * Отсутствие версии — не ноль, а «условия нет»: посылать ноль значило бы
 * требовать, чтобы поле не трогали НИКОГДА, и первая же запись после первой
 * стала бы конфликтом.
 */
function expectedRevision(revision: number | undefined): Record<string, unknown> {
  return revision === undefined ? {} : { ui_meta_expected_revisions: { [OUR_META_KEY]: revision } }
}

/**
 * Наши поля специалиста, как они лежат в ядре СЕЙЧАС.
 *
 * Нужно перед КАЖДОЙ записью, и это не осторожность. ЗАМЕРЕНО на живом ядре
 * 0.20.5 (`runtime/ui-meta-merge-probe.mjs`): ядро сливает `ui_meta` по ключам
 * ВЕРХНЕГО уровня, то есть по `aecpilot` целиком. Отправить `{aecpilot: {title}}`
 * — значит стереть роль, облик, признак скрытия, привязку постоянного чата и
 * состав комнат. Первая версия этого файла писала именно так, полагаясь на
 * слияние по нашим полям; проба показала обратное.
 */
async function currentMeta(name: string): Promise<Record<string, unknown>> {
  try {
    const answer = (await core().request('profiles.list', {})) as { profiles?: unknown[] }
    const row = (answer?.profiles ?? []).find(
      (one) => typeof one === 'object' && one !== null && (one as { name?: unknown }).name === name
    ) as { ui_meta?: Record<string, unknown> } | undefined

    const ours = row?.ui_meta?.[OUR_META_KEY]
    return typeof ours === 'object' && ours !== null ? { ...(ours as Record<string, unknown>) } : {}
  } catch {
    // Не прочиталось — писать вслепую нельзя: это и есть та самая потеря.
    // Пустой блок здесь означает «поверх ничего не кладём», а вызывающий
    // получит отказ от самой записи, если она не удастся.
    return {}
  }
}

/** Наш блок целиком: то, что лежит, плюс правка. */
function wholeMeta(
  existing: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const ours = (patch[OUR_META_KEY] ?? {}) as Record<string, unknown>
  return { [OUR_META_KEY]: { ...existing, ...ours } }
}

/** Меняет наши поля и описание. Отсутствующее поле не меняется — но блок
 * отправляется ЦЕЛИКОМ поверх прочитанного: см. `currentMeta`. */
export async function saveSpecialist(input: SpecialistInput): Promise<SpecialistOutcome> {
  if (!isValidSpecialistName(input.name)) {
    return { ok: false, error: 'Недопустимое имя специалиста' }
  }

  const params: Record<string, unknown> = {
    name: input.name,
    ui_meta: wholeMeta(
      await currentMeta(input.name),
      metaPatch({
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.role === undefined ? {} : { role: input.role }),
        ...(input.face === undefined ? {} : { face: input.face })
      })
    ),
    ...expectedRevision(input.revision)
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
    const outcome = saveOutcome(answer)
    return {
      // Раздел, который не лёг, — это не успех: их урок про «противоречивое
      // сообщение об успехе» (`model-inherit`). Расхождение версий — тем более:
      // правка не сохранена нигде.
      ok: failed.length === 0 && outcome !== 'conflict',
      name: input.name,
      outcome,
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
  hidden: boolean,
  revision?: number
): Promise<SpecialistOutcome> {
  if (!isValidSpecialistName(name)) return { ok: false, error: 'Недопустимое имя специалиста' }

  try {
    const answer = await core().request('profiles.configure', {
      name,
      ui_meta: wholeMeta(await currentMeta(name), metaPatch({ hidden })),
      ...expectedRevision(revision)
    })
    const outcome = saveOutcome(answer)
    return { ok: outcome !== 'conflict', name, outcome }
  } catch (error: unknown) {
    return { ok: false, name, outcome: 'refused', error: describe(error) }
  }
}

/** Заголовок, который И ЕСТЬ личность постоянного чата (задача 3.B2б).
 *
 * До 0.20.6 личностью была НАША метка: сохранённый номер сессии плюс метка
 * источника. Ядро сняло механизм, на котором это стояло — параметра
 * `preferred_session_ids` и поля `preferred_session` больше нет, — и заменило
 * реестром: уникальный индекс по заголовку делает пару (профиль, «Bot Chat»)
 * ровно одной строкой, а сам заголовок ядро запрещает менять, пока строка
 * скрыта (#92473). Отсюда два следствия, оба несущие: чат создаётся СКРЫТЫМ, и
 * заголовок пишется СРАЗУ, а не когда-нибудь потом.
 *
 * Заголовок совпадает с донорским намеренно: реестр в ядре один, и назвать свой
 * чат иначе значит не попасть в него вовсе — тогда ни воскрешение случайно
 * заархивированного чата, ни усыновление застрявшей сессии на нас не работают. */
const CANONICAL_CHAT_TITLE = 'Bot Chat'

/** Метка источника, которой помечены созданные нами чаты.
 *
 * Личностью она быть перестала (см. выше) и для поиска НЕ используется: два
 * механизма опознания сразу — это два расходящихся ответа на один вопрос.
 * Остаётся как след в выдаче: по нему видно, наш ли чат завёл строку, и это
 * единственное, чего заголовок не говорит. */
const OUR_CHAT_SOURCE = 'aecpilot-roster'

/** Незавершённые создания по имени специалиста.
 *
 * Двойной клик по строке роестра не должен завести два чата: пока первое
 * создание идёт, второй вызов ждёт его же результат. Их код держит такую же
 * карту и по той же причине. */
const canonicalCreations = new Map<string, Promise<{ ok: boolean; sessionId?: string; created?: boolean; error?: string }>>()

/**
 * Постоянный чат специалиста (задачи 3C.4, 3.B2б).
 *
 * Возвращает сессию, которую надо открыть. Решение принимает
 * `planCanonicalChat` по фактам; здесь только сбор фактов и действие.
 */
export async function openCanonicalChat(name: string): Promise<{
  ok: boolean
  sessionId?: string
  created?: boolean
  error?: string
}> {
  if (!isValidSpecialistName(name)) return { ok: false, error: 'Недопустимое имя специалиста' }

  const inflight = canonicalCreations.get(name)
  if (inflight) return inflight

  const run = openCanonicalChatOnce(name)
  canonicalCreations.set(name, run)

  try {
    return await run
  } finally {
    canonicalCreations.delete(name)
  }
}

async function openCanonicalChatOnce(name: string): Promise<{
  ok: boolean
  sessionId?: string
  created?: boolean
  error?: string
}> {
  let facts: CanonicalChatFacts

  try {
    facts = { registry: await findCanonicalChat(name), latest: await latestSession(name) }
  } catch (error: unknown) {
    // Спросить реестр не удалось. Факты остаются без `registry`, и план будет
    // «отказать» — см. `planCanonicalChat`, четвёртое правило.
    console.warn('aecpilot: roster canonical chat lookup FAIL', error)
    facts = {}
  }

  const plan = planCanonicalChat(facts)

  if (plan.action === 'refuse') {
    return {
      ok: false,
      error: 'Не удалось проверить постоянный чат специалиста — попробуйте ещё раз'
    }
  }

  if (plan.action === 'open') return { ok: true, sessionId: plan.sessionId, created: false }

  if (plan.action === 'adopt') {
    // Дедушкино правило: у специалиста, заведённого до появления постоянного
    // чата, разговор уже идёт. Делаем его реестровым — заголовок и скрытость,
    // ровно та пара, которая включает защиту ядра от переименования.
    try {
      await core().request('session.title', {
        session_id: plan.sessionId,
        title: CANONICAL_CHAT_TITLE
      })
      await core().request('session.set_hidden', { session_id: plan.sessionId, hidden: true })

      return { ok: true, sessionId: plan.sessionId, created: false }
    } catch (error: unknown) {
      // Заголовок уже занят — значит реестровая строка появилась между нашим
      // промахом и этой записью (другое окно, другая машина). Её и открываем,
      // свою затею бросаем: это их же правило adopt-before-mint.
      const adopted = await adoptWinner(name, error)
      if (adopted) return adopted

      return { ok: false, error: describe(error) }
    }
  }

  try {
    const created = (await core().request('session.create', {
      profile: name,
      title: CANONICAL_CHAT_TITLE,
      hidden: true,
      source: OUR_CHAT_SOURCE
    })) as { session_id?: string; stored_session_id?: string }

    const sessionId = typeof created?.session_id === 'string' ? created.session_id : ''
    if (sessionId === '') return { ok: false, error: 'Ядро не вернуло сессию' }

    // ВТОРОЙ ШАГ ОБЯЗАТЕЛЕН, И ВОТ ПОЧЕМУ. `session.create` ленивый: строки в
    // базе нет до первого сообщения, а `title` до тех пор лежит отложенным.
    // Пока строка не названа, реестра «Bot Chat» не существует — и второй клик
    // в это окно заводит дубликат, которому канонический заголовок уже не
    // достанется. `session.title` материализует строку сейчас и пишет заголовок
    // с авторитетом человека, что заодно закрывает её от автоименователя.
    try {
      await core().request('session.title', {
        session_id: sessionId,
        title: CANONICAL_CHAT_TITLE
      })
    } catch (error: unknown) {
      const adopted = await adoptWinner(name, error)
      if (adopted) return adopted

      // Старое ядро могло не знать метода — чат всё равно создан, заголовок
      // ляжет отложенно при первом сообщении.
      console.warn('aecpilot: canonical chat title not written', error)
    }

    // ТРЕТИЙ ШАГ, И ОН НЕ ЛИШНИЙ. `hidden` при создании кладётся отложенным
    // (`pending_hidden`) и применяется, когда строку заводит первое сообщение.
    // Но строку заводит уже `session.title` — и скрытость он НЕ переносит
    // (замер `runtime/canonical-chat-probe.mjs`: строка находилась в списке без
    // `include_hidden`). А защита ядра от переименования включается ТОЛЬКО у
    // скрытой строки, так что без этого шага заголовок остаётся личностью лишь
    // на словах — ровно до первого автоименователя.
    try {
      await core().request('session.set_hidden', { session_id: sessionId, hidden: true })
    } catch (error: unknown) {
      console.warn('aecpilot: canonical chat not hidden', error)
    }

    return { ok: true, sessionId, created: true }
  } catch (error: unknown) {
    return { ok: false, error: describe(error) }
  }
}

/** Заголовок занял кто-то другой — открыть победителя, а не свою пустую сессию.
 *
 * Возвращает `null`, если ошибка была не про занятый заголовок или победителя
 * найти не удалось: тогда решает вызывающий. */
async function adoptWinner(
  name: string,
  error: unknown
): Promise<{ ok: boolean; sessionId?: string; created?: boolean } | null> {
  if (!/already in use/i.test(describe(error))) return null

  try {
    const winner = await findCanonicalChat(name)
    if (!winner) return null

    return {
      ok: true,
      sessionId: winner.resolvedId === '' ? winner.id : winner.resolvedId,
      created: false
    }
  } catch {
    return null
  }
}

/**
 * Реестровая строка профиля — сессия, названная ровно «Bot Chat».
 *
 * `title` просит у ядра точный поиск по индексу вместо перебора окна выдачи:
 * занятый профиль выталкивает вечный чат за любое окно свежести, и тогда он
 * «пропадает». `include_hidden` обязателен — эти чаты всегда скрыты.
 *
 * ОШИБКА ЗДЕСЬ БРОСАЕТСЯ НАВЕРХ, А НЕ ПРЕВРАЩАЕТСЯ В `null`. «Не нашли» и «не
 * смогли спросить» — разные ответы, и подмена второго первым это единственный
 * оставшийся способ раздвоить вечный чат (см. `planCanonicalChat`).
 */
async function findCanonicalChat(
  name: string
): Promise<{ id: string; resolvedId: string } | null> {
  const answer = (await core().request('session.list', {
    profile: name,
    title: CANONICAL_CHAT_TITLE,
    include_hidden: true
  })) as { sessions?: unknown[] }

  const rows = Array.isArray(answer?.sessions) ? answer.sessions : []
  const row = rows
    .map((candidate) => candidate as Record<string, unknown>)
    .find((candidate) => isCanonicalRow(candidate))

  if (!row) return null

  const id = typeof row.id === 'string' ? row.id : ''
  if (id === '') return null

  return { id, resolvedId: typeof row.resolved_id === 'string' ? row.resolved_id : '' }
}

/** Признак реестровой строки в выдаче.
 *
 * Полей два, потому что их два и в ответах: точный поиск отдаёт `root_title` —
 * заголовок КОРНЯ сжатой линии, а обычная оконная выдача только `title`
 * вершины. Ядро без параметра `title` вернёт окно, и тогда работает вторая
 * половина. */
function isCanonicalRow(row: Record<string, unknown>): boolean {
  const rootTitle = typeof row.root_title === 'string' ? row.root_title.trim() : ''
  const title = typeof row.title === 'string' ? row.title.trim() : ''

  return rootTitle === CANONICAL_CHAT_TITLE || (rootTitle === '' && title === CANONICAL_CHAT_TITLE)
}

/** Последняя сессия профиля — только для дедушкиного правила. */
async function latestSession(name: string): Promise<{ id: string } | null> {
  const answer = (await core().request('profiles.list', { include_sessions: true })) as {
    profiles?: unknown[]
  }

  const row = (answer?.profiles ?? []).find(
    (candidate) => parseSpecialist(candidate)?.name === name
  ) as Record<string, unknown> | undefined

  const last = row?.last_session as { session_id?: string; id?: string } | null | undefined
  if (!last) return null

  const id = idOf(last)
  return id === '' ? null : { id }
}

function idOf(row: { session_id?: string; id?: string }): string {
  return row.session_id ?? row.id ?? ''
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
