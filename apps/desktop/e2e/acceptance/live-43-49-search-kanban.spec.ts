// Блоки 43 и 49 чек-листа (задача 3F.8) на ЖИВОМ ядре без ходов модели:
// провайдеры веб-поиска в наборе `web`, ключ без «показать» и доска задач.
//
// Ходов модели здесь нет: 43.2.1 (агент искал в интернете) и 49.2–49.4 — в 3F.9.
// Карточка на доске заводится в Todo явно без исполнителя — такую агент не берёт
// (подсказка самой доски: «No assignee, no run»), и перетаскивание не стоит хода.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test, type Locator, type Page } from '@playwright/test'

import { hideFirstRunSurfaces, mainWindow, openProject, standFixture } from '../lib/app'

test.describe.configure({ mode: 'serial' })

const stand = standFixture({ mode: 'live', label: 'live-43-49' })

let projectOpened = false

async function ui(): Promise<Page> {
  const page = await mainWindow(stand.get())
  await hideFirstRunSurfaces(page)
  if (!projectOpened) {
    await openProject(stand.get(), page)
    projectOpened = true
  }
  return page
}

async function rest<T>(page: Page, path: string): Promise<T> {
  return page.evaluate((p) => window.aecpilot.gatewayRest(p), path) as Promise<T>
}

/** Экран «Навыки» → вкладка по имени (кнопка со счётчиком рядом). */
async function openSkillsTab(page: Page, name: RegExp): Promise<void> {
  await page.evaluate(() => {
    window.location.hash = '#/capabilities'
  })
  const tab = page.getByRole('button', { name }).first()
  await expect(tab).toBeVisible({ timeout: 30000 })
  await tab.click()
}

/** Набор `web` раскрыт; строки провайдеров — кнопки с `aria-expanded` в своих
 *  карточках (у панели наборов и боковой панели такие кнопки тоже есть). */
async function openWebToolset(page: Page): Promise<Locator> {
  await openSkillsTab(page, /^(Tools|Инструменты)( \d+)?$/)
  const web = page.getByRole('button', { name: /^Web\b/ }).first()
  await expect(web).toBeVisible({ timeout: 30000 })
  await web.click()
  await expect(page.getByText(/^(Search|Поиск):\s/)).toBeVisible({ timeout: 20000 })
  return page.locator('div.overflow-hidden.rounded-xl > button[aria-expanded]')
}

/** Провайдеры веб-поиска, которые ядро зарегистрировало при старте, — из его
 *  же журнала. Это «что знает ядро» без посредника: окно рисует ответ REST, и
 *  сверять окно с тем же ответом значило бы сверять его с самим собой. */
function coreWebProviders(): string[] {
  const log = readFileSync(join(String(stand.get().profileDir), 'logs', 'agent.log'), 'utf8')
  const names = [...log.matchAll(/registered web provider: (\S+)/g)].map((m) => m[1])
  return [...new Set(names)]
}

// ───────────────────────────── Блок 43. Веб-поиск ─────────────────────────────

test('43.1.1 перечислены все провайдеры поиска ядра, и у каждого сказано, что ему нужно', async () => {
  const page = await ui()
  const rows = await openWebToolset(page)
  const texts = (await rows.allInnerTexts()).map((text) => text.replace(/\s+/g, ' ').trim())

  const known = coreWebProviders()
  // Чек-лист писался при девяти; на 0.21.3 ядро знает больше — важно «все».
  expect(known.length, 'ядро назвало провайдеров в журнале').toBeGreaterThanOrEqual(9)
  const panel = texts.join('\n').toLowerCase()
  for (const id of known) {
    // `brave-free` → «Brave Search (Free)», `xai` → «xAI Web Search»: окно
    // называет провайдера по-человечески, но первое слово id в имени есть.
    expect(panel, `провайдер ядра ${id} есть в окне`).toContain(id.split('-')[0].toLowerCase())
  }
  for (const text of texts) {
    // `native` (с 0.21.5, «OpenAI Native Web Search»): поиск встроен в саму
    // модель провайдера — ни ключа, ни сервера отдельно не нужно.
    expect(text, 'у строки сказано, что ей нужно').toMatch(
      /free|paid|no key|key optional|self-hosted|subscription|native/i
    )
  }
})

test('43.1.2 по умолчанию выбран ddgs — без ключа и без сервера', async () => {
  const page = await ui()
  const rows = await openWebToolset(page)
  await expect(page.getByText(/^(Search|Поиск):\s*ddgs$/)).toBeVisible()
  const ddgs = rows.filter({ hasText: /\(ddgs\)/ }).first()
  await expect(ddgs).toContainText(/no key/i)
  await expect(ddgs).toContainText(/Бэкенд поиска|Search backend/)
})

const FAKE_KEY = 'e2e-fake-tavily-key-not-real-0000'

