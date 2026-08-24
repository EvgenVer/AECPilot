// Комнаты: обращения к ядру и порядок круга (задача 3C.6, SPEC UR27).
//
// Правила — в `group-pure.ts`; здесь только вызовы и то, в каком порядке они
// идут. Контракт целиком — `specs/agent-roster.md` §Р5.
//
// КРУГ ИДЁТ ПО ОЧЕРЕДИ, А НЕ ВЕЕРОМ. Участники отвечают один за другим, и
// каждый следующий слышит сказанное предыдущими в том же круге. Веером было бы
// быстрее, но тогда шестеро отвечали бы на один и тот же вопрос, не зная друг о
// друге, — это не совещание, а шесть параллельных монологов. Плюс очередь —
// единственный способ честно считать реплики против предела.
//
// СЕССИЯ УЧАСТНИКА ЗАПИСЫВАЕТСЯ СРАЗУ, а `seen` — в конце хода. Разная цена
// ошибки: потерянный идентификатор сессии оставляет на сервере сироту, которую
// уже не найти, а потерянный `seen` стоит одного повтора уже слышанного.
//
// ПЕРЕПИСКА ЛЕЖИТ РЯДОМ С ПРИЛОЖЕНИЕМ, а не в полях профиля: в `ui_meta` предел
// 64 КБ на весь блок, и он едет с каждым обновлением роестра — растущий
// транскрипт сломал бы список специалистов. Сказанное при этом не пропадает: у
// каждого участника его сторона разговора лежит в его сессии на сервере.

import {
  MAX_MESSAGES,
  addressed,
  briefFor,
  checkMembers,
  defaultTitle,
  isSilence,
  nextRound,
  parseMemberRooms,
  parseRooms,
  roomsPatch,
  roundQueue,
  wantsYou,
  type GroupEvent,
  type GroupRoom,
  type GroupTurn,
  type MemberRoom
} from './group-pure'
import { OUR_META_KEY, parseRoster, type SpecialistFace } from './roster-pure'

/** Сколько ждём одного участника. Ход агента с инструментами идёт минутами;
 * дольше — это уже не «думает», а «не ответит». Молчание по сроку — молчание,
 * а не поломка комнаты. */
export const TURN_TIMEOUT_MS = 300_000

/** Сколько ещё ждём опоздавшего ПОСЛЕ конца круга. Он уже не задерживает
 * никого: комната договорила, а его реплика придёт в неё сама. */
export const LATE_WINDOW_MS = 900_000

export interface GroupDeps {
  request: (method: string, params?: Record<string, unknown>) => Promise<unknown>
  /** Подписка на события шлюза. Ответ участника приходит событием
   * `message.complete` его сессии — другого способа дождаться хода нет:
   * `prompt.submit` возвращается сразу. */
  onGatewayEvent: (listener: (event: unknown) => void) => () => void
  /** Чтение и запись переписки. Снаружи, потому что это файл рядом с
   * приложением, а здесь — только правила разговора. */
  loadTranscript: (roomId: string) => GroupTurn[]
  saveTranscript: (roomId: string, turns: GroupTurn[]) => void
  /** Новый идентификатор комнаты. Снаружи ради проверяемости: случайность
   * внутри означала бы тест, который нельзя написать. */
  newRoomId: () => string
}

let deps: GroupDeps | undefined

export function configureGroups(value: GroupDeps): void {
  deps = value
}

function core(): GroupDeps {
  if (!deps) throw new Error('комнаты не подключены к ядру')
  return deps
}

export interface RoomOutcome {
  ok: boolean
  error?: string
  id?: string
}

/** Подписи всех специалистов: `@Смета` должен находить `smeta`. */
async function titlesOf(): Promise<Record<string, string>> {
  const roster = parseRoster(await core().request('profiles.list', {}))
  const titles: Record<string, string> = {}
  for (const one of roster) titles[one.name] = one.title
  return titles
}

/** Запись комнаты у каждого её участника. Ключ — имя профиля. */
async function memberRooms(roomId: string): Promise<Map<string, MemberRoom>> {
  const answer = (await core().request('profiles.list', {})) as { profiles?: unknown[] }
  const found = new Map<string, MemberRoom>()

  for (const raw of answer?.profiles ?? []) {
    if (typeof raw !== 'object' || raw === null) continue
    const row = raw as Record<string, unknown>
    const meta = (row.ui_meta ?? {}) as Record<string, unknown>

    for (const room of parseMemberRooms(meta[OUR_META_KEY])) {
      if (room.id === roomId) found.set(String(row.name), room)
    }
  }

  return found
}

