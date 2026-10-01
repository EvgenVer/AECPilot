// Блок 37 чек-листа (задача 3F.9) на ЖИВОМ ядре — позиции, где специалист
// должен ОТВЕТИТЬ или рутина должна ОТРАБОТАТЬ: клон отвечает (37.9.2),
// постоянный чат (37.10–37.13), «Запустить сейчас» (37.15), рутины скрытого
// (37.16.2). Список, карточка и скрытие без хода — в `live-37-roster`.

import { expect, test, type Locator, type Page } from '@playwright/test'

import {
  clearNotifications,
  hideFirstRunSurfaces,
  mainWindow,
  openProject,
  reopenRecentProject,
  standFixture
} from '../lib/app'
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

/** REST ядра от имени профиля — тем же мостом, каким ходит их панель рутин. */
async function api<T>(
  page: Page,
  request: { path: string; method?: string; profile?: string; body?: unknown }
): Promise<T> {
  return page.evaluate(
    (r) =>
      (
        window as unknown as { hermesDesktop: { api: (x: unknown) => Promise<unknown> } }
      ).hermesDesktop.api(r),
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
  await dialog.getByRole('button', { name: /^(Create Bot|Создать специалиста)$/ }).click()
  await expect(dialog).toBeHidden({ timeout: 60000 })
  // Превью строки сменяется с «Привет! Расскажи о себе.» на его ответ, когда
  // самопредставление закончено.
  await expect(rosterRow(page, fields.title)).toContainText('Привет', { timeout: 180000 })
  await expect(rosterRow(page, fields.title)).not.toContainText('Расскажи о себе', {
    timeout: 240000
  })
}

/** Открыть чат специалиста и дождаться, пока он «проснётся». */
async function openChat(page: Page, title: string): Promise<void> {
  await rosterRow(page, title).click()
  await expect(page.getByText(/^Пробуждаем/)).toHaveCount(0, { timeout: 180000 })
  const started = Date.now()
  await expect(page.getByRole('textbox', { name: /Message|Сообщение/ }).last()).toBeVisible({
    timeout: 240000
  })
  console.log(`openChat ${title}: ${Math.round((Date.now() - started) / 1000)} с`)
}

function thread(page: Page) {
  return page.locator('[data-slot="aui_assistant-message-root"]')
}

/** Сессии профиля в ядре: обычный список (его рисует «Сеансы») и со скрытыми. */
async function profileSessions(
  page: Page,
  profile: string,
  includeHidden: boolean
): Promise<Array<{ id: string; title?: string }>> {
  const answer = (await rpc(page, 'session.list', {
    profile,
    limit: 200,
    include_hidden: includeHidden
  })) as {
    sessions: Array<{ id: string; title?: string }>
  }
  return answer.sessions
}

// ───────────────────────────── 37.3 Клон ──────────────────────────────────────

test('37.9.2 клон отвечает — доступы скопировались вместе с ним', async () => {
  const page = await roster(await ui())
  await createSpecialist(page, {
    name: 'smeta',
    title: 'Смета',
    description: 'сметчик: считает деньги и сроки'
  })
  await createSpecialist(page, {
    name: 'smeta-kopiya',
    title: 'Смета копия',
    description: 'второй сметчик',
    cloneFrom: 'smeta'
  })
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

const OWN_WORD = 'LOTOK-238'

// D-133 (починено): вернуться щелчком в чат специалиста, пока открыт чат
// ДРУГОГО, — именно то, что зависало на «Пробуждаем…».
test('37.10.1 щелчок по специалисту открывает ЕГО чат', async () => {
  const page = await roster(await ui())
  await openChat(page, 'Смета')
  const result = await turn(page, `Запомни слово ${OWN_WORD}. Ответь одним словом «ок».`)
  console.log('37.10.1 ' + result.transcript.replace(/\n/g, ' ⏎ '))
  await expect(page.getByText(OWN_WORD).first(), 'переписка этого специалиста').toBeVisible({
    timeout: 30000
  })
  const own = await profileSessions(page, 'smeta', true)
  expect(
    own.some((row) => row.title === 'Bot Chat'),
    'чат принадлежит ему'
  ).toBe(true)
  await record(test.info(), page, { transcript: result.transcript })
})

test('37.10.2 в общем списке сессий этого чата нет — он скрытый', async () => {
  const page = await ui()
  const hidden = await profileSessions(page, 'smeta-kopiya', true)
  const visible = await profileSessions(page, 'smeta-kopiya', false)
  console.log('37.10.2 hidden=' + JSON.stringify(hidden) + ' visible=' + JSON.stringify(visible))
  expect(
    hidden.some((row) => row.title === 'Bot Chat'),
    'постоянный чат есть'
  ).toBe(true)
  expect(
    visible.filter((row) => row.title === 'Bot Chat'),
    'в обычном списке его нет'
  ).toEqual([])
})

test('37.11.1 после ухода к другому и возврата переписка та же', async () => {
  const page = await roster(await ui())
  await openChat(page, 'Смета копия')
  await expect(page.getByText(OWN_WORD), 'у другого чужой переписки нет').toHaveCount(0)
  await openChat(page, 'Смета')
  await expect(page.getByText(OWN_WORD).first(), 'переписка та же').toBeVisible({ timeout: 60000 })
})

const WORD = 'KARNIZ-517'

// Дальше — в чате клона.
test('37.12.1 /new в его чате — объяснение, что этот чат не начинается заново', async () => {
  const page = await roster(await ui())
  await openChat(page, 'Смета копия')
  const result = await turn(page, `Запомни кодовое слово ${WORD}. Ответь одним словом «запомнил».`)
  console.log('37.12 ' + result.transcript.replace(/\n/g, ' ⏎ '))
  const composer = page.getByRole('textbox', { name: /Message|Сообщение/ }).last()
  await composer.click()
  await composer.fill('/new')
  await composer.press('Enter')
  await expect(
    page.getByText(/This chat never resets|Этот чат не начинается заново/).first()
  ).toBeVisible({ timeout: 30000 })
})

test('37.12.2 новая сессия не создалась — переписка та же, сессий не прибавилось', async () => {
  const page = await ui()
  // Их подмена: `/new` → `/compact` — та же переписка, сжатый контекст.
  await page.waitForTimeout(5000)
  await expect(page.getByText(WORD).first(), 'переписка не раскололась').toBeVisible({
    timeout: 60000
  })
  expect(
    await profileSessions(page, 'smeta-kopiya', false),
    'отдельной видимой сессии не появилось'
  ).toEqual([])
})

test('37.13.1 после перезапуска щелчок открывает ту же переписку', async () => {
  await stand.get().relaunch()
  // После перезапуска — экран выбора проекта (D-89): проект — из «недавних».
  await reopenRecentProject(await mainWindow(stand.get()))
  const page = await roster(await ui())
  await openChat(page, 'Смета копия')
  await expect(page.getByText(WORD).first(), 'та же переписка').toBeVisible({ timeout: 60000 })
  await record(test.info(), page)
})

// ───────────────────────────── 37.5 Рутины ────────────────────────────────────

const ROUTINE = 'Отметка сметы'
const ROUTINE_MARK = 'RUTINA-SMETA-OK'

interface CronJobRow {
  id: string
  name?: string
  last_run_at?: null | string
}

async function smetaJob(page: Page): Promise<CronJobRow | undefined> {
  const jobs = await api<CronJobRow[]>(page, {
    path: '/api/cron/jobs?profile=smeta-kopiya',
    profile: 'smeta-kopiya'
  })
  // Их панель помечает задачу владельцем: «[bot:<профиль>] <название>».
  return jobs.find((job) => job.name === `[bot:smeta-kopiya] ${ROUTINE}`)
}

let hintText = ''

test('37.15.1 «Запустить сейчас»: рутина отработала', async () => {
  test.setTimeout(600000)
  // Чат клона открыт с 37.13.
  const page = await ui()
  // D-140 (3G.19): «живым владельцем» Bot Chat, которому ядро доставляет результат
  // прямо в открытое окно, сессия становится только после первого хода в ней
  // (`tui_gateway/methods_session.py`: «lease claimed lazily on turn 1»). Без хода
  // результат пишется отдельным процессом в базу мимо окна — это D-140, решение
  // владельца. Здесь проверяется сценарий «человек разговаривает со специалистом».
  await turn(page, 'Ответь одним словом: готов.')
  const tab = page.getByText('Запланированные задачи', { exact: true }).last()
  await expect(tab).toBeVisible({ timeout: 60000 })
  const create = page.getByRole('button', { name: 'Новый cron' }).first()
  if (!(await create.isVisible())) await tab.click()
  await expect(create).toBeVisible({ timeout: 120000 })
  // Новая подсказка 30.7.1 не должна спрятаться в стопке прежних тостов.
  await clearNotifications(page)
  await create.click()
  const dialog = page.getByRole('dialog').last()
  await dialog.getByRole('textbox').nth(0).fill(ROUTINE)
  await dialog
    .getByRole('textbox')
    .nth(1)
    .fill(`Ответь одной строкой: ${ROUTINE_MARK}. Инструментов не вызывай.`)
  // Куда результат: по умолчанию — только история запусков; чек-лист ждёт его
  // в чате специалиста.
  await dialog.getByRole('combobox').filter({ hasText: 'Только в историю запусков' }).click()
  await page.getByRole('option', { name: 'В чат Смета копия (специалист отвечает)' }).click()
  await dialog.getByRole('button', { name: /^Создать cron$/ }).click()
  await expect(dialog).toBeHidden({ timeout: 30000 })
  // 30.7.1 (D-163): рутина с доставкой в чат специалиста — подсказка, где появится
  // результат. Проверяется в своей позиции ниже.
  hintText = await page
    .locator('[role="status"], [role="alert"]')
    .filter({ hasText: 'Где появится результат рутины' })
    .first()
    .innerText({ timeout: 15000 })
    .catch(() => '')

  // Планировщик: первая рутина предлагает его поднять (блок 30) — и рутина
  // специалиста тоже, она заводится через RPC `cron.manage` (D-135). Без него
  // 37.16.2 ждать нечего.
  const offer = page
    .locator('[role="status"], [role="alert"]')
    .filter({ hasText: /никто не запускает/ })
  await expect(offer).toBeVisible({ timeout: 30000 })
  await offer.getByRole('button', { name: 'Запускать по расписанию' }).click()
  await expect(page.getByRole('button', { name: 'Расписания: работают' })).toBeVisible({
    timeout: 30000
  })

  // Путь донора (D-158, паритет): в карточке специалиста кнопки запуска нет, она
  // на странице «Запланированные задачи» ПРОФИЛЯ специалиста. Профиль выбирается
  // квадратом в полосе профилей внизу вкладки «Сеансы» (на вкладке «Боты» её нет);
  // подпись квадрата — имя профиля.
  await expect.poll(async () => Boolean(await smetaJob(page)), { timeout: 30000 }).toBe(true)
  await page.getByRole('tab', { name: /Сеансы|Sessions/i }).click()
  const rail = page.locator('[data-slot="profile-rail"]')
  const clone = rail.getByRole('button', { name: /^(smeta-kopiya|Смета копия)$/ })
  await clone.click()
  await expect(clone).toHaveAttribute('aria-pressed', 'true', { timeout: 30000 })
  await page.getByRole('button', { name: 'Запланированные задачи', exact: true }).first().click()
  await page.getByRole('button', { name: 'Запустить сейчас' }).first().click()
  // Запуск берёт их планировщик на своём минутном тике — замерено от одного до
  // четырёх тиков после нажатия (29.09.2026), плюс сам ход специалиста.
  await expect
    .poll(async () => (await smetaJob(page))?.last_run_at ?? null, {
      timeout: 420000,
      intervals: [5000]
    })
    .not.toBe(null)
  // Назад, к агенту по умолчанию — их кнопкой «Переключиться на <агент>». Страница
  // задач — окно поверх полосы, сначала его закрываем.
  await page.keyboard.press('Escape')
  await expect(page.getByRole('heading', { name: 'Запланированные задачи' })).toBeHidden({
    timeout: 15000
  })
  await rail.getByRole('button', { name: /^Переключиться на / }).click()
  await expect(clone).toHaveAttribute('aria-pressed', 'false', { timeout: 30000 })
})

test('30.7.1 появилась подсказка «Где появится результат рутины»', () => {
  expect(hintText, 'подсказка показана при создании рутины в чат специалиста').toContain(
    'Где появится результат рутины'
  )
  expect(hintText).toMatch(/после вашей реплики|переоткроете чат/)
})

// D-141 закрыта задачей 3G.18: рутина исполняется командой `hermes -p <профиль>
// chat …`, и `hermes` на PATH теперь наш (пин, наш профиль), а не чужая установка
// без ключей («OPENAI_API_KEY is not set», замер 24.09.2026).
test('37.15.2 результат виден в чате ЭТОГО специалиста, а не в общем', async () => {
  test.setTimeout(600000)
  const page = await roster(await ui())
  // Доставка «в чат» уходит ЖИВОМУ владельцу «Bot Chat» — сессии, открытой через
  // шлюз ядра (`tools/bot_live_delivery.py`, флаг `bot_live_delivery_consumer`
  // ставит `tui_gateway/session_lifecycle.py`), и там идёт полный ход
  // специалиста. Живому владельцу ядро ставит квитанцию в очередь — исход
  // `queued`; без него пишет отдельным процессом — `delivered` (замер 29.09.2026).
  // D-140 (3G.19): открытый чат должен показать ответ сам, без переоткрытия, —
  // поэтому чат открывается ОДИН раз и ждём в нём.
  await openChat(page, 'Смета копия')
  await expect
    .poll(
      async () =>
        ((await smetaJob(page)) as { latest_execution?: { delivery_outcome?: string } } | undefined)
          ?.latest_execution?.delivery_outcome ?? null,
      { timeout: 420000, intervals: [5000], message: 'результат рутины доставлен' }
    )
    .toMatch(/^(queued|delivered)$/)
  await expect(
    thread(page).getByText(ROUTINE_MARK).filter({ visible: true }).first(),
    'ответ специалиста появился в открытом чате без переоткрытия'
  ).toBeVisible({ timeout: 300000 })
  await openChat(page, 'AECPilot')
  // Только в ленте открытого чата и только видимое: в списке специалистов строка
  // клона показывает его последнее сообщение — с меткой, и это верно; а его
  // скрытый чат остаётся в разметке (замер 29.09.2026).
  await expect(thread(page).getByText(ROUTINE_MARK).filter({ visible: true })).toHaveCount(0)
  await record(test.info(), page)
})

// ───────────────────────────── 37.6 Скрытие ───────────────────────────────────

// D-136 закрыта задачей 3F.D1: наш запускатель поднимает их шлюз в режиме
// мультиплекса профилей, и расписания тикают у КАЖДОГО профиля, а не только у
// агента по умолчанию (замер 23.09.2026: без этого рутина клона не срабатывала).
test('37.16.2 рутины скрытого специалиста продолжают работать', async () => {
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
    .poll(async () => (await smetaJob(page))?.last_run_at ?? null, {
      timeout: 240000,
      intervals: [10000]
    })
    .not.toBe(before)
})

// Вторая половина AC12 (блок 30, шаг 7): результат рутины ПОСЛЕ СРАБАТЫВАНИЯ по
// расписанию (37.16.2) доставлен. Доставка у задачи одна — «В чат Смета копия»
// (37.15.1), и на глаз она уже проверена в 37.15.2; здесь — что запуск по
// расписанию дошёл до доставки, а не остановился на истории запусков.
test('30.7.3 после срабатывания результат лёг в чат ЭТОГО специалиста', async () => {
  test.setTimeout(600000)
  const page = await ui()
  await expect
    .poll(
      async () =>
        ((await smetaJob(page)) as { latest_execution?: { delivery_outcome?: string } } | undefined)
          ?.latest_execution?.delivery_outcome ?? null,
      { timeout: 420000, intervals: [10000], message: 'результат запуска по расписанию доставлен' }
    )
    .toMatch(/^(queued|delivered)$/)
})
