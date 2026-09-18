// Блоки 16–21 чек-листа (задача 3F.4): просмотрщик — вкладки, поиск и масштаб
// PDF; DOCX и TXT; таблицы XLSX/CSV; ссылка «на место»; правка .md; ссылки
// между страницами вики. 56 позиций. Всё — наши поверхности (`aec/viewers`,
// `aec/citations`), и ответ агента здесь нужен только как носитель цитаты:
// мок отвечает текстом, который ему прислали (`say: …`), а цитата в нём —
// настоящая, с id источника, который приложение выдало при подключении папки.
//
// Имя теста начинается с номера позиции — по нему сходятся чек-лист, отчёт
// и счётчик покрытия. Файл идёт последовательно: документы, открытые одним
// тестом, нужны следующему.

import { expect, test, type Locator, type Page } from '@playwright/test'
import { copyFileSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import { cpSync } from 'node:fs'
import { join } from 'node:path'
import {
  appWindows,
  assertRendererAlive,
  hideFirstRunSurfaces,
  mainWindow,
  openProject,
  reviveStrandedSession,
  send,
  standFixture
} from '../lib/app'
import { addPdf, makeSampleVault, SAMPLE, type SampleVault } from '../lib/vault'

test.describe.configure({ mode: 'serial' })

const stand = standFixture({ mode: 'mock', label: 'blocks-16-21' })

let sample: SampleVault
/** Id источника `source-a` — его выдаёт приложение при подключении. */
let sourceId = ''
const PDF_COPY = 'отчёт-копия.pdf'
const BROKEN_PDF = 'битый.pdf'

test.beforeAll(async () => {
  sample = await makeSampleVault()
  cpSync(sample.vault, stand.get().projectDir, { recursive: true })
  // PDF печатает само приложение — окно к этому моменту уже поднято.
  const pdf = await addPdf(stand.get().app, sample.sourceA)
  copyFileSync(pdf, join(sample.sourceA, PDF_COPY))
  // Битый PDF — В VAULT, как велит чек-лист (блок 16, шаг 10).
  copyFileSync(
    join(sample.sourceA, SAMPLE.brokenDir, BROKEN_PDF),
    join(stand.get().projectDir, BROKEN_PDF)
  )
})

/** Главное окно с открытым проектом, вкладкой «Vault» слева и панелью
 *  просмотрщика справа. Проект открывается один раз, подготовкой. */
async function ui(): Promise<Page> {
  const page = await mainWindow(stand.get())
  await hideFirstRunSurfaces(page)
  // После перезапуска приложение проект не помнит (D-89) и показывает гейт;
  // открываем его заново тем же путём, что человек, — через недавние.
  if (!(await page.evaluate(() => window.aecpilot.getCurrentProject()))) {
    const result = await page.evaluate(
      (dir) => window.aecpilot.openProject(dir),
      stand.get().projectDir
    )
    expect(result, `openProject: ${JSON.stringify(result)}`).toMatchObject({ ok: true })
    // После перезапуска окно возобновляет прошлый сеанс и иногда сдаётся
    // («Не удалось загрузить этот сеанс») — жмём «Повторить», как человек.
    await reviveStrandedSession(page)
  }
  const vaultTab = page.getByRole('tab', { name: /Vault/ })
  await expect(vaultTab).toBeVisible({ timeout: 30000 })
  if ((await vaultTab.getAttribute('aria-selected')) !== 'true') await vaultTab.click()
  const showRight = page.getByRole('button', { name: /Показать правую панель|Show right sidebar/ })
  if ((await showRight.count()) > 0) await showRight.click()
  return page
}

/** Строка дерева (vault или источника) по `title` — пути узла. */
/** Значение атрибута в CSS-селекторе: в `title` источника стоит путь Windows с
 *  обратными косыми, и без экранирования селектор его не находит. */
function attr(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function row(page: Page, title: string): Locator {
  return page.locator('div.group').filter({ has: page.locator(`[title=${attr(title)}]`) })
}

/** Открыть файл кликом по строке дерева. */
async function openFromTree(page: Page, title: string): Promise<void> {
  const target = row(page, title)
  await expect(target).toBeVisible({ timeout: 30000 })
  await target.locator('button').first().click()
}

/** Развернуть источник `source-a`, если свёрнут. */
async function expandSourceA(page: Page): Promise<void> {
  if ((await row(page, SAMPLE.docx).count()) === 0) {
    await row(page, sample.sourceA).locator('button').first().click()
    await expect(row(page, SAMPLE.docx)).toBeVisible({ timeout: 30000 })
  }
}

/** Цитата в форме скила `aec-qa`: `[src: <id>/<путь>#<место>](#cite)`. */
function cite(rel: string, locator?: string): string {
  return `[src: ${sourceId}/${rel}${locator ? `#${locator}` : ''}](#cite)`
}

/** Ответ агента с цитатой: мок повторяет присланное. Возвращает фишку цитаты —
 *  кнопку, чей `title` и есть машинная запись ссылки. */
async function answerWith(page: Page, rel: string, locator?: string): Promise<Locator> {
  const raw = cite(rel, locator)
  await send(page, `say: Смотрите здесь: ${raw}.`)
  const chip = page.locator(`button[title="${raw.slice(0, raw.indexOf('](#cite)'))}]"]`).last()
  await expect(chip).toBeVisible({ timeout: 60000 })
  return chip
}

/** Кнопка вкладки просмотрщика по имени файла: она стоит перед своим крестиком. */
function viewerTab(page: Page, name: string): Locator {
  return page
    .getByRole('button', { name: `Закрыть ${name}` })
    .locator('xpath=preceding-sibling::button')
}

/** Счётчик страниц PDF — сосед кнопки «Предыдущая страница». Не по тексту
 *  на всю страницу: в статус-баре стоит такой же «0 / 0» (счётчик контекста). */
function pageCounter(page: Page): Locator {
  return page
    .getByRole('button', { name: /Предыдущая страница|Previous page/ })
    .locator('xpath=following-sibling::span[1]')
}

function searchBox(page: Page): Locator {
  return page.getByRole('searchbox', { name: /Поиск по документу|Search the document/ })
}

/** Прокручиваемый контейнер вокруг холста PDF. */
function pdfScroller(page: Page): Locator {
  return page.locator('canvas').locator('xpath=ancestor::div[contains(@class,"overflow-auto")][1]')
}

test('подготовка: проект открыт, источник подключён', async () => {
  const page = await mainWindow(stand.get())
  await hideFirstRunSurfaces(page)
  await openProject(stand.get(), page)
  const opened = await ui()
  await stand.get().app.evaluate(({ dialog }, target) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [target] })) as never
  }, sample.sourceA)
  await opened.getByRole('button', { name: /Connect a folder|Подключить папку/ }).click()
  await expect(row(opened, sample.sourceA)).toBeVisible({ timeout: 30000 })
  const sources = await opened.evaluate(() => window.aecpilot.listSources())
  sourceId = sources.find((source) => source.root_path === sample.sourceA)!.id
  expect(sourceId).not.toBe('')
})

