// Задача T53 (UR47, решение 0017), платная часть: комната из трёх специалистов на ЖИВОМ
// едином шлюзе, ведущий — konstruktor, один вопрос без @-упоминаний. Проверяется, что
// ведущий распределил вопрос (событие шлюза `room.assignment` и строка
// `[data-testid="room-assignment"]` в ленте) и что пришёл хотя бы один ответ участника
// (`message.member` в `groups.log`).
//
// ПЛАТНО: ход ведущего и ответы участников — вызовы модели `gemini-3.8-flash` профиля
// автотестов. Запускать один раз и только с согласия владельца (бюджет 2026-11-12 — до $2).
// Бесплатные позиции комнат — `live-53-rooms.spec.ts`. Профиль — временная копия e2e-profile.

import { expect, test, type Locator, type Page } from '@playwright/test'

import { hideFirstRunSurfaces, mainWindow, openProject, standFixture } from '../lib/app'
import { record } from '../lib/evidence'

test.describe.configure({ mode: 'serial' })

const stand = standFixture({ mode: 'live', label: 'model-53' })

const MODEL = 'gemini-3.8-flash'
const PROVIDER = 'gemini'

const TEAM = [
  {
    name: 'smeta',
    title: 'Smeta',
    role: 'сметчик',
    soul: 'Ты сметчик. Считай деньги и сроки. Отвечай текстом, без инструментов.'
  },
  {
    name: 'konstruktor',
    title: 'Konstruktor',
    role: 'конструктор',
    soul: 'Ты конструктор и ведущий комнаты. Отвечай за несущую способность. Без инструментов.'
  },
  {
    name: 'snip',
    title: 'Snip',
    role: 'нормоконтролёр',
    soul: 'Ты нормоконтролёр. Проверяй по нормам и ссылайся на пункт. Без инструментов.'
  }
] as const

const QUESTION =
  'Перекрытие над подвалом жилого дома: монолит или сборные плиты? Ответьте коротко, ' +
  'в два-три предложения, со своей позиции. Инструменты не запускайте.'

let projectOpened = false
let roomName = ''
let roomId = ''

async function ui(): Promise<Page> {
  const page = await mainWindow(stand.get())
  await hideFirstRunSurfaces(page)
  if (!projectOpened) {
    await openProject(stand.get(), page)
    projectOpened = true
  }
  return page
}

async function roster(page: Page): Promise<Page> {
  await page.getByRole('tab', { name: /Bots|Боты|Специалисты/i }).click()
  await page.waitForTimeout(1500)
  return page
}

function rosterRow(page: Page, title: string): Locator {
  return page.getByRole('button', { name: new RegExp(`^${title}( ·|$)`) }).first()
}

async function rpc(page: Page, method: string, params: Record<string, unknown>): Promise<unknown> {
  const answer = (await page.evaluate(
    ([m, p]) => window.aecpilot.gatewayRpc(m as string, p as Record<string, unknown>),
    [method, params] as const
  )) as { ok?: boolean; value?: unknown; error?: unknown }
  if (answer?.ok === false) throw new Error(`${method}: ${JSON.stringify(answer.error)}`)
  return answer?.value ?? answer
}

interface Room {
  room_id: string
  name: string
  members: Array<{ member_id: string; profile?: string; display_name?: string; handle?: string }>
}

interface RoomEvent {
  seq: number
  kind: string
  actor?: { kind?: string; id?: string; profile?: string | null; display_name?: string | null }
  payload: Record<string, unknown>
}

async function rooms(page: Page): Promise<Room[]> {
  return ((await rpc(page, 'groups.list', { limit: 100, offset: 0 })) as { rooms: Room[] }).rooms
}

async function roomLog(page: Page): Promise<RoomEvent[]> {
  const events: RoomEvent[] = []
  let cursor = 0
  for (let pages = 0; pages < 20; pages += 1) {
    const chunk = (await rpc(page, 'groups.log', {
      room_id: roomId,
      since_seq: cursor,
      limit: 100
    })) as { events: RoomEvent[]; has_more?: boolean; cursor?: number }
    events.push(...chunk.events)
    if (!chunk.has_more || !chunk.events.length) break
    cursor = chunk.events[chunk.events.length - 1].seq
  }
  return events
}

function summary(events: RoomEvent[]): string {
  return events
    .map((event) => {
      const who = event.actor?.display_name || event.actor?.profile || event.actor?.id || '?'
      const text = typeof event.payload.text === 'string' ? event.payload.text : ''
      const rest = text ? text.replace(/\s+/g, ' ').slice(0, 300) : JSON.stringify(event.payload)
      return `#${event.seq} ${event.kind} [${who}] ${rest.slice(0, 300)}`
    })
    .join('\n')
}

async function openRoomSettings(page: Page): Promise<Locator> {
  const settings = page.getByRole('button', { name: 'Настройки комнаты', exact: true }).first()
  if (!(await settings.isVisible().catch(() => false))) {
    await page
      .getByRole('button', { name: /^О комнате/ })
      .first()
      .click()
  }
  await expect(settings).toBeEnabled({ timeout: 30000 })
  await settings.click()
  const dialog = page.getByRole('dialog', { name: 'Настройки комнаты' })
  await expect(dialog).toBeVisible({ timeout: 15000 })
  return dialog
}

