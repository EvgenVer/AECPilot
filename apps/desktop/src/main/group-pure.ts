// Групповые чаты: правила круга без единого обращения (задача 3C.6, SPEC UR27,
// контракт — specs/agent-roster.md §Р5).
//
// ЧТО ТАКОЕ КОМНАТА. От двух до шести специалистов и человек. Человек задаёт
// вопрос, участники отвечают по кругу, круг может повториться, если кто-то
// позвал другого. Комнату ведёт ГЛАВНЫЙ ПРОЦЕСС — в отличие от `@имя` (3C.7),
// где спрашивает сам агент: реплики показываются в НАШЕЙ комнате, и вставлять
// их больше некуда, значит инструмент агента здесь был бы лишним слоем.
//
// ЦЕНА, СКАЗАННАЯ ВСЛУХ. Один вопрос в комнате из шести при трёх кругах — до
// восемнадцати обращений к модели, каждое со своим контекстом. Пределы ниже не
// украшение: они единственное, что отделяет разговор от счёта за него.
//
// ГДЕ ЖИВЁТ КОМНАТА. Состав — в наших полях профиля КАЖДОГО участника
// (`ui_meta.aecpilot.groups`), то есть на сервере: человек за другим
// компьютером с тем же ядром видит те же комнаты. Сама переписка — НЕ там:
// в `ui_meta` предел 64 КБ на весь блок, и он едет с каждым обновлением
// роестра, так что растущий транскрипт сломал бы список специалистов. Переписка
// лежит рядом с приложением, а неотчуждаемая её часть — в сессии каждого
// участника на сервере.

import type { SpecialistFace } from './roster-pure'

/** Замерено у них (`plugin.js`): `MAX_ROUNDS = 3`. Берём их число — оно прошло
 * их же одиннадцать тестов, а придумывать своё не на чем. */
export const MAX_ROUNDS = 3

/** Замерено там же: `GROUP_CHAT_MAX_MESSAGES = 10` за ход комнаты. */
export const MAX_MESSAGES = 10

export const MIN_MEMBERS = 2
export const MAX_MEMBERS = 6

/** Комната, как её видит приложение. */
export interface GroupRoom {
  id: string
  title: string
  /** Имена профилей участников, в порядке добавления. */
  members: string[]
  face: SpecialistFace | null
  /** Кто-то из участников позвал человека — комнате нужны вы. */
  needsYou: boolean
}

/** Одна реплика переписки. Пустое `from` — сказал человек. */
export interface GroupTurn {
  from: string
  text: string
}

/** Что комната делает прямо сейчас — свёрнутая лента, объясняющая молчание.
 *
 * НЕ СОХРАНЯЕТСЯ. Единственная запись разговора — сама переписка; лента живёт
 * ровно столько, сколько идёт ход. Без неё комната, где двое думают, а один
 * промолчал, выглядит зависшей, и человек отправляет вопрос второй раз. */
export type GroupEventKind =
  'queued' | 'working' | 'answered' | 'passed' | 'timeout' | 'failed' | 'cancelled' | 'finished'

export interface GroupEvent {
  member: string
  kind: GroupEventKind
  round: number
}

/** Как выглядит обращение внутри комнаты. Та же азбука, что в `mentions-pure`:
 * имена на экране русские, и требовать латиницу значило бы заставить человека
 * помнить два имени одного и того же. */
const MENTION = /(^|\s)@([\p{L}\p{N}][\p{L}\p{N}_-]*)/gu

/** «Отвечают все». Их метка и её русский двойник: подсказка в комнате
 * предлагает `@все`, и разбор обязан понимать то, что она вставила. */
const EVERYONE = new Set(['everyone', 'все', 'all'])

/** «Нужен человек». Так же: их метка плюс то, что напишет русскоязычная
 * модель, которой мы сами показываем русские имена. */
const USER = new Set(['user', 'вы', 'человек'])

/** Молчание участника. Их формы, слово в слово, плюс русские и пустой ответ. */
const PASS = new Set(['(pass)', 'pass', 'pass.', '(пас)', 'пас', 'пас.', ''])

function handleOf(value: string): string {
  return value.trim().replace(/\s+/g, '-').toLowerCase()
}

/** Кого назвали в тексте — как есть, без сверки с составом. */
function mentionsIn(value: string): string[] {
  return [...value.matchAll(MENTION)].map((match) => match[2].toLowerCase())
}

/** Участник промолчал.
 *
 * Молчание — это ответ, а не сбой: специалисту нечего добавить, и заставлять
 * его говорить значило бы наполнить комнату вежливым шумом. */
export function isSilence(value: string): boolean {
  return PASS.has(value.trim().toLowerCase())
}