/**
 * Все комнаты этого участника, с одной заменённой или убранной.
 *
 * ДВА ПРАВИЛА ЗАПИСИ, И ОБА ЗАМЕРЕНЫ, А НЕ ПРЕДПОЛОЖЕНЫ:
 *
 * 1. пишется вся КАРТА комнат — отправить одну комнату значило бы, что роспуск
 *    ничего не убирает;
 * 2. пишется весь НАШ БЛОК — ядро сливает `ui_meta` по ключам верхнего уровня,
 *    то есть по `aecpilot` целиком (`runtime/ui-meta-merge-probe.mjs`, живое
 *    ядро 0.20.5). Отправить только комнаты — значит стереть специалисту имя,
 *    роль, облик и привязку постоянного чата.
 */
async function writeMemberRooms(member: string, change: (rooms: MemberRoom[]) => MemberRoom[]) {
  const answer = (await core().request('profiles.list', {})) as { profiles?: unknown[] }
  const row = (answer?.profiles ?? []).find(
    (one) =>
      typeof one === 'object' && one !== null && (one as Record<string, unknown>).name === member
  ) as Record<string, unknown> | undefined

  const meta = (row?.ui_meta ?? {}) as Record<string, unknown>
  const ours = (meta[OUR_META_KEY] ?? {}) as Record<string, unknown>
  const next = change(parseMemberRooms(ours))

  await core().request('profiles.configure', {
    name: member,
    ui_meta: { [OUR_META_KEY]: { ...ours, ...roomsPatch(next) } }
  })
}

export async function listRooms(): Promise<GroupRoom[]> {
  return parseRooms(await core().request('profiles.list', {}))
}

/**
 * Заводит комнату. Запись кладётся КАЖДОМУ участнику — комната есть только там,
 * где о ней знает сам специалист.
 *
 * Частичная неудача не откатывается: профиль, которому запись легла, о комнате
 * знает, и стирать это значило бы терять уже сделанное. Комната соберётся из
 * тех записей, что есть, — `parseRooms` берёт состав из самой записи.
 */
export async function createRoom(members: string[], title = ''): Promise<RoomOutcome> {
  const check = checkMembers(members)
  if (!check.ok) return { ok: false, error: check.error }

  const id = core().newRoomId()
  const titles = await titlesOf()
  const room: MemberRoom = {
    id,
    title: title.trim() || defaultTitle(members, titles),
    members: [...members],
    face: null,
    needsYou: false,
    session: '',
    seen: 0
  }

  let failed = ''
  for (const member of members) {
    try {
      await writeMemberRooms(member, (rooms) => [...rooms, room])
    } catch (error: unknown) {
      failed = error instanceof Error ? error.message : String(error)
    }
  }

  if (failed !== '') return { ok: true, id, error: `не у всех участников: ${failed}` }
  return { ok: true, id }
}

/** Переименование и облик. Сессии участников не трогаются: имя — подпись, а не
 * адрес, и менять из-за него разговор было бы подменой. */
export async function editRoom(
  id: string,
  change: { title?: string; face?: SpecialistFace | null }
): Promise<RoomOutcome> {
  const rooms = await memberRooms(id)
  if (rooms.size === 0) return { ok: false, error: 'Такой комнаты нет' }

  for (const [member, room] of rooms) {
    await writeMemberRooms(member, (all) =>
      all.map((one) =>
        one.id === id
          ? {
              ...one,
              ...(change.title === undefined ? {} : { title: change.title.trim() }),
              ...(change.face === undefined ? {} : { face: change.face })
            }
          : one
      )
    )
    void room
  }

  return { ok: true, id }
}

/** Роспуск. Убирает запись у каждого участника; сессии остаются на сервере —
 * разговор был, и стирать его вместе с комнатой мы не вправе. */
export async function disbandRoom(id: string): Promise<RoomOutcome> {
  const rooms = await memberRooms(id)
  if (rooms.size === 0) return { ok: false, error: 'Такой комнаты нет' }

  for (const member of rooms.keys()) {
    await writeMemberRooms(member, (all) => all.filter((one) => one.id !== id))
  }

  core().saveTranscript(id, [])
  return { ok: true, id }
}

/** Сколько участников ответит на этот вопрос — ДО отправки.
 *
 * Комната обязана показать это заранее: разница между «спросил одного» и
 * «спросил шестерых» — это разница в счёте, и узнавать её постфактум человек
 * не должен.
 */
export async function willAnswer(id: string, text: string): Promise<string[]> {
  const rooms = await memberRooms(id)
  const first = [...rooms.values()][0]
  if (first === undefined) return []

  return roundQueue(addressed(text, first.members, await titlesOf()), 1, 0)
}

