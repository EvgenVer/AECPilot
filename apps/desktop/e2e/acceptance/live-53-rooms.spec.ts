// Задача T53 (UR47, решение 0017): групповые чаты на логике ядра 0.23, на ЖИВОМ едином
// шлюзе (`gateway ensure`). Комнату ведёт шлюз (`groups.capabilities` → `driver: true`),
// окно — их канонический путь (`canonical-group-*.tsx`). Проверяется то, что не стоит денег:
// создание комнаты, кто отвечает (все / ведущий / автовыбор), назначение и общие заметки,
// комната переживает перезапуск, комната прежней версии (её вело само окно) читается, но не
// продолжается, и предел обмена между ботами (`gateway.bot_loop_guard.max_hops`).
//
// Бесплатно: модель не вызывается — ни одного сообщения в комнату. Ход с ведущим — ручной
// прогон с согласия владельца. Профиль — временная копия e2e-profile.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test, type Locator, type Page } from '@playwright/test'

import {
  hideFirstRunSurfaces,
  mainWindow,
  openProject,
  reopenRecentProject,
  standFixture
} from '../lib/app'
import { profileBotLoopGuard } from '../lib/core'

test.describe.configure({ mode: 'serial' })

const stand = standFixture({ mode: 'live', label: 'live-53' })

const TEAM = [
  { name: 'smeta', title: 'Smeta', role: 'сметчик' },
  { name: 'konstruktor', title: 'Konstruktor', role: 'конструктор' },
  { name: 'snip', title: 'Snip', role: 'нормоконтролёр' }
] as const

const PURPOSE = 'Перекрытие над подвалом: монолит или сборные плиты'
const NOTES = 'Срок сдачи — март. Нормы: СП 63.13330.'

/** Комната версии 0.1: её вело само окно, журнал лежит в хранилище плагина. */
const LEGACY = 'Прежняя комната КЖ'
const LEGACY_LINE = 'Прежний ответ сметчика: плиты дешевле на 12 %.'
const PLUGIN_ROOMS_KEY = 'hermes.plugin.hermes-bots.group-chats'

let projectOpened = false
let roomName = ''

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

async function rooms(page: Page): Promise<Room[]> {
  return ((await rpc(page, 'groups.list', { limit: 100, offset: 0 })) as { rooms: Room[] }).rooms
}

async function roomContext(page: Page, roomId: string): Promise<Record<string, unknown>> {
  const state = (await rpc(page, 'groups.state', { room_id: roomId })) as {
    context?: Record<string, unknown>
  }
  return state.context ?? {}
}

async function relaunch(): Promise<Page> {
  await stand.get().relaunch()
  await reopenRecentProject(await mainWindow(stand.get()))
  return roster(await ui())
}