/** Реплика зовёт человека. Снимается его же следующим сообщением. */
export function wantsYou(value: string): boolean {
  return mentionsIn(value).some((name) => USER.has(name))
}

/** Реплика поднимает всю комнату. */
function callsEveryone(value: string): boolean {
  return mentionsIn(value).some((name) => EVERYONE.has(name))
}

/**
 * Кто отвечает на это сообщение.
 *
 * Правило: отвечают только упомянутые. `@все` или отсутствие упоминаний —
 * отвечают все. Автора в списке не бывает: реплика не адресуется тому, кто её
 * сказал.
 *
 * `titles` — подпись каждого участника, чтобы `@Смета` нашёл `smeta`. Имя
 * профиля тоже принимается: человек мог написать его.
 */
export function addressed(
  value: string,
  members: readonly string[],
  titles: Readonly<Record<string, string>> = {},
  author = ''
): string[] {
  if (mentionsIn(value).length === 0 || callsEveryone(value)) {
    return members.filter((name) => name !== author)
  }

  // Позвали только тех, кого в комнате нет, — отвечать некому, и это НЕ повод
  // будить всех: человек обращался не к ним.
  return namedMembers(value, members, titles, author)
}

/** Названные ПОИМЁННО участники — без подстановки «значит, все».
 *
 * Отдельно от `addressed` нарочно: для человека молчаливое обращение означает
 * «отвечайте все», а для реплики участника — никого. Слить эти два правила в
 * одно значило бы, что любая фраза в комнате тянет всех на новый круг.
 */
function namedMembers(
  value: string,
  members: readonly string[],
  titles: Readonly<Record<string, string>>,
  author: string
): string[] {
  const byHandle = new Map<string, string>()
  for (const name of members) {
    byHandle.set(name.toLowerCase(), name)
    const title = titles[name]
    if (title !== undefined && title.trim() !== '') byHandle.set(handleOf(title), name)
  }

  const found: string[] = []
  for (const mention of mentionsIn(value)) {
    const member = byHandle.get(mention)
    if (member !== undefined && member !== author && !found.includes(member)) found.push(member)
  }
  return found
}

/**
 * Кто входит в следующий круг.
 *
 * Участник, которого позвал ДРУГОЙ участник, отвечает в следующем круге — так
 * разговор идёт между специалистами, а не веером от человека.
 *
 * ЗОВУТ ТОЛЬКО ПОИМЁННО. Реплика без обращений не продлевает ничего, и `@все`
 * внутри неё — тоже: иначе любая фраза («спасибо всем») поднимала бы комнату на
 * новый круг, и один вежливый оборот стоил бы шести обращений к модели.
 */
export function nextRound(
  replies: readonly GroupTurn[],
  members: readonly string[],
  titles: Readonly<Record<string, string>> = {}
): string[] {
  const next: string[] = []

  for (const reply of replies) {
    if (isSilence(reply.text) || callsEveryone(reply.text)) continue

    for (const member of namedMembers(reply.text, members, titles, reply.from)) {
      if (!next.includes(member)) next.push(member)
    }
  }

  return next
}

/** Сколько ещё реплик можно потратить за ход комнаты. Ноль — ход окончен. */
export function budgetLeft(spent: number): number {
  return Math.max(0, MAX_MESSAGES - spent)
}

/**
 * Кто отвечает в этом круге с учётом обоих пределов.
 *
 * Предел реплик режет СПИСОК, а не круг целиком: лучше услышать двоих, чем
 * никого. Порядок сохраняется — он и есть очередь.
 */
export function roundQueue(candidates: readonly string[], round: number, spent: number): string[] {
  if (round > MAX_ROUNDS) return []
  return candidates.slice(0, budgetLeft(spent))
}

/** Состав годится в комнату. */
export function checkMembers(members: readonly string[]): { ok: boolean; error?: string } {
  const unique = [...new Set(members)]

  if (unique.length !== members.length) return { ok: false, error: 'Участник добавлен дважды' }
  if (unique.length < MIN_MEMBERS) return { ok: false, error: 'В комнате нужны хотя бы двое' }
  if (unique.length > MAX_MEMBERS) return { ok: false, error: 'В комнате не больше шести' }

  return { ok: true }
}

/** Имя комнаты по умолчанию — из имён участников. Своё имя, если его дали,
 * важнее: подпись принадлежит человеку, а не составу. */
export function defaultTitle(
  members: readonly string[],
  titles: Readonly<Record<string, string>> = {}
): string {
  return members.map((name) => titles[name]?.trim() || name).join(', ')
}

/**
 * Что послать участнику: только НОВОЕ.
 *
 * Второе сообщение человека не гоняет всю историю заново — участник её уже
 * слышал, и повтор стоил бы столько же, сколько сам разговор. `seen` — сколько
 * реплик переписки этот участник уже получил.
 */