test('43.3.1 у ключа провайдера нет «показать ключ», и после сохранения его не видно', async () => {
  const page = await ui()
  const rows = await openWebToolset(page)
  const row = rows.filter({ hasText: /^Tavily/ }).first()
  await row.click()
  // Всё дальше — внутри карточки Tavily: «Показать правую панель» в заголовке
  // окна и «Действия с сеансом» в боковой панели к ключу отношения не имеют.
  const card = page.locator('div.overflow-hidden.rounded-xl').filter({ hasText: /^Tavily/ })

  const actions = card.getByRole('button', { name: 'Действия', exact: true }).first()
  await expect(actions).toBeVisible({ timeout: 15000 })
  await actions.click()
  await page.getByRole('menuitem', { name: /^(Установить|Заменить)$/ }).click()

  const field = card.locator('input[type="password"]').first()
  await expect(field, 'ключ вводится скрытым полем').toBeVisible()
  await expect(card.getByRole('button', { name: /Показать|Show|Reveal/ })).toHaveCount(0)
  await field.fill(FAKE_KEY)
  await card.getByRole('button', { name: /^Сохранить$/ }).click()
  await expect(field).toBeHidden({ timeout: 15000 })

  expect(await page.locator('body').innerText(), 'ключ нигде не виден').not.toContain(FAKE_KEY)
  await actions.click()
  await expect(page.getByRole('menuitem').first()).toBeVisible()
  await expect(page.getByRole('menuitem', { name: /Показать значение|Reveal/ })).toHaveCount(0)
  await page.keyboard.press('Escape')
})

// ───────────────────────────── Блок 49. Доска задач ───────────────────────────

interface KanbanBoard {
  columns: Array<{ name: string; tasks: Array<{ id: string; title: string; status: string }> }>
}

async function statusOf(page: Page, title: string): Promise<string | undefined> {
  const board = await rest<KanbanBoard>(page, '/api/plugins/kanban/board')
  return board.columns.flatMap((column) => column.tasks).find((task) => task.title === title)
    ?.status
}

/** Колонка доски раскрыта. Пустые колонки доска сворачивает сама, и узнать
 *  состояние можно только после того, как доска догрузилась. */
async function expandColumn(page: Page, name: string): Promise<void> {
  const expand = page.getByRole('button', { name: `Expand ${name}` })
  const collapse = page.getByRole('button', { name: `Collapse ${name}` })
  await expect(expand.or(collapse).first()).toBeVisible({ timeout: 30000 })
  if (await expand.isVisible()) await expand.click()
  await expect(collapse).toBeVisible()
}

// D-112: включённый на ходу плагин добавляет строку «Kanban» в боковую панель,
// но доска по ней не открывается, пока окно не перезагрузить. Тест идёт через
// перезагрузку и держит расхождение на виду в чек-листе.
test('49.1.1 доска открылась, карточка переносится между колонками мышью', async () => {
  let page = await ui()
  await openSkillsTab(page, /^(Plugins|Плагины)( \d+)?$/)
  const toggle = page.getByRole('switch', { name: /Kanban/ }).first()
  await expect(toggle).toBeVisible({ timeout: 20000 })
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')

  await page.reload()
  page = await ui()
  await page
    .getByRole('button', { name: /^Kanban$/ })
    .first()
    .click()
  await expect(page.getByRole('heading', { name: 'Kanban', level: 1 })).toBeVisible({
    timeout: 30000
  })
  const gotIt = page.getByRole('button', { name: 'Got it' })
  if (await gotIt.isVisible()) await gotIt.click()

  await expandColumn(page, 'Todo')
  await page.getByRole('button', { name: 'New task in Todo' }).click()
  const title = `e2e доска ${Date.now()}`
  await page.getByPlaceholder('Title').fill(title)
  // Исполнитель — «без исполнителя»: по умолчанию форма ставит `default`, и
  // карточка уходит в работу раньше, чем попадёт в Todo (D-113).
  await page
    .getByRole('combobox')
    .filter({ hasText: /\(default\)$/ })
    .click()
  await page.getByRole('option', { name: /^unassigned \(parked/ }).click()
  await page.getByPlaceholder('Title').press('Enter')
  // Без исполнителя и зависимостей ядро само поднимает карточку из Todo в Ready
  // на такте диспетчера — в работу без исполнителя она не уходит. Ждём Ready:
  // в Blocked ядро пускает только из Ready и Running (`block_task`).
  await expect
    .poll(() => statusOf(page, title), { intervals: [2000], timeout: 90000 })
    .toBe('ready')

  const card = page.getByText(title, { exact: true }).first()
  await expect(card).toBeVisible({ timeout: 20000 })
  await expandColumn(page, 'Blocked')
  await card.dragTo(page.getByRole('button', { name: 'Collapse Blocked' }))
  await expect.poll(() => statusOf(page, title), { timeout: 20000 }).toBe('blocked')
})
