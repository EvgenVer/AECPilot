// Блоки 43 и 49 чек-листа (задача 3F.9) на ЖИВОМ ядре — позиции с ходом модели:
// веб-поиск (43.2.1), доска задач в руках агента (49.2.1), подагенты (49.3.x) и
// откат к точке возврата (49.4.1). Позиции без хода — в `live-43-49-search-kanban`.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import { hideFirstRunSurfaces, mainWindow, openProject, standFixture } from '../lib/app'
import { record } from '../lib/evidence'
import { eventCount, eventsSince, recordChatEvents, turn } from '../lib/turn'

test.describe.configure({ mode: 'serial' })

const stand = standFixture({ mode: 'live', label: 'model-43-49' })

// Три «раздела проекта» для подагентов: у каждого своя метка, которую нельзя
// выдумать, — по ней видно, что результат КАЖДОГО вернулся в ленту.
const SECTIONS = [
  { dir: 'razdel-AR', mark: 'ZAMECHANIE-AR-731' },
  { dir: 'razdel-KR', mark: 'ZAMECHANIE-KR-482' },
  { dir: 'razdel-OV', mark: 'ZAMECHANIE-OV-956' }
]

let projectOpened = false

async function ui(): Promise<Page> {
  const page = await mainWindow(stand.get())
  await hideFirstRunSurfaces(page)
  if (!projectOpened) {
    const root = stand.get().projectDir
    for (const section of SECTIONS) {
      mkdirSync(join(root, section.dir), { recursive: true })
      writeFileSync(join(root, section.dir, 'zamechaniya.txt'), `Единственное замечание раздела: ${section.mark}\n`, 'utf8')
    }
    writeFileSync(join(root, 'versiya.txt'), 'VERSIYA-1\n', 'utf8')
    await openProject(stand.get(), page)
    projectOpened = true
  }
  await recordChatEvents(page)
  return page
}

/** В чат: новый сеанс из боковой панели — с экрана доски или навыков. */
async function toChat(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^(Новый сеанс|New session)/ }).first().click()
  await expect(page.getByRole('textbox', { name: /Message|Сообщение/ })).toBeVisible({ timeout: 30000 })
}

async function rest<T>(page: Page, path: string): Promise<T> {
  return page.evaluate((p) => window.aecpilot.gatewayRest(p), path) as Promise<T>
}

// ───────────────────────────── Блок 43. Веб-поиск ─────────────────────────────

test('43.2.1 агент ищет в интернете, и ответ опирается на найденное', async () => {
  const page = await ui()
  const mark = await eventCount(page)
  const result = await turn(page, 'Какая сейчас погода в Екатеринбурге? Найди в интернете и ответь коротко, назвав источник.', {
    approve: /web_search|web_extract|ddgs|weather|погод/i,
    expectTool: /web_search|web_extract/
  })
  console.log('43.2 ' + result.transcript.slice(0, 1500))
  const calls = (await eventsSince(page, mark)).filter((e) => e.type === 'tool.start')
  expect(JSON.stringify(calls), 'в ленте есть вызов поиска').toMatch(/web_search|web_extract/)
  // Карточка поиска видна человеку, а ответ — не отказ и называет город.
  const last = page.locator('[data-slot="aui_assistant-message-root"]').last()
  await expect(last.locator('[data-slot="tool-block"]').first()).toBeVisible()
  expect(result.text).not.toMatch(/нет доступа к интернету|не могу (искать|выйти)/i)
  expect(result.text).toMatch(/Екатеринбург/i)
  expect(result.text, 'ответ несёт погоду, а не общие слова').toMatch(/°|градус|температур|осадк|облачн|ветер|дожд|снег|ясн/i)
  await record(test.info(), page, { transcript: result.transcript })
})

// ───────────────────────────── Блок 49. Доска задач ───────────────────────────

interface KanbanBoard {
  columns: Array<{ name: string; tasks: Array<{ id: string; title: string; status: string }> }>
}