export function briefFor(
  transcript: readonly GroupTurn[],
  seen: number,
  titles: Readonly<Record<string, string>> = {}
): string {
  const fresh = transcript.slice(Math.max(0, seen))
  if (fresh.length === 0) return ''

  return fresh
    .map((turn) =>
      turn.from === ''
        ? `Человек: ${turn.text}`
        : `${titles[turn.from]?.trim() || turn.from}: ${turn.text}`
    )
    .join('\n\n')
}

// --- Где комната лежит в полях профиля -------------------------------------
//
// Запись комнаты повторяется у КАЖДОГО участника и отличается только двумя
// полями — его сессией комнаты и тем, сколько реплик он уже слышал. Остальное
// (состав, имя, облик, пометка «нужны вы») одинаково: это и есть комната.
//
// Повтор — не небрежность, а следствие того, где живут наши поля: у ядра нет
// «общего блока на несколько профилей», есть только `ui_meta` каждого. Зато
// участник, попавший на другую машину, приносит комнату с собой.

/** Ключ комнат внутри наших полей профиля (`ui_meta.aecpilot.groups`). */
export const GROUPS_META_KEY = 'groups'

/** Запись комнаты у одного участника. */
export interface MemberRoom extends GroupRoom {
  /** Сессия комнаты ИМЕННО этого участника. Пусто — ещё не заведена. */
  session: string
  /** Сколько реплик переписки он уже получил. */
  seen: number
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function readRoom(id: string, raw: unknown): MemberRoom | null {
  if (typeof raw !== 'object' || raw === null) return null

  const row = raw as Record<string, unknown>
  const members = Array.isArray(row.members) ? row.members.filter((one) => str(one) !== '') : []
  if (members.length === 0) return null

  return {
    id,
    title: str(row.title),
    members: members.map(String),
    face: (row.face ?? null) as SpecialistFace | null,
    needsYou: row.needsYou === true,
    session: str(row.session),
    seen: typeof row.seen === 'number' && row.seen >= 0 ? Math.floor(row.seen) : 0
  }
}

/**
 * Комнаты одного участника из его блока наших полей.
 *
 * Порченая или чужая запись просто пропускается: комната, которую нельзя
 * прочитать, не должна ронять список тех, которые можно.
 */
export function parseMemberRooms(ours: unknown): MemberRoom[] {
  if (typeof ours !== 'object' || ours === null) return []

  const groups = (ours as Record<string, unknown>)[GROUPS_META_KEY]
  if (typeof groups !== 'object' || groups === null) return []

  const rooms: MemberRoom[] = []
  for (const [id, raw] of Object.entries(groups as Record<string, unknown>)) {
    const room = readRoom(id, raw)
    if (room !== null) rooms.push(room)
  }
  return rooms
}

/**
 * Комнаты со всего роестра, собранные по идентификатору.
 *
 * Участник, у которого запись пропала (профиль переехал, метаданные не
 * записались), НЕ обрушивает комнату: она остаётся с теми, у кого запись есть,
 * а список участников берётся из самой записи, а не из того, у кого она нашлась.
 */
export function parseRooms(answer: unknown): GroupRoom[] {
  const rows = (answer as { profiles?: unknown } | undefined)?.profiles
  if (!Array.isArray(rows)) return []

  const byId = new Map<string, GroupRoom>()

  for (const raw of rows) {
    if (typeof raw !== 'object' || raw === null) continue
    const meta = ((raw as Record<string, unknown>).ui_meta ?? {}) as Record<string, unknown>

    for (const room of parseMemberRooms(meta.aecpilot)) {
      const known = byId.get(room.id)
      // «Нужны вы» — свойство комнаты: поставил один участник, видят все.
      if (known === undefined) {
        byId.set(room.id, {
          id: room.id,
          title: room.title,
          members: room.members,
          face: room.face,
          needsYou: room.needsYou
        })
      } else if (room.needsYou) {
        known.needsYou = true
      }
    }
  }

  return [...byId.values()]
}

/**
 * Что записать участнику. Пишется ВСЯ карта комнат этого участника: ядро
 * сливает по ключам верхнего уровня, и отправить одну комнату значило бы
 * оставить остальные как есть — а роспуск как раз и означает «этой больше нет».
 */
export function roomsPatch(rooms: readonly MemberRoom[]): Record<string, unknown> {
  const groups: Record<string, unknown> = {}

  for (const room of rooms) {
    groups[room.id] = {
      title: room.title,
      members: room.members,
      face: room.face,
      needsYou: room.needsYou,
      session: room.session,
      seen: room.seen
    }
  }

  return { [GROUPS_META_KEY]: groups }
}