// ── Блок 16. Просмотрщик: вкладки, поиск, масштаб ───────────────────────────

test('16.1.1 документ открылся на странице из ссылки, а не на первой', async () => {
  const page = await ui()
  const chip = await answerWith(page, SAMPLE.pdf, 'p7')
  await chip.click()
  await expect(pageCounter(page)).toHaveText(`7 / ${SAMPLE.pdfPages}`, { timeout: 60000 })
})

test('16.2.1 вторая ссылка даёт полосу вкладок с обоими именами', async () => {
  const page = await ui()
  const chip = await answerWith(page, SAMPLE.docx, `h:${SAMPLE.docxSection}`)
  await chip.click()
  await expect(viewerTab(page, SAMPLE.pdf)).toBeVisible({ timeout: 30000 })
  await expect(viewerTab(page, SAMPLE.docx)).toBeVisible()
})

test('16.2.2 первый документ на месте — его вкладка возвращает на ту же страницу', async () => {
  const page = await ui()
  await viewerTab(page, SAMPLE.pdf).click()
  await expect(pageCounter(page)).toHaveText(`7 / ${SAMPLE.pdfPages}`, { timeout: 30000 })
})

test('16.3.1 ссылка на открытый документ переводит его вкладку, а не заводит третью', async () => {
  const page = await ui()
  const chip = await answerWith(page, SAMPLE.pdf, 'p3')
  await chip.click()
  await expect(pageCounter(page)).toHaveText(`3 / ${SAMPLE.pdfPages}`, { timeout: 30000 })
  await expect(page.getByRole('button', { name: /^Закрыть .+\.(pdf|docx)$/ })).toHaveCount(2)
})

test('16.4.1 крестик закрывает именно свою вкладку, соседний документ остаётся', async () => {
  const page = await ui()
  await page.getByRole('button', { name: `Закрыть ${SAMPLE.docx}` }).click()
  // Одна вкладка — полосы нет; на экране остался PDF.
  await expect(page.getByRole('button', { name: /^Закрыть .+\.(pdf|docx)$/ })).toHaveCount(0)
  await expect(page.locator('span[title="' + SAMPLE.pdf + '"]')).toBeVisible()
  await expect(pageCounter(page)).toBeVisible()
})

test('16.5.1 «+» увеличивает ступенями, проценты видны на кнопке между «−» и «+»', async () => {
  const page = await ui()
  const zoomIn = page.getByRole('button', { name: /^(Увеличить|Zoom in)$/ })
  await zoomIn.click()
  await expect(page.getByRole('button', { name: '125%' })).toBeVisible()
  await zoomIn.click()
  await expect(page.getByRole('button', { name: '150%' })).toBeVisible()
})

test('16.5.2 увеличенный лист не обрезан — панель прокручивается', async () => {
  const page = await ui()
  await expect
    .poll(() => pdfScroller(page).evaluate((node) => node.scrollWidth > node.clientWidth + 1))
    .toBe(true)
})

