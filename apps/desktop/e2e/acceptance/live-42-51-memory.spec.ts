// Блоки 42 и 51 чек-листа (задача 3F.8) на ЖИВОМ ядре: экран памяти (записка,
// автозапись) и список фактов памяти проекта.
//
// Факт в память проекта кладёт только агент — своей записи в хранилище у
// приложения нет (команда `/aec-memory-facts` читает и удаляет, но не пишет), а
// свежий проект стенда пуст. Ходы модели: шаг 1 блока 42 («запомни: резерв…»),
// 42.2.3 (агент отвечает, пока страница открыта), 42.5.1 (удалённого факта нет в
// ответе) и 42.6.1 («запомни: марка бетона…»).
//
// С задачи 3H.21 список читается командой живого ядра, без его остановки.
//
// 42.8.1 («ядро на другой машине») здесь нет: на живом ядре её можно проверить
// только настоящим подключением к ядру на другой машине (блок 35).

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test, type Locator, type Page } from '@playwright/test'

import {
  hideFirstRunSurfaces,
  mainWindow,
  openProject,
  reopenRecentProject,
  standFixture
} from '../lib/app'
import { record } from '../lib/evidence'
import { turn } from '../lib/turn'

test.describe.configure({ mode: 'serial' })

const stand = standFixture({ mode: 'live', label: 'live-42-51' })

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

/** Страница «Память агента» (задача 3H.8: окно стало страницей в основной
 *  области; факты — вкладка «Что запомнил агент», записки — «Записки»). */
function memoryPage(page: Page): Locator {
  return page.getByRole('region', { name: 'Память агента', exact: true })
}

/** Страница памяти — значок «Память» в строке состояния; `tab` — вкладка. */
async function openMemory(page: Page, tab: 'facts' | 'notes' = 'facts'): Promise<Locator> {
  const memory = memoryPage(page)
  if (!(await memory.isVisible())) {
    await page
      .getByRole('contentinfo')
      .getByRole('button', { name: /Память/ })
      .first()
      .click()
  }
  await expect(memory).toBeVisible({ timeout: 15000 })
  const tabButton = memory
    .getByRole('button', { name: tab === 'facts' ? 'Что запомнил агент' : 'Записки' })
    .first()
  if ((await tabButton.getAttribute('data-active')) !== 'true') {
    await dismissToasts(page)
    await tabButton.click()
  }
  return memory
}

/** Уведомления ядра («⏳ Retrying…» провайдера модели) висят над вкладками
 *  страницы и перехватывают нажатие — их закрывают так же, как человек. */
async function dismissToasts(page: Page): Promise<void> {
  const clearAll = page.getByRole('button', { name: 'Очистить всё' })
  if (await clearAll.isVisible()) await clearAll.click()
  const close = page.getByRole('button', { name: 'Закрыть уведомление' })
  while ((await close.count()) > 0 && (await close.first().isVisible())) {
    await close.first().click()
  }
}

/** Уйти со страницы в чат. Открытый список фактов страница при уходе закрывает
 *  сама и поднимает агента (42.7.1). */
async function closeMemory(page: Page): Promise<void> {
  await page.evaluate(() => {
    location.hash = '#/'
  })
  await expect(memoryPage(page)).toBeHidden({ timeout: 15000 })
}

/** Агент отвечает в чате: страница памяти закрыта, короткий ход, ответ по существу. */
async function agentAnswers(page: Page): Promise<void> {
  if (await memoryPage(page).isVisible()) await closeMemory(page)
  // Вопрос без счёта: арифметику модель норовит проверить `execute_code`, и
  // ход упирается в подтверждение команды. Чужую команду тест отклоняет.
  const result = await turn(
    page,
    'Какого цвета ясное небо днём? Ответь одним словом, без инструментов.',
    {
      declineForeign: true
    }
  )
  expect(result.status, result.transcript).toBe('complete')
  expect(result.text, result.transcript).toMatch(/голуб|син/i)
  await record(test.info(), page, { transcript: result.transcript })
}
/** Строки списка фактов. */
function factRows(dialog: Locator): Locator {
  return dialog
    .locator('li')
    .filter({ has: dialog.page().getByRole('button', { name: 'Удалить' }) })
}

/** Страница памяти со списком фактов — список читается сам при входе. */
async function openFacts(page: Page): Promise<Locator> {
  const dialog = await openMemory(page)
  await expect(dialog).toContainText(/Фактов в этом проекте: \d+/, { timeout: 60000 })
  return dialog
}

/** Строка «Память» боковой панели. Строки живут на вкладке «Сеансы» левой колонки. */
async function memoryNav(page: Page): Promise<Locator> {
  await page.getByRole('tab', { name: 'Сеансы' }).click()
  return page
    .locator('[data-tour="sessions-sidebar"]')
    .getByRole('button', { name: /^Память/ })
    .first()
}

