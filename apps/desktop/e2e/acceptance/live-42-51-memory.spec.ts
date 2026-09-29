// Блоки 42 и 51 чек-листа (задача 3F.8) на ЖИВОМ ядре: экран памяти (записка,
// автозапись) и список фактов памяти проекта.
//
// ХОД МОДЕЛИ ЗДЕСЬ ОДИН — шаг 1 блока 42: «запомни: резерв мощности на объекте
// 20 %». Факт в память проекта кладёт
// только агент; своей записи в хранилище у
// приложения нет (`runtime/memory-facts.py` умеет читать и удалять, но не
// писать), а свежий проект стенда пуст. Ещё три коротких хода — позиции, где
// агент должен просто ОТВЕТИТЬ (42.2.2, 42.6.2, 42.7.2, задача 3F.9): они
// проверяют, что остановка ядра на время списка не оставляет его лежать.
// 42.6.3 («удалённого факта нет в ответе») — ещё один ход, после удаления факта.
//
// 42.9.1 («ядро на другой машине») здесь нет: на живом ядре её можно проверить
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
  send,
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

function memoryDialog(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Память агента', exact: true })
}

/** Окно памяти — значок «Память» в строке состояния. */
async function openMemory(page: Page): Promise<Locator> {
  const dialog = memoryDialog(page)
  if (!(await dialog.isVisible())) {
    await page
      .getByRole('contentinfo')
      .getByRole('button', { name: /Память/ })
      .first()
      .click()
  }
  await expect(dialog).toBeVisible({ timeout: 15000 })
  return dialog
}

async function closeMemory(page: Page): Promise<void> {
  const dialog = memoryDialog(page)
  await dialog
    .getByRole('button', { name: /^Закрыть$/ })
    .last()
    .click()
  await expect(dialog).toBeHidden({ timeout: 120000 })
}

const SHOW = 'Показать список (агент остановится)'

/** Агент отвечает в чате: окно памяти закрыто, короткий ход, ответ по существу. */
async function agentAnswers(page: Page): Promise<void> {
  if (await memoryDialog(page).isVisible()) await closeMemory(page)
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
const HIDE = 'Закрыть список и поднять агента'

/** Записывать тексты, которые окно показывало между проверками: «Останавливаю…»
 *  и «Поднимаю агента…» живут доли секунды, опросом их не поймать. */
async function recordTexts(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __seen?: string[]; __seenObserver?: MutationObserver }
    w.__seen = []
    w.__seenObserver?.disconnect()
    const observer = new MutationObserver(() => {
      const dialog = document.querySelector('[role="dialog"]')
      if (dialog) w.__seen?.push((dialog as HTMLElement).innerText)
    })
    observer.observe(document.body, { characterData: true, childList: true, subtree: true })
    w.__seenObserver = observer
  })
}

async function seenTexts(page: Page): Promise<string> {
  return page.evaluate(() => {
    const w = window as unknown as { __seen?: string[]; __seenObserver?: MutationObserver }
    w.__seenObserver?.disconnect()
    return (w.__seen ?? []).join('\n')
  })
}

/** Строки списка фактов. */
function factRows(dialog: Locator): Locator {
  return dialog
    .locator('li')
    .filter({ has: dialog.page().getByRole('button', { name: 'Удалить' }) })
}

async function openFacts(page: Page): Promise<Locator> {
  const dialog = await openMemory(page)
  await dialog.getByRole('button', { name: SHOW }).click()
  await expect(dialog.getByRole('button', { name: HIDE })).toBeVisible({ timeout: 120000 })
  return dialog
}

async function hideFacts(page: Page): Promise<void> {
  const dialog = memoryDialog(page)
  await dialog.getByRole('button', { name: HIDE }).click()
  await expect(dialog.getByRole('button', { name: SHOW })).toBeVisible({ timeout: 180000 })
}

// ───────────────────────────── Блок 51. Записка и автозапись ──────────────────