test('16.5.3 клик по процентам возвращает «по ширине»', async () => {
  const page = await ui()
  await page.getByRole('button', { name: '150%' }).click()
  await expect(page.getByRole('button', { name: /^(По ширине|Fit width)$/ })).toBeVisible()
})

test('16.6.1 у строки поиска — счётчик вида «1 из 1»', async () => {
  const page = await ui()
  await searchBox(page).fill('ЩС-1')
  await expect(page.getByText(/^1 из 1$|^1 of 1$/)).toBeVisible({ timeout: 60000 })
})

test('16.6.2 просмотрщик сам перешёл на страницу с найденным, найденное подсвечено', async () => {
  const page = await ui()
  // «ЩС-1» есть только на седьмой странице; до поиска была третья.
  await expect(pageCounter(page)).toHaveText(`7 / ${SAMPLE.pdfPages}`, { timeout: 30000 })
  await expect(page.locator('div.bg-amber-400\\/60')).toHaveCount(1)
})

test('16.6.3 стрелки и Enter ходят по совпадениям, страница меняется вместе с ними', async () => {
  const page = await ui()
  // «Страница» стоит в заголовке каждого листа: одно совпадение на страницу.
  await searchBox(page).fill('Страница')
  await expect(page.getByText(/^7 из 17$|^7 of 17$/)).toBeVisible({ timeout: 60000 })

  await page.getByRole('button', { name: /^(Следующее совпадение|Next match)$/ }).click()
  await expect(page.getByText(/^8 из 17$|^8 of 17$/)).toBeVisible()
  await expect(pageCounter(page)).toHaveText(`8 / ${SAMPLE.pdfPages}`)

  await searchBox(page).press('Enter')
  await expect(page.getByText(/^9 из 17$|^9 of 17$/)).toBeVisible()
  await expect(pageCounter(page)).toHaveText(`9 / ${SAMPLE.pdfPages}`)

  await searchBox(page).press('Shift+Enter')
  await expect(page.getByText(/^8 из 17$|^8 of 17$/)).toBeVisible()

  await page.getByRole('button', { name: /^(Предыдущее совпадение|Previous match)$/ }).click()
  await expect(page.getByText(/^7 из 17$|^7 of 17$/)).toBeVisible()
  await expect(pageCounter(page)).toHaveText(`7 / ${SAMPLE.pdfPages}`)
})

test('16.7.1 слово, которого нет: «Совпадений нет», страница не уехала', async () => {
  const page = await ui()
  await searchBox(page).fill('абракадабра')
  await expect(page.getByText(/^(Совпадений нет|No matches)$/)).toBeVisible({ timeout: 30000 })
  await expect(pageCounter(page)).toHaveText(`7 / ${SAMPLE.pdfPages}`)
})

test('16.8.1 фраза, разорванная переносом строки, находится', async () => {
  const page = await ui()
  await searchBox(page).fill(SAMPLE.pdfSplitPhrase)
  await expect(page.getByText(/^1 из 1$|^1 of 1$/)).toBeVisible({ timeout: 60000 })
  await expect(pageCounter(page)).toHaveText(`5 / ${SAMPLE.pdfPages}`)
})

test('16.9.1 на другой вкладке строка поиска пуста', async () => {
  const page = await ui()
  const chip = await answerWith(page, PDF_COPY, 'p2')
  await chip.click()
  await expect(viewerTab(page, PDF_COPY)).toBeVisible({ timeout: 30000 })
  await expect(pageCounter(page)).toHaveText(`2 / ${SAMPLE.pdfPages}`, { timeout: 60000 })
  await expect(searchBox(page)).toHaveValue('')
  // И обратно: у первого документа его запрос на месте.
  await viewerTab(page, SAMPLE.pdf).click()
  await expect(searchBox(page)).toHaveValue(SAMPLE.pdfSplitPhrase)
})

test('16.10.1 битый PDF: понятная ошибка с путём к файлу', async () => {
  const page = await ui()
  await openFromTree(page, BROKEN_PDF)
  await expect(
    page.getByText(/Не удалось открыть документ|Could not open the document/)
  ).toBeVisible({
    timeout: 60000
  })
  await expect(page.getByText(new RegExp(`Путь: ${BROKEN_PDF}`))).toBeVisible()
})

test('16.10.2 приложение не упало и не зависло — остальные вкладки живы', async () => {
  const page = await ui()
  await assertRendererAlive(page, '16.10.2')
  expect(appWindows(stand.get()).length).toBe(1)
  await viewerTab(page, SAMPLE.pdf).click()
  await expect(pageCounter(page)).toBeVisible({ timeout: 30000 })
  // Убрать за собой: битый файл дальше не нужен.
  await page.getByRole('button', { name: `Закрыть ${BROKEN_PDF}` }).click()
  await page.getByRole('button', { name: `Закрыть ${PDF_COPY}` }).click()
})