async function statusOf(page: Page, title: string): Promise<string | undefined> {
  const board = await rest<KanbanBoard>(page, '/api/plugins/kanban/board')
  return board.columns.flatMap((column) => column.tasks).find((task) => task.title === title)?.status
}

// D-112: включённая на ходу доска открывается только после перезагрузки окна.
// D-129: на ядре 0.21.3 `kanban_*` доходят до агента только через
// `platform_toolsets.cli`, а в профиле владельца там свой список — ждёт решения.
test.fixme('49.2.1 агент заводит задачу на доске и передвигает её — видно без перезагрузки', async () => {
  let page = await ui()
  await page.evaluate(() => {
    window.location.hash = '#/skills'
  })
  const plugins = page.getByRole('button', { name: /^(Plugins|Плагины)( \d+)?$/ }).first()
  await expect(plugins).toBeVisible({ timeout: 30000 })
  await plugins.click()
  const toggle = page.getByRole('switch', { name: /Kanban/ }).first()
  await expect(toggle).toBeVisible({ timeout: 20000 })
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await page.reload()
  page = await ui()

  await page.getByRole('button', { name: /^Kanban$/ }).first().click()
  await expect(page.getByRole('heading', { name: 'Kanban', level: 1 })).toBeVisible({ timeout: 30000 })
  const gotIt = page.getByRole('button', { name: 'Got it' })
  if (await gotIt.isVisible()) await gotIt.click()

  const title = `e2e агент ${Date.now()}`
  // Ход из композера на экране доски нельзя — возвращаемся в чат, ходим, и
  // снова открываем доску БЕЗ перезагрузки окна.
  await toChat(page)
  const result = await turn(
    page,
    `Заведи на доске задач (канбан) задачу с заголовком «${title}» без исполнителя — инструментом kanban_create (вызывай его напрямую), assignee не указывай. Затем заблокируй её инструментом kanban_block с причиной «ждём исходные данные». Ответь одним словом «готово».`,
    { expectTool: /kanban_create/ }
  )
  console.log('49.2 ' + result.transcript.slice(0, 1500))
  await expect.poll(() => statusOf(page, title), { timeout: 60000 }).toBe('blocked')

  await page.getByRole('button', { name: /^Kanban$/ }).first().click()
  await expect(page.getByRole('heading', { name: 'Kanban', level: 1 })).toBeVisible({ timeout: 30000 })
  const collapse = page.getByRole('button', { name: 'Collapse Blocked' })
  const expand = page.getByRole('button', { name: 'Expand Blocked' })
  await expect(expand.or(collapse).first()).toBeVisible({ timeout: 30000 })
  if (await expand.isVisible()) await expand.click()
  // Карточка в колонке Blocked — окно узнало о ней само, без перезагрузки.
  await expect(page.getByText(title, { exact: true }).first()).toBeVisible({ timeout: 30000 })
  await record(test.info(), page, { transcript: result.transcript })
})

// ───────────────────────────── Блок 49. Подагенты ─────────────────────────────

let subagentThreadText = ''