/**
 * Ждёт конца хода участника. Ответ приходит событием его сессии.
 *
 * СЛУШАТЬ НАЧИНАЕМ ДО ОТПРАВКИ, и это не осторожность, а необходимость:
 * `prompt.submit` возвращается сразу, а событие конца хода приходит своим
 * путём — ничто не обещает, что ответ на вызов придёт первым. Подписка после
 * отправки теряет ход, который успел закончиться, и комната ждёт до срока
 * того, кто уже ответил. Поймано тестом, а не догадкой.
 */
function awaitTurn(
  sessionId: string,
  submit: () => Promise<unknown>
): Promise<{ text: string; failed: string }> {
  return new Promise((resolve) => {
    const done = (value: { text: string; failed: string }): void => {
      clearTimeout(timer)
      stop()
      resolve(value)
    }

    const timer = setTimeout(() => done({ text: '', failed: 'не успел' }), TURN_TIMEOUT_MS)

    const stop = core().onGatewayEvent((raw) => {
      const event = (raw ?? {}) as { type?: string; session_id?: string; payload?: unknown }
      if (event.session_id !== sessionId) return

      if (event.type === 'message.complete') {
        const payload = (event.payload ?? {}) as { text?: string; status?: string }
        // Их `status` различает «дописал», «сорвался» и «прервали». Сорвавшийся
        // участник — это молчание, а не поломка комнаты (правило §Р5).
        done({
          text: payload.status === 'complete' ? String(payload.text ?? '') : '',
          failed: payload.status === 'complete' ? '' : String(payload.status ?? 'сорвался')
        })
      } else if (event.type === 'error') {
        const payload = (event.payload ?? {}) as { message?: string }
        done({ text: '', failed: String(payload.message ?? 'сорвался') })
      }
    })

    // Отправка ВНУТРИ ожидания: подписка уже стоит, и ход, закончившийся
    // мгновенно, попадает в неё, а не мимо.
    submit().catch((error: unknown) => {
      done({ text: '', failed: error instanceof Error ? error.message : String(error) })
    })
  })
}

/**
 * Ответ, пришедший ПОСЛЕ конца круга, подбирается фоном.
 *
 * Без этого медленный специалист исчезает молча: комната перестала его слушать,
 * а он всё-таки ответил — и его слова некуда положить. Человек об этом не
 * узнаёт никогда, что хуже любого сообщения об ошибке.
 *
 * Реплика ложится в переписку сама и НОВОГО КРУГА НЕ ПОДНИМАЕТ: круг закончен,
 * а опоздавший, зовущий следующего, раскрутил бы разговор заново, уже без
 * человека.
 */
function watchLate(
  roomId: string,
  waiting: { member: string; session: string; round: number }[],
  notify: (event: GroupEvent) => void
): void {
  if (waiting.length === 0) return

  let left = [...waiting]
  const timer = setTimeout(() => stop(), LATE_WINDOW_MS)

  const stop = (): void => {
    clearTimeout(timer)
    unsubscribe()
  }

  const unsubscribe = core().onGatewayEvent((raw) => {
    const event = (raw ?? {}) as { type?: string; session_id?: string; payload?: unknown }
    const late = left.find((one) => one.session === event.session_id)
    if (late === undefined) return
    if (event.type !== 'message.complete' && event.type !== 'error') return

    left = left.filter((one) => one !== late)
    if (left.length === 0) stop()

    const payload = (event.payload ?? {}) as { text?: string; status?: string }
    const text = payload.status === 'complete' ? String(payload.text ?? '') : ''
    if (text === '' || isSilence(text)) {
      notify({ member: late.member, kind: 'passed', round: late.round })
      return
    }

    // Переписка перечитывается с диска: пока участник опаздывал, человек мог
    // сказать в комнате ещё что-нибудь, и писать поверх своей памяти значило бы
    // это стереть.
    const transcript = core().loadTranscript(roomId)
    transcript.push({ from: late.member, text })
    core().saveTranscript(roomId, transcript)

    void writeMemberRooms(late.member, (all) =>
      all.map((one) => (one.id === roomId ? { ...one, seen: transcript.length } : one))
    ).catch(() => undefined)

    notify({ member: late.member, kind: 'answered', round: late.round })
  })
}