// ── Блок 17. DOCX и TXT ─────────────────────────────────────────────────────

test('17.1.1 файл vault открывается во вкладке просмотрщика кликом из дерева', async () => {
  const page = await ui()
  await openFromTree(page, 'notes')
  await openFromTree(page, `notes/${SAMPLE.notes}`)
  await expect(viewerTab(page, SAMPLE.notes)).toBeVisible({ timeout: 30000 })
  await expect(page.locator('.ProseMirror')).toBeVisible({ timeout: 60000 })
})

test('17.2.1 файл источника открывается — на чтение, без правки', async () => {
  const page = await ui()
  await expandSourceA(page)
  await openFromTree(page, SAMPLE.txtUtf8)
  await expect(viewerTab(page, SAMPLE.txtUtf8)).toBeVisible({ timeout: 30000 })
  await expect(page.locator('pre')).toContainText(SAMPLE.txtLine, { timeout: 30000 })
  // Без редактора: текст лежит в `<pre>`, а не в ProseMirror. (Проверять
  // `[contenteditable]` по всей странице нельзя — композер чата и есть такой.)
  await expect(page.locator('.ProseMirror')).toHaveCount(0)
})

test('17.3.1 DOCX виден документом: заголовки, таблица, отступы', async () => {
  const page = await ui()
  await openFromTree(page, SAMPLE.docx)
  const docx = page.locator('.docx-wrapper, .docx').first()
  await expect(docx).toBeVisible({ timeout: 60000 })
  await expect(page.locator('.docx-wrapper table, .docx table').first()).toBeVisible()
  await expect(page.getByText(SAMPLE.docxSection).first()).toBeVisible()
  await expect(page.getByText('Маркировка').first()).toBeVisible()
})