test('49.3.1 над композером появляется группа подагентов с их целями', async () => {
  const page = await ui()
  await toChat(page)
  const mark = await eventCount(page)
  const goals: string[] = []
  const question =
    'Проверь три раздела проекта — папки razdel-AR, razdel-KR и razdel-OV — и сведи замечания. ' +
    'Поручи каждый раздел отдельному подагенту через delegate_task (три задачи, пусть идут параллельно); ' +
    'каждый читает zamechaniya.txt своей папки и возвращает метку замечания дословно. ' +
    'В ответе перечисли все три метки.'
  const stack = page.locator('[data-slot="composer-subagents"]')
  // Группа живёт, пока подагенты работают, — снимаем её текст на лету.
  const watch = (async () => {
    const deadline = Date.now() + 240000
    while (Date.now() < deadline && goals.length === 0) {
      if (await stack.isVisible().catch(() => false)) {
        const expand = stack.getByRole('button', { expanded: false }).first()
        if (await expand.isVisible().catch(() => false)) await expand.click().catch(() => undefined)
        const text = await stack.innerText().catch(() => '')
        if (/razdel|раздел/i.test(text)) goals.push(text)
      }
      await page.waitForTimeout(300)
    }
  })()
  const result = await turn(page, question, { expectTool: /delegate_task/, timeoutMs: 300000 })
  await watch
  console.log('49.3 STACK ' + goals.join(' || ').slice(0, 800))
  expect(goals.length, 'группа подагентов с целями была видна над композером').toBeGreaterThan(0)
  expect(goals[0]).toMatch(/razdel-(AR|KR|OV)/i)

  // Подагенты могут закончить позже самого хода — ждём их завершения.
  await expect
    .poll(async () => (await eventsSince(page, mark)).filter((e) => e.type === 'subagent.complete').length, {
      timeout: 240000
    })
    .toBeGreaterThanOrEqual(3)
  subagentThreadText = (await page.locator('[data-slot="aui_assistant-message-root"]').allInnerTexts()).join('\n')
  console.log('49.3 ' + result.transcript.slice(0, 1500).replace(/\n/g, ' ⏎ '))
  const completes = (await eventsSince(page, mark)).filter((e) => e.type === 'subagent.complete')
  console.log('49.3 COMPLETES ' + JSON.stringify(completes).slice(0, 2000))
  await record(test.info(), page, { transcript: result.transcript })
})

test('49.3.2 результат каждого подагента вернулся в ленту', async () => {
  const page = await ui()
  const feed = async () => (await page.locator('[data-slot="aui_assistant-message-root"]').allInnerTexts()).join('\n')
  try {
    await expect
      .poll(async () => {
        const text = await feed()
        return SECTIONS.filter((s) => text.includes(s.mark)).map((s) => s.mark)
      }, { timeout: 180000 })
      .toEqual(SECTIONS.map((s) => s.mark))
  } catch (error) {
    console.log('49.3.2 FEED ' + (await feed()).slice(-2500).replace(/\n/g, ' ⏎ '))
    throw error
  }
  expect(subagentThreadText.length).toBeGreaterThan(0)
})

// ───────────────────────────── Блок 49. Точка возврата ─────────────────────────

test('49.4.1 откат к точке возврата возвращает сохранённое состояние', async () => {
  const page = await ui()
  const file = join(stand.get().projectDir, 'versiya.txt')
  expect(readFileSync(file, 'utf8')).toBe('VERSIYA-1\n')
  // Точку возврата ядро снимает само — перед правкой файла агентом.
  const result = await turn(
    page,
    'Перезапиши файл versiya.txt в корне проекта: его единственной строкой должно стать VERSIYA-2. Инструментом write_file, не через терминал. Ответь одним словом «готово».',
    { expectTool: /write_file|patch/ }
  )
  await expect.poll(() => readFileSync(file, 'utf8'), { timeout: 30000 }).toContain('VERSIYA-2')

  const tab = page.getByRole('tab', { name: /^(Изменения|Changes)/ })
  for (let attempt = 0; attempt < 3 && !(await tab.isVisible()); attempt += 1) {
    await page.getByRole('textbox', { name: /Message|Сообщение/ }).click()
    await page.keyboard.press('Control+g')
    await tab.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined)
  }
  await expect(tab).toBeVisible()
  const list = page.getByRole('list', { name: /^(Снимки|Snapshots)$/ })
  await expect(list).toBeVisible({ timeout: 30000 })
  await list.getByRole('button').first().click()
  await page.getByRole('button', { name: /^(Восстановить всё|Restore everything)$/ }).click()
  const confirm = page.getByRole('alertdialog')
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: /^(Восстановить|Restore)$/ }).click()
  await expect.poll(() => readFileSync(file, 'utf8'), { timeout: 30000 }).toBe('VERSIYA-1\n')
  await record(test.info(), page, { transcript: result.transcript })
})