async function openRoomSettings(page: Page): Promise<Locator> {
  // Кнопка настроек живёт в панели «О комнате»; панель открывается щелчком по заголовку.
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

async function chooseRouting(dialog: Locator, option: RegExp): Promise<void> {
  await dialog.getByRole('combobox', { name: 'Кто отвечает на сообщение без упоминаний' }).click()
  await dialog.page().getByRole('option', { name: option }).click()
}

// ───────────────────────────── подготовка ─────────────────────────────────────

test('подготовка: трое специалистов заведены ядром', async () => {
  const page = await roster(await ui())
  for (const member of TEAM) {
    await rpc(page, 'profiles.create', {
      name: member.name,
      description: member.role,
      clone_from: null
    })
  }
  for (const member of TEAM) {
    await expect(rosterRow(page, member.title)).toBeVisible({ timeout: 60000 })
  }
})

// ───────────────────────────── комнаты ведёт шлюз ─────────────────────────────

test('53.1.1 комнатами владеет единый шлюз ядра', async () => {
  const page = await ui()
  const capabilities = (await rpc(page, 'groups.capabilities', {})) as Record<string, unknown>
  console.log('53.1.1 groups.capabilities: ' + JSON.stringify(capabilities))
  expect(capabilities.driver, 'шлюз — исполнитель комнат').toBe(true)
  expect(capabilities.methods).toEqual(
    expect.arrayContaining(['groups.create', 'groups.list', 'groups.state', 'groups.context'])
  )
})

test('53.1.2 комната, созданная в окне, — комната шлюза с тремя участниками', async () => {
  const page = await roster(await ui())
  await page.getByRole('button', { name: 'Новый специалист или комната' }).click()
  await page.getByRole('menuitem', { name: 'Новая комната' }).click()
  const dialog = page.getByRole('dialog', { name: 'Новая комната' })
  await expect(dialog).toBeVisible({ timeout: 15000 })
  // Канонический путь не показывает «Checking group driver…» дольше проверки шлюза.
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
  const name = dialog.getByRole('textbox', { name: 'Имя комнаты' })
  roomName = (await name.getAttribute('placeholder')) ?? ''
  console.log('53.1.2 имя по составу: ' + roomName)
  await dialog.getByRole('button', { name: /^Create Group \(3\)$/ }).click()
  await expect(dialog).toBeHidden({ timeout: 60000 })
  await expect(page.getByRole('button', { name: roomName }).first()).toBeVisible({
    timeout: 60000
  })
  const live = await rooms(page)
  console.log('53.1.2 groups.list: ' + JSON.stringify(live.map((r) => [r.name, r.members.length])))
  const room = live.find((candidate) => candidate.name === roomName)
  expect(room, 'комната есть в списке шлюза').toBeTruthy()
  expect(room!.members).toHaveLength(3)
  await expect(page.getByRole('textbox', { name: 'Сообщение в комнату' })).toBeVisible({
    timeout: 60000
  })
})

// ───────────────────────────── кто отвечает, цель, заметки ────────────────────

test('53.2.1 назначение, общие заметки и ведущий сохраняются в шлюзе', async () => {
  const page = await ui()
  const dialog = await openRoomSettings(page)
  await dialog.getByRole('textbox', { name: 'Назначение' }).fill(PURPOSE)
  await dialog.getByRole('textbox', { name: /^Общие заметки/ }).fill(NOTES)
  await chooseRouting(dialog, /^Ведущий: konstruktor/i)
  await dialog.getByRole('button', { name: /^Сохранить$|^Save$/ }).click()
  await expect(dialog).toBeHidden({ timeout: 30000 })

  const room = (await rooms(page)).find((candidate) => candidate.name === roomName)!
  const context = await roomContext(page, room.room_id)
  console.log('53.2.1 context: ' + JSON.stringify(context))
  const lead = room.members.find((member) =>
    [member.profile, member.handle, member.display_name].some((v) =>
      String(v ?? '')
        .toLowerCase()
        .includes('konstruktor')
    )
  )
  expect(context.purpose).toBe(PURPOSE)
  expect(context.notes).toBe(NOTES)
  expect(context.routing).toBe('lead')
  expect(context.lead_member_id).toBe(lead?.member_id)
})

test('53.2.2 автовыбор отвечающих предлагается и сохраняется', async () => {
  const page = await ui()
  const dialog = await openRoomSettings(page)
  await chooseRouting(dialog, /^Выбирать отвечающих автоматически/)
  await dialog.getByRole('button', { name: /^Сохранить$|^Save$/ }).click()
  await expect(dialog).toBeHidden({ timeout: 30000 })
  const room = (await rooms(page)).find((candidate) => candidate.name === roomName)!
  expect((await roomContext(page, room.room_id)).routing).toBe('auto')
})

test('53.2.3 «Отвечают все» возвращается, назначение и заметки на месте', async () => {
  const page = await ui()
  const dialog = await openRoomSettings(page)
  await chooseRouting(dialog, /^Отвечают все/)
  await dialog.getByRole('button', { name: /^Сохранить$|^Save$/ }).click()
  await expect(dialog).toBeHidden({ timeout: 30000 })
  const room = (await rooms(page)).find((candidate) => candidate.name === roomName)!
  const context = await roomContext(page, room.room_id)
  expect(context.routing).toBe('everyone')
  expect(context.purpose).toBe(PURPOSE)
  expect(context.notes).toBe(NOTES)
})

// ───────────────────────────── перезапуск ─────────────────────────────────────

test('53.3.1 после перезапуска комната и её настройки на месте', async () => {
  const page = await relaunch()
  const row = page.getByRole('button', { name: roomName }).first()
  await expect(row).toBeVisible({ timeout: 120000 })
  await row.click()
  await expect(page.getByRole('textbox', { name: 'Сообщение в комнату' })).toBeVisible({
    timeout: 60000
  })
  const room = (await rooms(page)).find((candidate) => candidate.name === roomName)!
  expect((await roomContext(page, room.room_id)).purpose).toBe(PURPOSE)
})

// ───────────────────────────── комната прежней версии ─────────────────────────

test('53.4.1 комната версии 0.1 видна в списке после перехода', async () => {
  const page = await ui()
  // Запись той формы, что писало окно 0.1 (донор 0.22.2): журнал и состав в хранилище плагина.
  await page.evaluate(
    ([key, name, line]) => {
      const stored = JSON.parse(window.localStorage.getItem(key) ?? '{}') as Record<string, unknown>
      const at = Date.now() - 86_400_000
      stored[name] = {
        roomId: 'legacy-t53',
        members: [
          { name: 'smeta', display_name: 'Smeta' },
          { name: 'konstruktor', display_name: 'Konstruktor' }
        ],
        log: [
          { at, from: { kind: 'user', name: 'You' }, text: 'Монолит или плиты?', id: 'l1' },
          { at: at + 1000, from: { kind: 'member', name: 'smeta' }, text: line, id: 'l2' }
        ],
        watermarks: {},
        sessions: {}
      }
      window.localStorage.setItem(key, JSON.stringify(stored))
    },
    [PLUGIN_ROOMS_KEY, LEGACY, LEGACY_LINE] as const
  )
  const again = await relaunch()
  await expect(again.getByRole('button', { name: new RegExp(`^${LEGACY}`) }).first()).toBeVisible({
    timeout: 120000
  })
})

test('53.4.2 прежняя комната читается, но не продолжается: прежние сообщения и «Начать новую комнату»', async () => {
  const page = await ui()
  await page
    .getByRole('button', { name: new RegExp(`^${LEGACY}`) })
    .first()
    .click()
  await expect(page.getByText(/^Эту комнату вёл сам AECPilot/).first()).toBeVisible({
    timeout: 60000
  })
  await expect(page.getByText(LEGACY_LINE).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Начать новую комнату' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Сообщение в комнату' })).toHaveCount(0)
  // Журнал прежней комнаты не тронут окном 0.2.
  const stored = await page.evaluate(
    (key) => window.localStorage.getItem(key) ?? '',
    PLUGIN_ROOMS_KEY
  )
  expect(stored).toContain(LEGACY_LINE)
})

// ───────────────────────────── предел обмена между ботами ─────────────────────

test('53.5.1 предел обмена ботов закреплён в профиле: включён, 4 перехода', async () => {
  const config = readFileSync(join(stand.get().profileDir!, 'config.yaml'), 'utf-8')
  const block = /\n {2}bot_loop_guard:\n((?: {4}.*\n)+)/.exec(config)?.[1] ?? ''
  console.log('53.5.1 gateway.bot_loop_guard:\n' + block)
  expect(block).toMatch(/^ {4}enabled: true$/m)
  expect(block).toMatch(/^ {4}max_hops: 4$/m)
})

test('53.5.2 ядро на этом профиле обрывает обмен ботов на пятом сообщении', async () => {
  const guard = profileBotLoopGuard(stand.get().profileDir!)
  console.log('53.5.2 ' + JSON.stringify(guard))
  expect(guard.enabled).toBe(true)
  expect(guard.max_hops).toBe(4)
  expect(guard.states).toEqual(['human', 'ok', 'ok', 'ok', 'ok', 'max_hops'])
})