async function navCount(page: Page): Promise<number> {
  const text = (await (await memoryNav(page)).innerText()).trim()
  const match = /Память · (\d+)/.exec(text)
  return match ? Number(match[1]) : -1
}

// ───────────────────────────── Блок 51. Записка и автозапись ──────────────────

test('51.1.1 экран памяти открылся, текст записки показан', async () => {
  const page = await ui()
  const dialog = await openMemory(page, 'notes')
  const user = dialog.getByRole('textbox', { name: 'Записка о вас' })
  await expect(user).toBeVisible()
  const onDisk = readFileSync(join(String(stand.get().profileDir), 'memories', 'USER.md'), 'utf8')
  expect(onDisk.trim().length, 'в записке профиля есть текст').toBeGreaterThan(0)
  expect(await user.inputValue()).toContain(onDisk.trim().split('\n')[0].trim())
  await closeMemory(page)
})

test('51.1.2 записка читается при открытии окна — правка агента видна сразу', async () => {
  const page = await ui()
  // Правка «агентом» — запись в файл записки мимо окна, так же, как это
  // делает их инструмент памяти. Текст НЕ про резерв мощности: записка уходит в
  // промпт каждого хода, и 42.5.1 («удалённого факта нет в ответе») получала его
  // отсюда, а не из памяти проекта (замер 30.09.2026).
  const agentNote = join(String(stand.get().profileDir), 'memories', 'MEMORY.md')
  writeFileSync(agentNote, 'Объект e2e: марка бетона обсуждается.\n', 'utf8')

  const dialog = await openMemory(page, 'notes')
  await expect(dialog.getByRole('textbox', { name: 'Записка агента' })).toHaveValue(
    /Объект e2e: марка бетона обсуждается/
  )
  await closeMemory(page)
})

function autowriteSwitch(dialog: Locator): Locator {
  return dialog.getByRole('checkbox', { name: 'Разрешить агенту пополнять память самому' })
}

/** Оба места, которые трогает переключатель: запись в конце хода (наш плагин
 *  читает `aec-memory.json`) и фоновый разбор записок ядром (`background_review`). */
function autowriteOnDisk(): { endOfTurn: boolean; backgroundReview: boolean } {
  const home = String(stand.get().profileDir)
  const flag = JSON.parse(readFileSync(join(home, 'aec-memory.json'), 'utf8')) as {
    autowrite: boolean
  }
  const config = readFileSync(join(home, 'config.yaml'), 'utf8')
  const section = /^background_review:\n((?:[ \t]+.*\n?)*)/m.exec(config)?.[1] ?? ''
  return {
    endOfTurn: flag.autowrite,
    backgroundReview: !/^\s+enabled:\s*false\b/m.test(section)
  }
}

test('51.3.1 один переключатель гасит оба пути автозаписи', async () => {
  const page = await ui()
  const dialog = await openMemory(page, 'notes')
  const toggle = autowriteSwitch(dialog)
  await expect(toggle).toBeChecked()

  await toggle.click()
  await expect(toggle).not.toBeChecked()
  await expect.poll(autowriteOnDisk).toEqual({ endOfTurn: false, backgroundReview: false })

  // Вернуть: шаг 1 блока 42 ждёт включённой автозаписи.
  await toggle.click()
  await expect(toggle).toBeChecked()
  await expect.poll(autowriteOnDisk).toEqual({ endOfTurn: true, backgroundReview: true })
  await closeMemory(page)
})

// ───────────────────────────── Блок 42. Факты памяти проекта ──────────────────

// D-111 (замер 23.09.2026): ядро строит ДВУХ агентов разом, и хранилище Mem0
// доставалось одному из них наугад — `mem0_add` отвечал «already accessed by
// another instance of Qdrant client». С задачи 3F.D2 все агенты процесса ядра
// берут ОДИН общий клиент Mem0 (наш плагин, `mem0_shared.py`), поэтому шаг 1 и
// позиции, которым нужен его факт (42.2.1, 42.3.1, 42.4.1, 42.5.1), включены.
test('шаг 1 блока 42: агент запомнил факт проекта', async () => {
  const page = await ui()
  const result = await turn(
    page,
    'Запомни: резерв мощности на объекте 20 %. Ответь одним словом.',
    {
      declineForeign: true
    }
  )
  console.log('шаг 1 ' + result.transcript)
  expect(result.status, result.transcript).toBe('complete')
  // Автозапись идёт после хода — даём ей закончить до чтения списка.
  await page.waitForTimeout(15000)
})