test('51.1.1 экран памяти открылся, текст записки показан', async () => {
  const page = await ui()
  const dialog = await openMemory(page)
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
  // делает их инструмент памяти.
  const agentNote = join(String(stand.get().profileDir), 'memories', 'MEMORY.md')
  writeFileSync(agentNote, 'Объект e2e: резерв мощности обсуждается.\n', 'utf8')

  const dialog = await openMemory(page)
  await expect(dialog.getByRole('textbox', { name: 'Записка агента' })).toHaveValue(
    /Объект e2e: резерв мощности обсуждается/
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
  const dialog = await openMemory(page)
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
// позиции, которым нужен его факт (42.3.2, 42.4.1, 42.5.1, 42.6.3), включены.
test('шаг 1 блока 42: агент запомнил факт проекта', async () => {
  const page = await ui()
  await send(page, 'Запомни: резерв мощности на объекте 20 %. Ответь одним словом.')
  const stop = page.getByRole('button', { name: /^(Стоп|Stop)$/ })
  // Во время хода «Стоп» два: в поле ввода и в стеке статусов над ним.
  await expect(stop.first()).toBeVisible({ timeout: 60000 })
  await expect(stop).toHaveCount(0, { timeout: 240000 })
  // Автозапись идёт после хода — даём ей закончить до остановки ядра.
  await page.waitForTimeout(15000)
})

test('42.2.1 сначала сказано про остановку и обрыв разговора, потом кнопка', async () => {
  const page = await ui()
  const dialog = await openMemory(page)
  const text = await dialog.innerText()
  const why = text.indexOf('читается только при остановленном агенте')
  const button = text.indexOf(SHOW)
  expect(why, 'объяснение есть').toBeGreaterThan(-1)
  expect(text).toContain('оборвётся')
  expect(why, 'объяснение ДО кнопки').toBeLessThan(button)
})

test('42.2.2 пока список не открыт, агент работает — отвечает в чате', async () => {
  const page = await ui()
  await agentAnswers(page)
  await openMemory(page)
})

test('42.3.1 видно остановку и чтение, затем появляется список', async () => {
  const page = await ui()
  const dialog = memoryDialog(page)
  await recordTexts(page)
  await dialog.getByRole('button', { name: SHOW }).click()
  await expect(dialog.getByRole('button', { name: HIDE })).toBeVisible({ timeout: 120000 })
  expect(await seenTexts(page)).toContain('Останавливаю агента и читаю хранилище')
  await expect(dialog).toContainText(/Фактов в этом проекте: \d+/)
})

test('42.3.2 в списке факт из шага 1 — с датой и каналом', async () => {
  const page = await ui()
  const row = factRows(memoryDialog(page))
    .filter({ hasText: /20\s*%/ })
    .first()
  await expect(row, 'факт про резерв 20 %').toBeVisible()
  await expect(row).toContainText(/\d{4}-\d{2}-\d{2}/)
  await expect(row).toContainText(/из \S+/)
})

test('42.3.3 сказано, что агент остановлен, пока список открыт', async () => {
  const page = await ui()
  await expect(memoryDialog(page)).toContainText(
    'Пока список открыт, агент остановлен. Он поднимется, когда вы закроете список.'
  )
})

test('42.3.4 счётчик называет число фактов проекта', async () => {
  const page = await ui()
  const dialog = memoryDialog(page)
  const count = await factRows(dialog).count()
  await expect(dialog).toContainText(`Фактов в этом проекте: ${count}`)
})

test('42.4.1 поиск оставляет подходящие строки; пустой возвращает весь список', async () => {
  const page = await ui()
  const dialog = memoryDialog(page)
  const all = await factRows(dialog).count()
  const search = dialog.getByRole('searchbox', { name: 'Поиск по фактам' })
  await search.fill('резерв')
  const found = factRows(dialog)
  await expect(found.first()).toBeVisible()
  for (const text of await found.allInnerTexts()) expect(text.toLowerCase()).toContain('резерв')
  await search.fill('')
  await expect(factRows(dialog)).toHaveCount(all)
})

test('42.4.2 по бессмысленному запросу — «Ничего не нашлось»', async () => {
  const page = await ui()
  const dialog = memoryDialog(page)
  const search = dialog.getByRole('searchbox', { name: 'Поиск по фактам' })
  await search.fill('щзхъ-нет-такого')
  await expect(dialog).toContainText('Ничего не нашлось.')
  await expect(factRows(dialog)).toHaveCount(0)
  await search.fill('')
})

test('42.5.1 «Удалить» — строка исчезла', async () => {
  const page = await ui()
  const dialog = memoryDialog(page)
  const before = await factRows(dialog).count()
  const row = factRows(dialog)
    .filter({ hasText: /20\s*%/ })
    .first()
  const text = await row.locator('p').first().innerText()
  await row.getByRole('button', { name: 'Удалить' }).click()
  await expect(factRows(dialog)).toHaveCount(before - 1, { timeout: 30000 })
  await expect(dialog.getByText(text, { exact: true })).toHaveCount(0)
})

test('42.6.1 «Закрыть список» — агент поднимается, раздел снова с кнопкой', async () => {
  const page = await ui()
  await recordTexts(page)
  await hideFacts(page)
  expect(await seenTexts(page)).toContain('Поднимаю агента…')
  await expect(memoryDialog(page)).toContainText('читается только при остановленном агенте')
})

test('42.6.2 после «Закрыть список» агент снова отвечает в чате', async () => {
  await agentAnswers(await ui())
})

// D-161 (ждёт решения владельца). Удалённый факт возвращается: после «Закрыть
// список» разговор с фразой «Запомни: резерв…» продолжается, и их фоновый разбор
// после хода (`background_review`) видит её в истории, не находит факта в памяти
// и записывает заново — своими словами, по-английски. Замер 29.09.2026, 4 из 4:
// перед вопросом в списке уже новый факт «User established a power reserve of
// 20 percent…», `mem0_search` его находит. Проверка оставлена целиком.
test.fixme('42.6.3 удалённого факта в ответе агента нет', async () => {
  const page = await ui()
  // В НОВОМ сеансе: после «Закрыть список» ядро поднимает прежний разговор с его
  // историей (замер 29.09.2026), а там стоит сама фраза «Запомни: резерв…» —
  // вопрос в том же чате проверял бы историю, а не память.
  await page.getByRole('button', { name: /^Новый сеанс/ }).first().click()
  await expect(page.getByText('Запомни: резерв мощности')).toHaveCount(0, { timeout: 15000 })
  const result = await turn(
    page,
    'Что ты помнишь про этот объект? Ответь коротко, одной-двумя фразами.',
    { declineForeign: true }
  )
  console.log('42.6.3 ' + result.transcript)
  expect(result.status, result.transcript).toBe('complete')
  expect(result.text, 'удалённый факт про резерв 20 % не назван').not.toMatch(/20\s*%|резерв/i)
  await record(test.info(), page, { transcript: result.transcript })
})

test('42.7.1 закрытие окна при открытом списке сначала поднимает агента', async () => {
  const page = await ui()
  await openFacts(page)
  await recordTexts(page)
  await closeMemory(page)
  expect(await seenTexts(page)).toContain('Поднимаю агента…')
})

test('42.7.2 после закрытия окна агент работает — отвечает в чате', async () => {
  await agentAnswers(await ui())
})

// Перезапуск стоит после блока 42: он открывает новые сессии ядра, а шаг 1
// блока 42 пусть идёт в тех, что открылись вместе с проектом (D-111). И перед
// индексацией (42.8.1) — выход при идущей индексации спрашивает подтверждение
// (3E.11).
const USER_EDIT = 'Предпочитаю краткие ответы (правка e2e).'

test('51.2.1 правка записки руками пережила перезапуск', async () => {
  let page = await ui()
  let dialog = await openMemory(page)
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
  dialog = await openMemory(page)
  await expect(dialog.getByRole('textbox', { name: 'Записка о вас' })).toHaveValue(
    new RegExp(USER_EDIT.replace(/[()]/g, '\\$&'))
  )
  await closeMemory(page)
})

test('42.8.1 во время индексации — отказ словами, индексация не прервана', async () => {
  const page = await ui()
  const folder = mkdtempSync(join(tmpdir(), 'aecpilot-index-'))
  // Индексация должна идти ДОЛЬШЕ, чем нажатие кнопки. Формат — `.csv`:
  // индексатор берёт только pdf/docx/xlsx/csv (`aec_rag.parse.SUPPORTED_SUFFIXES`),
  // записки `.md` он пропускал, и «идущая» индексация длилась доли секунды.
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
  // Окно открыто заранее: нажатие идёт сразу, как индексация пошла.
  const dialog = await openMemory(page)
  await page.evaluate(() => window.aecpilot.startIngest(true))
  await expect
    .poll(
      async () =>
        ((await page.evaluate(() => window.aecpilot.getIngestState())) as { running?: boolean })
          .running,
      { intervals: [100], timeout: 60000 }
    )
    .toBe(true)
  await dialog.getByRole('button', { name: SHOW }).click()
  await expect(dialog).toContainText('Идёт индексация — остановить ядро сейчас нельзя', {
    timeout: 30000
  })
  const state = (await page.evaluate(() => window.aecpilot.getIngestState())) as {
    running?: boolean
    error?: string
  }
  expect(state.running, 'индексация продолжается').toBe(true)
  expect(state.error ?? '').toBe('')
  await dialog.getByRole('button', { name: HIDE }).click()
  await closeMemory(page)
})