test('17.3.2 лист белый даже в тёмной теме', async () => {
  const page = await ui()
  const sheet = page.locator('div.bg-white').first()
  await expect(sheet).toBeVisible()
  expect(await sheet.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe(
    'rgb(255, 255, 255)'
  )
})

test('17.3.3 страницы разделены, как в Word', async () => {
  const page = await ui()
  // docx-preview с `breakPages` рисует каждую страницу своей секцией; в образце
  // два разрыва страницы — три страницы.
  await expect(page.locator('section.docx')).toHaveCount(3)
})

test('17.4.1 .txt в Windows-1251 читается по-русски, без кракозябр', async () => {
  const page = await ui()
  await openFromTree(page, SAMPLE.txt1251)
  await expect(viewerTab(page, SAMPLE.txt1251)).toBeVisible({ timeout: 30000 })
  await expect(page.locator('pre')).toContainText(SAMPLE.txtLine, { timeout: 30000 })
  await expect(page.locator('pre')).not.toContainText('Êàáåëü')
})

test('17.4.2 в шапке подписано windows-1251', async () => {
  const page = await ui()
  await expect(page.getByText('windows-1251', { exact: true })).toBeVisible()
})

test('17.5.1 .txt в UTF-8 читается, в шапке подписано UTF-8', async () => {
  const page = await ui()
  await viewerTab(page, SAMPLE.txtUtf8).click()
  await expect(page.locator('pre')).toContainText(SAMPLE.txtLine)
  await expect(page.getByText('UTF-8', { exact: true })).toBeVisible()
})

test('17.6.1 битый .docx: понятная ошибка с путём, приложение живо', async () => {
  const page = await ui()
  await openFromTree(page, SAMPLE.brokenDir)
  await openFromTree(page, `${SAMPLE.brokenDir}/битый.docx`)
  await expect(
    page.getByText(/Не удалось открыть документ|Could not open the document/)
  ).toBeVisible({
    timeout: 60000
  })
  await expect(page.getByText(`${SAMPLE.brokenDir}/битый.docx`).last()).toBeVisible()
  await assertRendererAlive(page, '17.6.1')
  await page.getByRole('button', { name: 'Закрыть битый.docx' }).click()
})

// ── Блок 18. Таблицы: XLSX и CSV ────────────────────────────────────────────

test('18.1.1 таблица с номерами строк слева', async () => {
  const page = await ui()
  await openFromTree(page, SAMPLE.xlsx)
  await expect(viewerTab(page, SAMPLE.xlsx)).toBeVisible({ timeout: 30000 })
  await expect(page.getByText(SAMPLE.xlsxMergedHeader)).toBeVisible({ timeout: 60000 })
  for (const n of ['1', '2', '3']) {
    await expect(
      page.locator('div.font-mono').filter({ hasText: new RegExp(`^${n}$`) })
    ).toHaveCount(1)
  }
})

test('18.1.2 листы книги — кнопками над таблицей, переключение работает', async () => {
  const page = await ui()
  await page.getByRole('button', { name: SAMPLE.xlsxSecondSheet, exact: true }).click()
  await expect(page.getByText('Автомат 16 А')).toBeVisible()
  await expect(page.getByText(SAMPLE.xlsxMergedHeader)).toHaveCount(0)
  await page.getByRole('button', { name: SAMPLE.xlsxSheet, exact: true }).click()
  await expect(page.getByText(SAMPLE.xlsxMergedHeader)).toBeVisible()
})

test('18.1.3 объединённый заголовок написан один раз', async () => {
  const page = await ui()
  await expect(page.getByText(SAMPLE.xlsxMergedHeader)).toHaveCount(1)
})

test('18.2.1 дата показана датой, а не числом', async () => {
  const page = await ui()
  await expect(page.getByText(SAMPLE.xlsxDate, { exact: true })).toBeVisible()
  await expect(page.getByText(/^4625\d$/)).toHaveCount(0)
})

test('18.2.2 у формулы показано значение, а не текст формулы', async () => {
  const page = await ui()
  await expect(page.getByText(String(SAMPLE.xlsxFormulaValue), { exact: true })).toBeVisible()
  await expect(page.getByText('32', { exact: true })).toBeVisible()
  await expect(page.getByText(/^=B3\+B4$|^=B4\+4$/)).toHaveCount(0)
})

test('18.3.1 большая ведомость прокручивается', async () => {
  const page = await ui()
  await openFromTree(page, SAMPLE.xlsxBig)
  await expect(viewerTab(page, SAMPLE.xlsxBig)).toBeVisible({ timeout: 30000 })
  await expect(page.getByText('строка 1', { exact: true })).toBeVisible({ timeout: 120000 })
  const scroller = page
    .getByText('строка 1', { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"overflow-auto")][1]')
  await scroller.evaluate((node) => {
    node.scrollTop = node.scrollHeight
  })
  // Потолок просмотрщика — 20 000 строк ВМЕСТЕ с шапкой: последняя видимая
  // строка данных — 19 999-я, а 20 000-я и 20 001-я обрезаны (18.3.2).
  await expect(page.getByText('строка 19999', { exact: true })).toBeVisible({ timeout: 30000 })
  await expect(page.getByText('строка 20000', { exact: true })).toHaveCount(0)
})

test('18.3.2 обрезка подписана: «Первые 20000 строк из …»', async () => {
  const page = await ui()
  // 20 002 = шапка + 20 001 строка данных образца.
  await expect(
    page.getByText(/Первые 20000 строк из 20002|First 20000 rows of 20002/)
  ).toBeVisible()
})

test('18.4.1 CSV русского Excel: три колонки, а не пять', async () => {
  const page = await ui()
  await openFromTree(page, SAMPLE.csv1251)
  await expect(viewerTab(page, SAMPLE.csv1251)).toBeVisible({ timeout: 30000 })
  const rowOfPump = page
    .getByText('Насосная', { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"absolute")][1]')
  await expect(rowOfPump).toBeVisible({ timeout: 60000 })
  await expect(rowOfPump.locator('div.w-40')).toHaveCount(3)
  await expect(rowOfPump.locator('div.w-40').nth(1)).toHaveText('2,5')
})

test('18.5.1 CSV с запятой-разделителем разобран правильно', async () => {
  const page = await ui()
  await openFromTree(page, SAMPLE.csvUtf8)
  await expect(viewerTab(page, SAMPLE.csvUtf8)).toBeVisible({ timeout: 30000 })
  const rowOfBreaker = page
    .getByText('Автомат 16 А', { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"absolute")][1]')
  await expect(rowOfBreaker).toBeVisible({ timeout: 60000 })
  await expect(rowOfBreaker.locator('div.w-40')).toHaveCount(3)
})

test('18.6.1 кириллический CSV в Windows-1251 читается без кракозябр', async () => {
  const page = await ui()
  await viewerTab(page, SAMPLE.csv1251).click()
  await expect(page.getByText('Щитовая', { exact: true })).toBeVisible()
  await expect(page.getByText('Помещение', { exact: true })).toBeVisible()
})

// ── Блок 19. Ссылка приводит на место, а не на файл ────────────────────────

test('19.1.1 в ссылке видно имя книги и адрес «Ведомость!C5»', async () => {
  const page = await ui()
  const chip = await answerWith(page, SAMPLE.xlsx, `${SAMPLE.xlsxSheet}!C5`)
  await expect(chip).toContainText(SAMPLE.xlsx)
  await expect(chip).toContainText(`${SAMPLE.xlsxSheet}!C5`)
})

test('19.1.2 клик открывает книгу на названном листе', async () => {
  const page = await ui()
  // До клика книга стоит на втором листе — чтобы переход был виден.
  await viewerTab(page, SAMPLE.xlsx).click()
  await page.getByRole('button', { name: SAMPLE.xlsxSecondSheet, exact: true }).click()
  await expect(page.getByText('Автомат 16 А')).toBeVisible()

  const raw = cite(SAMPLE.xlsx, `${SAMPLE.xlsxSheet}!C5`)
  await page
    .locator(`button[title="${raw.slice(0, raw.indexOf('](#cite)'))}]"]`)
    .last()
    .click()
  await expect(page.getByText(SAMPLE.xlsxMergedHeader)).toBeVisible({ timeout: 30000 })
  await expect(page.getByText('Автомат 16 А')).toHaveCount(0)
})

test('19.1.3 названная ячейка подсвечена жёлтым', async () => {
  const page = await ui()
  const cited = page.locator('div.bg-amber-400\\/30')
  await expect(cited).toHaveCount(1)
  await expect(cited).toHaveText(String(SAMPLE.xlsxFormulaValue))
})

test('19.2.1 повторный клик по ссылке возвращает к тому же месту', async () => {
  const page = await ui()
  const chip = await answerWith(page, SAMPLE.xlsxBig, 'Данные!B15000')
  await chip.click()
  await expect(page.getByText('строка 15000', { exact: true })).toBeVisible({ timeout: 120000 })

  // Уехать прокруткой в начало листа…
  const scroller = page
    .getByText('строка 15000', { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"overflow-auto")][1]')
  await scroller.evaluate((node) => {
    node.scrollTop = 0
  })
  await expect(page.getByText('строка 1', { exact: true })).toBeVisible({ timeout: 30000 })
  await expect(page.getByText('строка 15000', { exact: true })).toHaveCount(0)

  // …и вернуться той же ссылкой.
  await chip.click()
  await expect(page.getByText('строка 15000', { exact: true })).toBeVisible({ timeout: 30000 })
})

test('19.3.1 в ссылке на DOCX видно название раздела', async () => {
  const page = await ui()
  const chip = await answerWith(page, SAMPLE.docx, `h:${SAMPLE.docxSection}`)
  await expect(chip).toContainText(SAMPLE.docx)
  await expect(chip).toContainText(SAMPLE.docxSection)
})

test('19.3.2 клик открывает документ, прокрученный к разделу, заголовок подсвечен', async () => {
  const page = await ui()
  const raw = cite(SAMPLE.docx, `h:${SAMPLE.docxSection}`)
  await page
    .locator(`button[title="${raw.slice(0, raw.indexOf('](#cite)'))}]"]`)
    .last()
    .click()
  await expect(page.locator('section.docx').first()).toBeVisible({ timeout: 60000 })
  const heading = page
    .locator('section.docx p, section.docx h1, section.docx h2')
    .filter({ hasText: new RegExp(`^${SAMPLE.docxSection}`) })
    .first()
  await expect(heading).toBeVisible()
  await expect
    .poll(() => heading.evaluate((node) => (node as HTMLElement).style.backgroundColor))
    .toContain('251')
  const inView = await heading.evaluate((node) => {
    const scroller = node.closest('.overflow-auto') as HTMLElement
    const box = node.getBoundingClientRect()
    const frame = scroller.getBoundingClientRect()
    return box.top >= frame.top - 1 && box.bottom <= frame.bottom + 1
  })
  expect(inView, 'заголовок раздела должен быть в кадре').toBe(true)
})

test('19.3.3 раздел не нашёлся — документ открыт с начала, чужое место не подсвечено', async () => {
  const page = await ui()
  const chip = await answerWith(page, SAMPLE.docx, 'h:Нет такого раздела')
  await chip.click()
  await expect(page.locator('section.docx').first()).toBeVisible({ timeout: 60000 })
  const scroller = page
    .locator('section.docx')
    .first()
    .locator('xpath=ancestor::div[contains(@class,"overflow-auto")][1]')
  await expect.poll(() => scroller.evaluate((node) => node.scrollTop)).toBe(0)
  const painted = await page
    .locator('section.docx p, section.docx td')
    .evaluateAll(
      (nodes) => nodes.filter((node) => (node as HTMLElement).style.backgroundColor !== '').length
    )
  expect(painted).toBe(0)
})

test('19.4.1 ссылка без места открывает файл с начала, ничего не подсвечено', async () => {
  const page = await ui()
  const chip = await answerWith(page, SAMPLE.txtUtf8)
  await expect(chip).toHaveText(SAMPLE.txtUtf8)
  await chip.click()
  await expect(viewerTab(page, SAMPLE.txtUtf8)).toBeVisible({ timeout: 30000 })
  await expect(page.locator('pre')).toContainText('Заметка по кабелю')
  await expect(page.locator('mark, .bg-amber-400\\/30, .bg-amber-400\\/60')).toHaveCount(0)
})

// ── Блок 20. Правка .md ─────────────────────────────────────────────────────

const editor = (page: Page): Locator => page.locator('.ProseMirror')

/** Набрать в конце документа. Фокус — программный, без клика: клик «в центр»
 *  редактора попадает то в ячейку таблицы (и Ctrl+End ведёт в конец ячейки),
 *  то в ссылку `[[…]]` — и открывает её вместо того, чтобы поставить курсор. */
async function typeAtEnd(page: Page, text: string): Promise<void> {
  await editor(page).focus()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(text)
}

test('20.1.1 .md открылся редактором: заголовки крупные, списки — списками', async () => {
  const page = await ui()
  await viewerTab(page, SAMPLE.notes).click()
  await expect(editor(page)).toBeVisible({ timeout: 30000 })
  await expect(editor(page).locator('h1')).toHaveText('Заметки')
  await expect(editor(page).locator('ul li')).toHaveCount(2)
  await expect(editor(page).locator('table')).toHaveCount(1)
  // Крупнее обычного текста — не решётки в строке.
  const sizes = await editor(page).evaluate((node) => ({
    h1: parseFloat(getComputedStyle(node.querySelector('h1')!).fontSize),
    p: parseFloat(getComputedStyle(node.querySelector('p')!).fontSize)
  }))
  expect(sizes.h1).toBeGreaterThan(sizes.p)
})

test('20.2.1 после набора в шапке «Сохраняю…», потом «Сохранено»', async () => {
  const page = await ui()
  await typeAtEnd(page, ' Дополнение первое.')
  await expect(page.getByText(/^(Сохраняю…|Saving…)$/)).toBeVisible({ timeout: 5000 })
  await expect(page.getByText(/^(Сохранено|Saved)$/)).toBeVisible({ timeout: 10000 })
})

test('20.3.1 уход на другую вкладку сразу после набора не стоит правки', async () => {
  const page = await ui()
  await typeAtEnd(page, ' Дополнение второе.')
  await viewerTab(page, SAMPLE.txtUtf8).click()
  await expect(page.locator('pre')).toBeVisible()
  await viewerTab(page, SAMPLE.notes).click()
  await expect(editor(page)).toContainText('Дополнение второе.', { timeout: 30000 })
})

test('20.4.1 после перезапуска правка на диске', async () => {
  const onDisk = readFileSync(join(stand.get().projectDir, 'notes', SAMPLE.notes), 'utf-8')
  expect(onDisk).toContain('Дополнение первое.')
  expect(onDisk).toContain('Дополнение второе.')

  await stand.get().relaunch()
  const page = await ui()
  await openFromTree(page, 'notes')
  await openFromTree(page, `notes/${SAMPLE.notes}`)
  await expect(editor(page)).toContainText('Дополнение второе.', { timeout: 60000 })
})

test('20.5.1 Ctrl+Z отменяет по шагам, Ctrl+Shift+Z и Ctrl+Y возвращают', async () => {
  const page = await ui()
  await typeAtEnd(page, ' альфа')
  await page.waitForTimeout(700)
  await page.keyboard.type(' бета')
  await expect(editor(page)).toContainText('альфа бета')

  await page.keyboard.press('Control+z')
  await expect(editor(page)).not.toContainText('бета')
  await expect(editor(page)).toContainText('альфа')
  await page.keyboard.press('Control+z')
  await expect(editor(page)).not.toContainText('альфа')

  await page.keyboard.press('Control+Shift+z')
  await expect(editor(page)).toContainText('альфа')
  await page.keyboard.press('Control+y')
  await expect(editor(page)).toContainText('альфа бета')
})

test('20.6.1 таблица в разметке GFM стала таблицей', async () => {
  const page = await ui()
  const before = await editor(page).locator('table').count()
  await typeAtEnd(page, '')
  await page.keyboard.press('Enter')
  await page.keyboard.type('| Позиция | Кол-во |')
  await page.keyboard.press('Enter')
  await page.keyboard.type('|---|---|')
  await page.keyboard.press('Enter')
  await page.keyboard.type('| Автомат | 4 |')
  await page.keyboard.press('Enter')
  // Редактор — WYSIWYG: разметка становится таблицей на разборе документа.
  // Уход с вкладки сохраняет, возврат читает с диска. После перезапуска
  // (20.4.1) открыта одна вкладка — вторую заводим из дерева источника.
  await expandSourceA(page)
  await openFromTree(page, SAMPLE.txtUtf8)
  await expect(viewerTab(page, SAMPLE.txtUtf8)).toBeVisible({ timeout: 30000 })
  await viewerTab(page, SAMPLE.notes).click()
  await expect(editor(page).locator('table')).toHaveCount(before + 1, { timeout: 30000 })
  await expect(editor(page).locator('table').last()).toContainText('Автомат')
  // На диске — таблица GFM без пустых рядов: редактор собрал таблицу, а не
  // оставил абзацы. Ширину ячеек сериализатор выравнивает — это допущено.
  const onDisk = readFileSync(join(stand.get().projectDir, 'notes', SAMPLE.notes), 'utf-8')
  expect(onDisk).toMatch(/\| Позиция \| Кол-во \|\r?\n\|[-:| ]+\|\r?\n\| Автомат \| 4\s*\|/)
  expect(onDisk).not.toMatch(/^\|(\s*(<br \/>)?\s*\|)+\s*$/m)
})

test('20.7.1 .md из источника показан как текст, править нельзя', async () => {
  const page = await ui()
  await expandSourceA(page)
  await openFromTree(page, SAMPLE.sourceMd)
  await expect(viewerTab(page, SAMPLE.sourceMd)).toBeVisible({ timeout: 30000 })
  await expect(page.locator('pre')).toContainText('# Описание источника', { timeout: 30000 })
  // Без редактора: текст лежит в `<pre>`, а не в ProseMirror. (Проверять
  // `[contenteditable]` по всей странице нельзя — композер чата и есть такой.)
  await expect(page.locator('.ProseMirror')).toHaveCount(0)
})

// ── Блок 21. Ссылки между страницами вики ───────────────────────────────────

const wikiLink = (page: Page, target: string): Locator =>
  editor(page).locator(`[data-wikilink="${target}"]`)

test('21.1.1 [[Кабельный журнал]] подсветился и стал кликабельным', async () => {
  const page = await ui()
  await viewerTab(page, SAMPLE.notes).click()
  await typeAtEnd(page, ' См. [[Кабельный журнал]].')
  await expect(wikiLink(page, 'Кабельный журнал').first()).toBeVisible({ timeout: 30000 })
  await expect(wikiLink(page, 'Кабельный журнал').first()).toHaveCSS('cursor', 'pointer')
})

test('21.1.2 скобки остались на месте — разметка не переписана', async () => {
  const page = await ui()
  await expect(editor(page)).toContainText('[[Кабельный журнал]]')
  // И на диске тоже: сериализатор редактора экранировал `[` как `\[`, и в
  // файле лежало `\[\[…]]` — не ссылка ни для вики, ни для агента (D-95).
  await expect(page.getByText(/^(Сохранено|Saved)$/)).toBeVisible({ timeout: 10000 })
  const onDisk = readFileSync(join(stand.get().projectDir, 'notes', SAMPLE.notes), 'utf-8')
  expect(onDisk).toContain('[[Кабельный журнал]]')
  expect(onDisk).toContain(`[[${SAMPLE.wikiPage}]]`)
  expect(onDisk).not.toContain('\\[')
  expect(onDisk).toContain('- первый пункт')
})

test('21.2.1 клик открывает вкладку страницы; новой — заводит её в wiki/', async () => {
  const page = await ui()
  const file = join(stand.get().projectDir, 'wiki', 'Кабельный журнал.md')
  expect(existsSync(file)).toBe(false)
  await wikiLink(page, 'Кабельный журнал').first().click()
  await expect(viewerTab(page, 'Кабельный журнал.md')).toBeVisible({ timeout: 30000 })
  expect(existsSync(file)).toBe(true)
})

test('21.4.1 повторный клик открывает ту же страницу, второго файла нет', async () => {
  const page = await ui()
  const tabsBefore = await page.getByRole('button', { name: /^Закрыть / }).count()
  await viewerTab(page, SAMPLE.notes).click()
  await wikiLink(page, 'Кабельный журнал').first().click()
  await expect(viewerTab(page, 'Кабельный журнал.md')).toBeVisible()
  expect(await page.getByRole('button', { name: /^Закрыть / }).count()).toBe(tabsBefore)
  const created = readdirSync(join(stand.get().projectDir, 'wiki')).filter((name) =>
    name.startsWith('Кабельный журнал')
  )
  expect(created).toEqual(['Кабельный журнал.md'])
})

test('21.5.1 [[ТП-1|трансформаторная]] ведёт на ТП-1', async () => {
  const page = await ui()
  await viewerTab(page, SAMPLE.notes).click()
  await typeAtEnd(page, ' Также [[ТП-1|трансформаторная]].')
  await expect(wikiLink(page, 'ТП-1').first()).toBeVisible({ timeout: 30000 })
  await wikiLink(page, 'ТП-1').first().click()
  await expect(viewerTab(page, `${SAMPLE.wikiPage}.md`)).toBeVisible({ timeout: 30000 })
  await expect(editor(page)).toContainText('Трансформаторная подстанция')
  expect(existsSync(join(stand.get().projectDir, 'wiki', 'трансформаторная.md'))).toBe(false)
})

test('21.6.1 [[тп-1]] строчными ведёт на существующую ТП-1.md', async () => {
  const page = await ui()
  await viewerTab(page, SAMPLE.notes).click()
  await typeAtEnd(page, ' И [[тп-1]].')
  await expect(wikiLink(page, 'тп-1').first()).toBeVisible({ timeout: 30000 })
  const tabsBefore = await page.getByRole('button', { name: /^Закрыть / }).count()
  await wikiLink(page, 'тп-1').first().click()
  await expect(viewerTab(page, `${SAMPLE.wikiPage}.md`)).toBeVisible({ timeout: 30000 })
  expect(await page.getByRole('button', { name: /^Закрыть / }).count()).toBe(tabsBefore)
  const pages = readdirSync(join(stand.get().projectDir, 'wiki')).filter((name) =>
    /^тп-1\.md$/i.test(name)
  )
  expect(pages).toEqual([`${SAMPLE.wikiPage}.md`])
})