test('42.2.1 список показан сразу, без остановки агента; в нём факт из шага 1 с датой и каналом', async () => {
  const page = await ui()
  const dialog = await openFacts(page)
  await expect(dialog.getByRole('button', { name: /агент остановится/ })).toHaveCount(0)
  await expect(dialog).not.toContainText('остановлен')
  const row = factRows(dialog)
    .filter({ hasText: /20\s*%/ })
    .first()
  await expect(row, 'факт про резерв 20 %').toBeVisible()
  await expect(row).toContainText(/\d{4}-\d{2}-\d{2}/)
  await expect(row).toContainText(/из \S+/)
})

test('42.2.2 счётчик называет число фактов, строка «Память» — то же число', async () => {
  const page = await ui()
  const dialog = memoryPage(page)
  const count = await factRows(dialog).count()
  console.log('42.2 ФАКТЫ ' + JSON.stringify(await factRows(dialog).allInnerTexts()))
  await expect(dialog).toContainText(`Фактов в этом проекте: ${count}`)
  await expect.poll(() => navCount(page)).toBe(count)
})

test('42.2.3 пока страница открыта, агент работает — отвечает в чате', async () => {
  await agentAnswers(await ui())
  await openFacts(await ui())
})

test('42.3.1 поиск оставляет подходящие строки; пустой возвращает весь список', async () => {
  const page = await ui()
  const dialog = memoryPage(page)
  const all = await factRows(dialog).count()
  const search = dialog.getByRole('searchbox', { name: 'Поиск по фактам' })
  await search.fill('резерв')
  const found = factRows(dialog)
  await expect(found.first()).toBeVisible()
  for (const text of await found.allInnerTexts()) expect(text.toLowerCase()).toContain('резерв')
  await search.fill('')
  await expect(factRows(dialog)).toHaveCount(all)
})

test('42.3.2 по бессмысленному запросу — «Ничего не нашлось»', async () => {
  const page = await ui()
  const dialog = memoryPage(page)
  const search = dialog.getByRole('searchbox', { name: 'Поиск по фактам' })
  await search.fill('щзхъ-нет-такого')
  await expect(dialog).toContainText('Ничего не нашлось.')
  await expect(factRows(dialog)).toHaveCount(0)
  await search.fill('')
})

test('42.4.1 «Удалить» — строка исчезла, число на строке «Память» уменьшилось', async () => {
  const page = await ui()
  const dialog = memoryPage(page)
  const before = await factRows(dialog).count()
  const row = factRows(dialog)
    .filter({ hasText: /20\s*%/ })
    .first()
  const text = await row.locator('p').first().innerText()
  await row.getByRole('button', { name: 'Удалить' }).click()
  await expect(factRows(dialog)).toHaveCount(before - 1, { timeout: 30000 })
  await expect(dialog.getByText(text, { exact: true })).toHaveCount(0)
  await expect.poll(() => navCount(page)).toBe(before - 1)
})

// D-161 (решение владельца 2026-09-30, задача 3G.29). Если продолжить разговор с
// фразой «Запомни: резерв…», их фоновый разбор после хода (`background_review`)
// видит её в истории, не находит факта в памяти и записывает заново (замер
// 29.09.2026, 4 из 4). Поэтому после удаления факта уход со страницы открывает
// НОВЫЙ сеанс — сам, без кнопки; прежняя переписка остаётся в истории.
test('42.5.1 после удаления — новый сеанс; удалённого факта нет ни в ответе, ни в списке', async () => {
  const page = await ui()
  await closeMemory(page)
  await expect(
    page.getByText('Запомни: резерв мощности'),
    'после удаления факта открыт новый сеанс'
  ).toHaveCount(0, { timeout: 30000 })
  const result = await turn(
    page,
    'Что ты помнишь про этот объект? Ответь коротко, одной-двумя фразами.',
    { declineForeign: true }
  )
  console.log('42.5.1 ' + result.transcript)
  expect(result.status, result.transcript).toBe('complete')
  expect(result.text, 'удалённый факт про резерв 20 % не назван').not.toMatch(/20\s*%|резерв/i)

  const dialog = await openFacts(page)
  await expect(
    factRows(dialog).filter({ hasText: /20\s*(%|percent)|резерв|power reserve/i }),
    'фоновый разбор не записал факт заново'
  ).toHaveCount(0)
  await closeMemory(page)
  await record(test.info(), page, { transcript: result.transcript })
})