// ───────────────────────────── подготовка (бесплатно) ─────────────────────────

test('53.6.1 подготовка: трое специалистов на модели профиля автотестов', async () => {
  const page = await roster(await ui())
  for (const member of TEAM) {
    const made = (await rpc(page, 'profiles.create', {
      name: member.name,
      description: member.role,
      clone_from: null,
      no_skills: true,
      soul: member.soul,
      model: MODEL,
      provider: PROVIDER
    })) as { model_set?: boolean }
    console.log(`53.6.1 ${member.name}: ` + JSON.stringify(made))
    expect(made.model_set, `${member.name}: модель закреплена`).toBe(true)
  }
  for (const member of TEAM) {
    await expect(rosterRow(page, member.title)).toBeVisible({ timeout: 60000 })
  }
})

test('53.6.2 подготовка: комната из трёх, ведущий konstruktor', async () => {
  const page = await roster(await ui())
  await page.getByRole('button', { name: 'Новый специалист или комната' }).click()
  await page.getByRole('menuitem', { name: 'Новая комната' }).click()
  const dialog = page.getByRole('dialog', { name: 'Новая комната' })
  await expect(dialog).toBeVisible({ timeout: 15000 })
  const boxes = dialog.getByRole('checkbox')
  await expect(boxes.first()).toBeVisible({ timeout: 60000 })
  const labels = await dialog.locator('label').allInnerTexts()
  for (let index = 0; index < labels.length; index += 1) {
    if (
      TEAM.some(
        (member) =>
          labels[index].includes(member.title) || labels[index].includes(`@${member.name}`)
      )
    ) {
      await boxes.nth(index).click()
    }
  }
  roomName =
    (await dialog.getByRole('textbox', { name: 'Имя комнаты' }).getAttribute('placeholder')) ?? ''
  await dialog.getByRole('button', { name: /^Create Group \(3\)$/ }).click()
  await expect(dialog).toBeHidden({ timeout: 60000 })
  await expect(page.getByRole('button', { name: roomName }).first()).toBeVisible({
    timeout: 60000
  })
  const room = (await rooms(page)).find((candidate) => candidate.name === roomName)
  expect(room, 'комната есть в списке шлюза').toBeTruthy()
  expect(room!.members).toHaveLength(3)
  roomId = room!.room_id

  const settings = await openRoomSettings(page)
  await settings.getByRole('combobox', { name: 'Кто отвечает на сообщение без упоминаний' }).click()
  await page.getByRole('option', { name: /^Ведущий: konstruktor/i }).click()
  await settings.getByRole('button', { name: /^Сохранить$|^Save$/ }).click()
  await expect(settings).toBeHidden({ timeout: 30000 })
  const state = (await rpc(page, 'groups.state', { room_id: roomId })) as {
    context?: Record<string, unknown>
  }
  console.log('53.6.2 context: ' + JSON.stringify(state.context))
  expect(state.context?.routing).toBe('lead')
})

// ───────────────────────────── ход с ведущим (ПЛАТНО) ──────────────────────────

test('53.6.3 вопрос без упоминаний: ведущий распределил, участник ответил', async () => {
  const page = await ui()
  const composer = page.getByRole('textbox', { name: 'Сообщение в комнату' })
  await expect(composer).toBeVisible({ timeout: 60000 })
  await composer.fill(QUESTION)
  await composer.press('Enter')

  // Ведущий распределяет, участники отвечают; ждём до 7 минут, опрос раз в 10 с.
  let events: RoomEvent[] = []
  await expect
    .poll(
      async () => {
        events = await roomLog(page)
        const assigned = events.some((event) => event.kind === 'room.assignment')
        const answered = events.some((event) => event.kind === 'message.member')
        return assigned && answered
      },
      { timeout: 420000, intervals: [10000], message: 'распределение ведущего и ответ участника' }
    )
    .toBe(true)
  // Дать остальным назначенным договорить, чтобы журнал прогона был полным.
  await page.waitForTimeout(30000)
  events = await roomLog(page)
  console.log('53.6.3 groups.log:\n' + summary(events))

  const sent = events.find((event) => event.kind === 'message.user')
  expect(sent, 'вопрос человека в журнале комнаты').toBeTruthy()
  expect(String(sent!.payload.text ?? '')).not.toMatch(/@\w/)
  const assignment = events.find((event) => event.kind === 'room.assignment')!
  console.log('53.6.3 room.assignment: ' + JSON.stringify(assignment))
  const replies = events.filter((event) => event.kind === 'message.member')
  expect(replies.length, 'хотя бы один ответ участника').toBeGreaterThan(0)

  // Окно показывает решение ведущего строкой в ленте.
  await expect(page.locator('[data-testid="room-assignment"]').first()).toBeVisible({
    timeout: 60000
  })
  console.log(
    '53.6.3 строка назначения: ' +
      (await page.locator('[data-testid="room-assignment"]').first().innerText())
  )
  await record(test.info(), page)
})