/** Ход одного участника: его сессия, его новое, его ответ. */
async function memberTurn(
  member: string,
  room: MemberRoom,
  transcript: GroupTurn[],
  titles: Record<string, string>
): Promise<{ text: string; failed: string; session: string }> {
  let session = room.session

  if (session === '') {
    const created = (await core().request('session.create', { profile: member })) as {
      session_id?: string
      id?: string
    }
    session = String(created?.session_id ?? created?.id ?? '')
    if (session === '') return { text: '', failed: 'сессия не завелась', session: '' }

    // Записывается СРАЗУ: потерянный идентификатор оставляет на сервере сироту.
    await writeMemberRooms(member, (all) =>
      all.map((one) => (one.id === room.id ? { ...one, session } : one))
    )
  }

  const brief = briefFor(transcript, room.seen, titles)
  if (brief === '') return { text: '', failed: '', session }

  const answer = await awaitTurn(session, () =>
    core().request('prompt.submit', { session_id: session, text: brief })
  )

  return { ...answer, session }
}

/**
 * Ход комнаты: вопрос человека, круги ответов, остановка по пределу.
 *
 * `notify` получает ленту событий — она объясняет молчание и НЕ сохраняется:
 * единственная запись разговора остаётся сама переписка.
 */
export async function askRoom(
  id: string,
  text: string,
  notify: (event: GroupEvent) => void = () => {}
): Promise<{ ok: boolean; error?: string; turns?: GroupTurn[] }> {
  const said = text.trim()
  if (said === '') return { ok: false, error: 'Пустое сообщение' }

  const rooms = await memberRooms(id)
  const first = [...rooms.values()][0]
  if (first === undefined) return { ok: false, error: 'Такой комнаты нет' }

  const titles = await titlesOf()
  const transcript = core().loadTranscript(id)
  transcript.push({ from: '', text: said })

  // Сообщение человека снимает пометку «нужны вы»: он пришёл.
  for (const member of rooms.keys()) {
    await writeMemberRooms(member, (all) =>
      all.map((one) => (one.id === id ? { ...one, needsYou: false } : one))
    )
  }

  let spent = 0
  let round = 1
  let queue = roundQueue(addressed(said, first.members, titles), round, spent)
  let called = false
  /** Те, кого комната ждать перестала. Их ответ подберётся после круга. */
  const late: { member: string; session: string; round: number }[] = []

  while (queue.length > 0) {
    for (const member of queue) notify({ member, kind: 'queued', round })

    const replies: GroupTurn[] = []

    for (const member of queue) {
      const room = rooms.get(member)
      if (room === undefined) {
        notify({ member, kind: 'failed', round })
        continue
      }

      notify({ member, kind: 'working', round })
      spent += 1

      let answer: { text: string; failed: string; session: string }
      try {
        answer = await memberTurn(member, room, transcript, titles)
      } catch (error: unknown) {
        answer = {
          text: '',
          failed: error instanceof Error ? error.message : String(error),
          session: room.session
        }
      }

      room.session = answer.session
      room.seen = transcript.length

      if (answer.failed !== '') {
        const timedOut = answer.failed === 'не успел'
        // Не успел — значит ещё думает. Его сессия остаётся под присмотром:
        // ответ придёт и ляжет в переписку сам.
        if (timedOut && answer.session !== '') {
          late.push({ member, session: answer.session, round })
        }
        notify({ member, kind: timedOut ? 'timeout' : 'failed', round })
        continue
      }
      if (isSilence(answer.text)) {
        notify({ member, kind: 'passed', round })
        continue
      }

      const reply = { from: member, text: answer.text }
      replies.push(reply)
      transcript.push(reply)
      // Отметка сдвигается ПОСЛЕ его собственной реплики: иначе следующим
      // сообщением участнику пересказали бы то, что он сам только что сказал —
      // и он получил бы свои слова как чужую новость.
      room.seen = transcript.length
      if (wantsYou(answer.text)) called = true
      notify({ member, kind: 'answered', round })
    }

    round += 1
    queue = roundQueue(nextRound(replies, first.members, titles), round, spent)
  }

  core().saveTranscript(id, transcript)

  // `seen` и пометка «нужны вы» — одной записью на участника в конце хода:
  // цена ошибки здесь один повтор уже слышанного, а не сирота на сервере.
  for (const [member, room] of rooms) {
    await writeMemberRooms(member, (all) =>
      all.map((one) =>
        one.id === id ? { ...one, session: room.session, seen: room.seen, needsYou: called } : one
      )
    )
  }

  // Присмотр за опоздавшими ставится ПОСЛЕ записи полей: он переживёт этот
  // вызов, и его реплика перечитает переписку с диска, а не из этой памяти.
  watchLate(id, late, notify)

  notify({ member: '', kind: 'finished', round })
  return { ok: true, turns: transcript }
}

/** Предел реплик за ход — наружу, чтобы окно могло сказать о нём заранее. */
export const ROOM_MESSAGE_LIMIT = MAX_MESSAGES