test('42.5.2 прежний разговор с фразой из шага 1 находится в истории и открывается', async () => {
  const page = await ui()
  // Прежний разговор — в истории: поиск сеансов ядра ищет по тексту сообщений.
  await page.getByPlaceholder('Поиск сеансов…').fill('резерв')
  const old = page
    .locator('button[data-slot="row-button"]')
    .filter({ hasText: /резерв/i })
    .first()
  await expect(old, 'прежний разговор находится в истории').toBeVisible({ timeout: 30000 })
  // Щелчок событием, а не мышью: строки сортируемые, и слой перетаскивания
  // перехватывает нажатие (см. donor-shell-smoke, позиция 4).
  await old.dispatchEvent('click', { bubbles: true })
  await expect(page.getByText('Запомни: резерв мощности').first()).toBeVisible({ timeout: 30000 })
  await page.getByPlaceholder('Поиск сеансов…').fill('')
  await record(test.info(), page)
  // Дальше — не в прежнем разговоре: ход в нём вернул бы факт (D-161).
  await page
    .getByRole('button', { name: /^Новый сеанс/ })
    .first()
    .click()
  await expect(page.getByText('Запомни: резерв мощности')).toHaveCount(0, { timeout: 15000 })
})

test('42.6.1 новый факт — число на строке «Память» выросло, страницу не открывали', async () => {
  const page = await ui()
  const before = await navCount(page)
  const result = await turn(page, 'Запомни: марка бетона фундаментов B25. Ответь одним словом.', {
    declineForeign: true
  })
  expect(result.status, result.transcript).toBe('complete')
  // Явный `mem0_add` попадает в счёт сразу после хода; автозапись хода — позже,
  // поэтому опрос ждёт, а не проверяет один раз.
  await expect.poll(() => navCount(page), { timeout: 90000 }).toBeGreaterThan(Math.max(before, 0))
  await record(test.info(), page, { transcript: result.transcript })
})

// Перезапуск стоит после блока 42: он открывает новые сессии ядра, а шаг 1
// блока 42 пусть идёт в тех, что открылись вместе с проектом (D-111). И перед
// индексацией (42.8.1) — выход при идущей индексации спрашивает подтверждение
// (3E.11).
const USER_EDIT = 'Предпочитаю краткие ответы (правка e2e).'

test('51.2.1 правка записки руками пережила перезапуск', async () => {
  let page = await ui()
  let dialog = await openMemory(page, 'notes')
  const user = dialog.getByRole('textbox', { name: 'Записка о вас' })
  await user.fill(`${await user.inputValue()}\n${USER_EDIT}`)
  // У каждой записки своя кнопка «Сохранить» — первая относится к «о вас».
  await dialog
    .getByRole('button', { name: /^Сохранить$/ })
    .first()
    .click()
  await expect
    .poll(() => readFileSync(join(String(stand.get().profileDir), 'memories', 'USER.md'), 'utf8'))
    .toContain(USER_EDIT)
  await closeMemory(page)

  await stand.get().relaunch()
  page = await mainWindow(stand.get())
  await hideFirstRunSurfaces(page)
  // С 3G.20 (D-89) последний проект открывается сам.
  await reopenRecentProject(page)
  dialog = await openMemory(page, 'notes')
  await expect(dialog.getByRole('textbox', { name: 'Записка о вас' })).toHaveValue(
    new RegExp(USER_EDIT.replace(/[()]/g, '\\$&'))
  )
  await closeMemory(page)
})

test('42.7.1 во время индексации список показан, индексация не прервана', async () => {
  const page = await ui()
  const folder = mkdtempSync(join(tmpdir(), 'aecpilot-index-'))
  // Индексация должна идти ДОЛЬШЕ, чем чтение списка. Формат — `.csv`:
  // индексатор берёт только pdf/docx/xlsx/csv (`aec_rag.parse.SUPPORTED_SUFFIXES`).
  for (let i = 1; i <= 10; i += 1) {
    const rows = ['Этаж;Щит;Нагрузка, кВт;Резерв, %']
    for (let r = 1; r <= 100; r += 1)
      rows.push(`${r};ЩР-${i}.${r};${(r * 1.5).toFixed(1)};${i * 10}`)
    writeFileSync(join(folder, `нагрузки-${i}.csv`), rows.join('\n') + '\n', 'utf8')
  }
  // Папку источника окно не называет, а выбирает в системном диалоге (D-47):
  // диалог подменяется, выбор идёт тем же путём, что у человека.
  await stand.get().app.evaluate(({ dialog }, dir) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [dir] })) as never
  }, folder)
  expect(await page.evaluate(() => window.aecpilot.pickProjectDirectory())).toBe(folder)
  const added = await page.evaluate((dir) => window.aecpilot.addSource(dir, true), folder)
  expect(added, JSON.stringify(added)).toMatchObject({ ok: true })
  await page.evaluate(() => window.aecpilot.startIngest(true))
  await expect
    .poll(
      async () =>
        ((await page.evaluate(() => window.aecpilot.getIngestState())) as { running?: boolean })
          .running,
      { intervals: [100], timeout: 60000 }
    )
    .toBe(true)
  await openFacts(page)
  const state = (await page.evaluate(() => window.aecpilot.getIngestState())) as {
    error?: string | null
  }
  expect(state.error ?? '', 'индексация не прервана').toBe('')
  await closeMemory(page)
})
