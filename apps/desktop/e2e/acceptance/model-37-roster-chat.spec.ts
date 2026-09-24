// Блок 37 чек-листа (задача 3F.9) на ЖИВОМ ядре — позиции, где специалист
// должен ОТВЕТИТЬ или рутина должна ОТРАБОТАТЬ: клон отвечает (37.9.2),
// постоянный чат (37.10–37.13), «Запустить сейчас» (37.15), рутины скрытого
// (37.16.2). Список, карточка и скрытие без хода — в `live-37-roster`.

import { expect, test, type Locator, type Page } from '@playwright/test'

import { hideFirstRunSurfaces, mainWindow, openProject, standFixture } from '../lib/app'
import { record } from '../lib/evidence'
import { recordChatEvents, turn } from '../lib/turn'

test.describe.configure({ mode: 'serial' })

const stand = standFixture({ mode: 'live', label: 'model-37' })

let projectOpened = false

async function ui(): Promise<Page> {
  const page = await mainWindow(stand.get())
  await hideFirstRunSurfaces(page)
  if (!projectOpened) {
    await openProject(stand.get(), page)
    projectOpened = true
  }
  await recordChatEvents(page)
  return page
}

async function roster(page: Page): Promise<Page> {
  await page.getByRole('tab', { name: /Bots|Специалисты/i }).click()
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

/** REST ядра от имени профиля — тем же мостом, каким ходит их панель рутин. */
async function api<T>(page: Page, request: { path: string; method?: string; profile?: string; body?: unknown }): Promise<T> {
  return page.evaluate(
    (r) => (window as unknown as { hermesDesktop: { api: (x: unknown) => Promise<unknown> } }).hermesDesktop.api(r),
    request
  ) as Promise<T>
}

async function createSpecialist(
  page: Page,
  fields: { name: string; title: string; description: string; cloneFrom?: string }
): Promise<void> {
  await page.getByRole('button', { name: 'Новый специалист или комната' }).click()
  await page.getByRole('menuitem', { name: 'Новый специалист' }).click()
  const dialog = page.getByRole('dialog').last()
  await expect(dialog).toBeVisible({ timeout: 15000 })
  await dialog.getByRole('textbox').nth(0).fill(fields.name)
  await dialog.getByRole('textbox').nth(1).fill(fields.title)
  await dialog.getByRole('textbox').nth(2).fill(fields.description)
  if (fields.cloneFrom) {
    await dialog.getByRole('button', { name: /^Возможности/ }).click()
    const clone = dialog.getByRole('combobox').first()
    await expect(clone).toBeVisible({ timeout: 30000 })
    await clone.click()
    await page.getByRole('option', { name: fields.cloneFrom, exact: true }).click()
    await expect(clone).toContainText(fields.cloneFrom)
  }
  await dialog.getByRole('button', { name: /^Create Bot$/ }).click()
  await expect(dialog).toBeHidden({ timeout: 60000 })
  // Превью строки сменяется с «Привет! Расскажи о себе.» на его ответ, когда
  // самопредставление закончено.
  await expect(rosterRow(page, fields.title)).toContainText('Привет', { timeout: 180000 })
  await expect(rosterRow(page, fields.title)).not.toContainText('Расскажи о себе', { timeout: 240000 })
}

/** Открыть чат специалиста и дождаться, пока он «проснётся». */
async function openChat(page: Page, title: string): Promise<void> {
  await rosterRow(page, title).click()
  await expect(page.getByText(/^Пробуждаем/)).toHaveCount(0, { timeout: 180000 })
  const started = Date.now()
  await expect(page.getByRole('textbox', { name: /Message|Сообщение/ }).last()).toBeVisible({ timeout: 240000 })
  console.log(`openChat ${title}: ${Math.round((Date.now() - started) / 1000)} с`)
}

function thread(page: Page) {
  return page.locator('[data-slot="aui_assistant-message-root"]')
}

/** Сессии профиля в ядре: обычный список (его рисует «Сеансы») и со скрытыми. */
async function profileSessions(page: Page, profile: string, includeHidden: boolean): Promise<Array<{ id: string; title?: string }>> {
  const answer = (await rpc(page, 'session.list', { profile, limit: 200, include_hidden: includeHidden })) as {
    sessions: Array<{ id: string; title?: string }>
  }
  return answer.sessions
}

// ───────────────────────────── 37.3 Клон ──────────────────────────────────────

test('37.9.2 клон отвечает — доступы скопировались вместе с ним', async () => {
  const page = await roster(await ui())
  await createSpecialist(page, { name: 'smeta', title: 'Смета', description: 'сметчик: считает деньги и сроки' })
  await createSpecialist(page, { name: 'smeta-kopiya', title: 'Смета копия', description: 'второй сметчик', cloneFrom: 'smeta' })
  await openChat(page, 'Смета копия')
  // Самопредставление при создании — это его первый ответ; ждём конца хода
  // (кнопка остановки уходит), чтобы читать законченный текст.
  await expect(thread(page).first()).toBeVisible({ timeout: 60000 })
  await page.waitForTimeout(3000)
  const text = (await thread(page).allInnerTexts()).join('\n')
  console.log('37.9.2 ' + text.slice(0, 400).replace(/\n/g, ' ⏎ '))
  expect(text.trim().length, 'клон ответил').toBeGreaterThan(10)
  await record(test.info(), page)
})

// ───────────────────────────── 37.4 Постоянный чат ────────────────────────────

// D-133: повторно чат специалиста не открывается — щелчок по строке любого,
// кроме последнего заведённого и агента по умолчанию, оставляет «Пробуждаем
// <профиль>…» навсегда (сессия найдена, `session.resume` не уходит). Позиции,
// которым нужно вернуться в его чат, ждут починки.
test.fixme('37.10.1 щелчок по специалисту открывает ЕГО чат', async () => {})

test('37.10.2 в общем списке сессий этого чата нет — он скрытый', async () => {
  const page = await ui()
  const hidden = await profileSessions(page, 'smeta-kopiya', true)
  const visible = await profileSessions(page, 'smeta-kopiya', false)
  console.log('37.10.2 hidden=' + JSON.stringify(hidden) + ' visible=' + JSON.stringify(visible))
  expect(hidden.some((row) => row.title === 'Bot Chat'), 'постоянный чат есть').toBe(true)
  expect(visible.filter((row) => row.title === 'Bot Chat'), 'в обычном списке его нет').toEqual([])
})

test.fixme('37.11.1 после ухода к другому и возврата переписка та же', async () => {})

const WORD = 'KARNIZ-517'

// Дальше — в чате клона: он открыт сразу после создания (37.9.2), а вернуться
// в чат щелчком нельзя (D-133).
test('37.12.1 /new в его чате — объяснение, что этот чат не начинается заново', async () => {
  const page = await roster(await ui())
  await openChat(page, 'Смета копия')
  const result = await turn(page, `Запомни кодовое слово ${WORD}. Ответь одним словом «запомнил».`)
  console.log('37.12 ' + result.transcript.replace(/\n/g, ' ⏎ '))
  const composer = page.getByRole('textbox', { name: /Message|Сообщение/ }).last()
  await composer.click()
  await composer.fill('/new')
  await composer.press('Enter')
  await expect(page.getByText(/This chat never resets|Этот чат не начинается заново/).first()).toBeVisible({ timeout: 30000 })
})

test('37.12.2 новая сессия не создалась — переписка та же, сессий не прибавилось', async () => {
  const page = await ui()
  // Их подмена: `/new` → `/compact` — та же переписка, сжатый контекст.
  await page.waitForTimeout(5000)
  await expect(page.getByText(WORD).first(), 'переписка не раскололась').toBeVisible({ timeout: 60000 })
  expect(await profileSessions(page, 'smeta-kopiya', false), 'отдельной видимой сессии не появилось').toEqual([])
})

test.fixme('37.13.1 после перезапуска щелчок открывает ту же переписку', async () => {})

// ───────────────────────────── 37.5 Рутины ────────────────────────────────────

const ROUTINE = 'Отметка сметы'
const ROUTINE_MARK = 'RUTINA-SMETA-OK'

interface CronJobRow {
  id: string
  name?: string
  last_run_at?: null | string
}

async function smetaJob(page: Page): Promise<CronJobRow | undefined> {
  const jobs = await api<CronJobRow[]>(page, { path: '/api/cron/jobs?profile=smeta-kopiya', profile: 'smeta-kopiya' })
  // Их панель помечает задачу владельцем: «[bot:<профиль>] <название>».
  return jobs.find((job) => job.name === `[bot:smeta-kopiya] ${ROUTINE}`)
}

test('37.15.1 «Запустить сейчас»: рутина отработала', async () => {
  // Чат клона открыт с 37.12 — вернуться в него щелчком нельзя (D-133).
  const page = await ui()
  const tab = page.getByText('Запланированные задачи', { exact: true }).last()
  await expect(tab).toBeVisible({ timeout: 60000 })
  const create = page.getByRole('button', { name: 'Новый cron' }).first()
  if (!(await create.isVisible())) await tab.click()
  await expect(create).toBeVisible({ timeout: 120000 })
  await create.click()
  const dialog = page.getByRole('dialog').last()
  await dialog.getByRole('textbox').nth(0).fill(ROUTINE)
  await dialog.getByRole('textbox').nth(1).fill(`Ответь одной строкой: ${ROUTINE_MARK}. Инструментов не вызывай.`)
  // Куда результат: по умолчанию — только история запусков; чек-лист ждёт его
  // в чате специалиста.
  await dialog.getByRole('combobox').filter({ hasText: 'Только в историю запусков' }).click()
  await page.getByRole('option', { name: 'В чат Смета копия (специалист отвечает)' }).click()
  await dialog.getByRole('button', { name: /^Создать cron$/ }).click()
  await expect(dialog).toBeHidden({ timeout: 30000 })

  // Планировщик: первая рутина предлагает его поднять (блок 30) — и рутина
  // специалиста тоже, она заводится через RPC `cron.manage` (D-135). Без него
  // 37.16.2 ждать нечего.
  const offer = page.locator('[role="status"], [role="alert"]').filter({ hasText: /никто не запускает/ })
  await expect(offer).toBeVisible({ timeout: 30000 })
  await offer.getByRole('button', { name: 'Запускать по расписанию' }).click()
  await expect(page.getByRole('button', { name: 'Расписания: работают' })).toBeVisible({ timeout: 30000 })

  // D-134: в карточке специалиста кнопки «Выполнить сейчас» нет (их панель
  // рутин — просмотр и удаление); запускаем тем же вызовом ядра, что их кнопка
  // в общем списке задач (`triggerCronJob`), от имени профиля клона.
  await expect.poll(async () => Boolean(await smetaJob(page)), { timeout: 30000 }).toBe(true)
  const job = await smetaJob(page)
  await api(page, { path: `/api/cron/jobs/${job!.id}/trigger`, method: 'POST', profile: 'smeta-kopiya' })
  await expect
    .poll(async () => (await smetaJob(page))?.last_run_at ?? null, { timeout: 240000, intervals: [5000] })
    .not.toBe(null)
})

test('37.15.2 результат виден в чате ЭТОГО специалиста, а не в общем', async () => {
  const page = await roster(await ui())
  await expect(page.getByText(ROUTINE_MARK).first()).toBeVisible({ timeout: 180000 })
  await openChat(page, 'AECPilot')
  await expect(page.getByText(ROUTINE_MARK)).toHaveCount(0)
  await record(test.info(), page)
})

// ───────────────────────────── 37.6 Скрытие ───────────────────────────────────

// D-136: по расписанию рутины специалистов не срабатывают вообще — скрыт он
// или нет. Расписания у ядра свои у каждого профиля, и тикает их только
// процесс, поднятый в домашней папке этого профиля; наш запускатель
// (`main/cron-runner.ts`) поднимается один — для агента по умолчанию. Замер
// 23.09.2026: задача «каждую минуту» у клона при «Расписания: работают» за
// 4 минуты не сработала ни разу. Ждёт решения владельца.
test.fixme('37.16.2 рутины скрытого специалиста продолжают работать', async () => {
  const page = await roster(await ui())
  const job = await smetaJob(page)
  expect(job, 'рутина клона есть').toBeTruthy()
  // Каждую минуту — чтобы отработала сама, пока специалист скрыт.
  await api(page, {
    path: `/api/cron/jobs/${job!.id}`,
    method: 'PUT',
    profile: 'smeta-kopiya',
    body: { updates: { schedule: '* * * * *' } }
  })
  const before = job!.last_run_at

  await rosterRow(page, 'Смета копия').click({ button: 'right' })
  await page.getByRole('menuitem', { name: /^(Hide|Скрыть)$/ }).click()
  await expect(rosterRow(page, 'Смета копия')).toBeHidden({ timeout: 15000 })

  await expect
    .poll(async () => (await smetaJob(page))?.last_run_at ?? null, { timeout: 240000, intervals: [10000] })
    .not.toBe(before)
})
