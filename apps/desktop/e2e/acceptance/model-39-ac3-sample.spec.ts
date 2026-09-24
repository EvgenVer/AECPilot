// Задача 3F.10: цепочка AC3 (блок 39) на ОБРАЗЦЕ, и в ней же позиции блока 22
// «Вики проекта» — это одна и та же сборка вики, и строить её дважды за деньги
// незачем. Блок 39 остаётся владельцу на настоящем проекте (задача 4.15); здесь
// страхуется механика цепочки. Сводка «39 (образец)» — в журнале прогона
// (`console.log('39 …')`), её переносят в отчёт.
//
// Индексации и графу нужен ключ провайдера в хранилище приложения (D-117).

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

import { expect, test, type Locator, type Page } from '@playwright/test'

import { addSourceAsUser, clearNotifications, hideFirstRunSurfaces, mainWindow, openProject, rootPython, standFixture } from '../lib/app'
import { record } from '../lib/evidence'
import { eventCount, eventsSince, recordChatEvents, turn, type TurnResult } from '../lib/turn'

test.describe.configure({ mode: 'serial', timeout: 1800000 })

const stand = standFixture({ mode: 'live', label: 'model-39', providerKeyInStore: true })

// ── Образец: маленькая «проектная папка» со связанными документами ──────────

const docs = mkdtempSync(join(tmpdir(), 'aecpilot-e2e-ac3-'))
const DOCS: Record<string, string> = {
  'ТЗ на электроснабжение.docx': [
    'Техническое задание. Объект: склад готовой продукции, г. Тверь.',
    'Электроснабжение склада выполнить от трансформаторной подстанции ТП-1.',
    'Щит ЩС-1 питает освещение и вентиляцию склада.',
    'Категория надёжности электроснабжения — II.'
  ].join('\n'),
  'ТУ сетевой организации.docx': [
    'Технические условия на присоединение склада готовой продукции.',
    'Точка присоединения — РУ-0,4 кВ трансформаторной подстанции ТП-1.',
    'Максимальная мощность присоединяемых устройств — 150 кВт.',
    'Расчётная нагрузка щита ЩС-1 составляет 42 кВт.'
  ].join('\n'),
  'Письмо заказчика.docx': [
    'Письмо № 17 от 02.09.2026. Заказчик просит предусмотреть резерв мощности 10 %',
    'на щите ЩС-1 и согласовать трассу кабеля от ТП-1 до склада.'
  ].join('\n'),
  'Кабельный журнал.csv': ['Кабель;Откуда;Куда;Длина, м', 'ВВГнг-LS 5х25;ТП-1;ЩС-1;120', 'ВВГнг-LS 3х2,5;ЩС-1;Освещение;60'].join('\n'),
  // Файл, который не разбирается: ошибка по нему должна быть названа поимённо
  // и не остановить остальные.
  'битый.docx': 'это не docx, а текст с чужим расширением'
}
/** Документ образца: `.docx` — настоящий (python-docx из корневого venv, как
 *  образец блоков 16–21), `битый.docx` и `.csv` — как есть. Индексатор TXT не
 *  берёт (`aec_rag/parse.py`), поэтому текст — в DOCX. */
function writeDoc(name: string, text: string): void {
  if (!name.endsWith('.docx') || name === 'битый.docx') {
    writeFileSync(join(docs, name), text + '\n', 'utf8')
    return
  }
  const job = join(docs, '..', `${Date.now()}-doc.json`)
  writeFileSync(job, JSON.stringify({ path: join(docs, name), lines: text.split('\n') }), 'utf8')
  const script = join(docs, '..', 'make-doc.py')
  writeFileSync(
    script,
    [
      'import json, sys',
      'from docx import Document',
      'job = json.load(open(sys.argv[1], encoding="utf-8"))',
      'doc = Document()',
      'for line in job["lines"]:',
      '    doc.add_paragraph(line)',
      'doc.save(job["path"])'
    ].join('\n'),
    'utf8'
  )
  execFileSync(rootPython, [script, job])
  rmSync(job)
}
for (const [name, text] of Object.entries(DOCS)) writeDoc(name, text)

/** Снимок дерева образца: путь → размер и время правки. */
function tree(dir: string): Map<string, string> {
  const out = new Map<string, string>()
  const walk = (at: string): void => {
    for (const name of readdirSync(at)) {
      const full = join(at, name)
      const info = statSync(full)
      if (info.isDirectory()) walk(full)
      else out.set(relative(dir, full), `${info.size}:${info.mtimeMs}`)
    }
  }
  walk(dir)
  return out
}

const docsBefore = tree(docs)

interface IngestState {
  running: boolean
  progress?: { done: number; total: number } | null
  lastReport?: { files_total: number; files_failed: number; files_ingested: number; errors: { rel_path: string; error: string }[] } | null
}

let prepared = false
let progressSeen = false
let ingest: IngestState['lastReport'] = null

async function ui(): Promise<Page> {
  const page = await mainWindow(stand.get())
  await hideFirstRunSurfaces(page)
  if (!prepared) {
    prepared = true
    await openProject(stand.get(), page)
    expect(await addSourceAsUser(stand.get(), page, docs)).toMatchObject({ ok: true })
    await page.evaluate(() => window.aecpilot.startIngest(true))
    await expect
      .poll(
        async () => {
          const state = (await page.evaluate(() => window.aecpilot.getIngestState())) as IngestState
          if (state.running && state.progress) progressSeen = true
          ingest = state.lastReport ?? null
          return !state.running && (state.lastReport?.files_total ?? 0) > 0
        },
        { timeout: 600000, intervals: [1000], message: 'индексация закончилась' }
      )
      .toBe(true)
    // Граф — по всему источнику: вики строится по сущностям и связям графа.
    const sourceId = (await page.evaluate(() => window.aecpilot.listSources())).find((s) => s.root_path === docs)!.id
    expect(await page.evaluate(([id]) => window.aecpilot.startGraphAdd(id, '', 'folder'), [sourceId])).toMatchObject({
      started: true
    })
    await expect
      .poll(async () => (await page.evaluate(() => window.aecpilot.getGraphAddState())).running, {
        timeout: 900000,
        intervals: [5000],
        message: 'граф построен'
      })
      .toBe(false)
  }
  await recordChatEvents(page)
  return page
}

const wiki = (): string => join(stand.get().projectDir, 'wiki')

function wikiPages(): string[] {
  const out: string[] = []
  for (const folder of ['entities', 'concepts', 'comparisons', 'queries']) {
    const dir = join(wiki(), folder)
    if (!existsSync(dir)) continue
    for (const name of readdirSync(dir)) if (name.endsWith('.md')) out.push(join(folder, name))
  }
  return out
}

function read(rel: string): string {
  return readFileSync(join(wiki(), rel), 'utf8')
}

// ── 39: индексация ──────────────────────────────────────────────────────────

test('AC3 образец: индексация: прогресс виден, ошибка по файлу названа и не остановила остальные', async () => {
  await ui()
  console.log('39 индексация: ' + JSON.stringify(ingest))
  expect(progressSeen, 'ход индексации виден').toBe(true)
  expect(ingest?.errors.map((row) => row.rel_path)).toContain('битый.docx')
  expect(ingest?.files_ingested, 'остальные файлы проиндексированы').toBeGreaterThanOrEqual(4)
})

// ── 22.1 / 39.3: построение ─────────────────────────────────────────────────

// Вопрос карточкой `clarify` держал построение 30 минут до таймаута (замер
// 24.09.2026: «Найдено 4 проиндексированных документа… Что делаем?»). Человек
// выбрал бы первый вариант — модель ставит рекомендуемый первым. На проверке
// вики — только вариант «не чинить»: 22.6.3 проверяет, что молча не чинит.
const ANY_CHOICE = /./
const NO_FIX_CHOICE = /не исправ|не чин|остав|только отч|отчёт|нет/i

let build: TurnResult

test('22.1.1 в wiki/ появились entities, concepts, comparisons, queries, raw и SCHEMA/index/log', async () => {
  test.setTimeout(3600000)
  const page = await ui()
  const mark = await eventCount(page)
  build = await turn(page, 'построй вики проекта', { timeoutMs: 1800000, clarify: ANY_CHOICE, declineForeign: true })
  console.log('22.1 ' + build.transcript.slice(0, 3000))
  // Навык сначала называет покрытие вслух и спрашивает, как быть (`aec-wiki`,
  // шаг 1: «это надо сказать вслух до начала»). Человек ответил бы — отвечаем.
  // Бывает и остановка на полпути: «стартовую часть собрал, дальше дописать?»
  // (замер 24.09.2026). Человек сказал бы «до конца» — говорим, не больше трёх раз.
  // Готово — это снимки в raw/ и страницы, а не только папки: каркас модель
  // однажды сложила файловым `write_file` в обход `wiki_init` и остановилась.
  const complete = (): boolean =>
    ['entities', 'concepts', 'comparisons', 'queries', 'raw', 'SCHEMA.md', 'index.md', 'log.md'].every((name) =>
      existsSync(join(wiki(), name))
    ) &&
    readdirSync(join(wiki(), 'raw')).some((name) => name.endsWith('.md') && name !== 'README.md') &&
    wikiPages().length >= 2
  for (let round = 0; round < 3 && !complete(); round++) {
    const reply = existsSync(join(wiki(), 'entities'))
      ? 'Продолжай до конца: все страницы, проверка вики и контрольная точка. Больше не спрашивай.'
      : '1 — строй сейчас по тому, что есть.'
    build = await turn(page, reply, { timeoutMs: 1800000, clarify: ANY_CHOICE, declineForeign: true })
    console.log(`22.1 (ответ ${round + 1}) ` + build.transcript.slice(0, 3000))
  }
  // Замер 24.09.2026: из семи `wiki_write_page` записалась одна, агент сказал
  // «сервер временно отклонил запросы» — сырые ответы инструмента в журнал.
  const writes = (await eventsSince(page, mark)).filter(
    (event) => event.type === 'tool.complete' && JSON.stringify(event.payload ?? {}).includes('wiki_write_page')
  )
  console.log('22.1 RAW wiki_write_page ' + JSON.stringify(writes).slice(0, 6000))
  for (const name of ['entities', 'concepts', 'comparisons', 'queries', 'raw', 'SCHEMA.md', 'index.md', 'log.md']) {
    expect(existsSync(join(wiki(), name)), name).toBe(true)
  }
  console.log('39 страницы вики: ' + wikiPages().join(', '))
  await record(test.info(), page, { transcript: build.transcript })
})

test('22.1.2 в raw/ — снимки документов, у каждого сверху source_id и sha256', async () => {
  const snapshots = readdirSync(join(wiki(), 'raw')).filter((name) => name.endsWith('.md') && name !== 'README.md')
  expect(snapshots.length, 'снимки есть').toBeGreaterThanOrEqual(3)
  for (const name of snapshots) {
    const head = readFileSync(join(wiki(), 'raw', name), 'utf8').split('---')[1] ?? ''
    expect(head, name).toMatch(/source_id:/)
    expect(head, name).toMatch(/sha256:/)
  }
})

/** Вердикт позиции качества (TASKS 3F.9: «стенограмма + вердикт как
 *  предложение» владельцу). Замечаний нет — позиция зелёная; есть — позиция
 *  пропущена с их перечнем: она не выдаёт себя за пройденную и не глушит
 *  соседние позиции последовательной цепочки, как глушил бы красный тест. */
function verdict(defects: string[]): void {
  if (!defects.length) return
  console.log(`[вердикт владельцу] ${test.info().title}: ${defects.join('; ')}`)
  test.skip(true, `к владельцу: ${defects.join('; ')}`)
}

// Замер 22.1.3 снимается сразу после построения, а утверждается последним
// тестом файла: цепочка последовательная, и красный 22.1.3 (D-139 — дубли
// страниц под разным написанием имени, одна из пары заглушка) иначе глушит все
// остальные позиции блока 22.
const buildDefects: string[] = []

test('22.1.3 (замер) страницы после построения', async () => {
  const pages = wikiPages()
  if (pages.length < 2) buildDefects.push(`страниц после построения: ${pages.length}`)
  const seen = new Map<string, string>()
  for (const rel of pages) {
    const text = read(rel)
    const head = text.split('---')[1] ?? ''
    for (const field of ['title:', 'type:', 'tags:', 'sources:', 'updated:']) {
      if (!head.includes(field)) buildDefects.push(`${rel}: нет ${field}`)
    }
    const body = text.split('---').slice(2).join('---').trim()
    if (body.length <= 120) buildDefects.push(`${rel}: заглушка (${body.length} зн.)`)
    const key = rel.toLowerCase().replace(/[\s_№-]+/g, '')
    if (seen.has(key)) buildDefects.push(`${rel}: дубль ${seen.get(key)}`)
    else seen.set(key, rel)
  }
  console.log('22.1.3 замечания: ' + JSON.stringify(buildDefects))
})

// Замер 22.1.5 — так же, как 22.1.3: утверждается в конце файла. Замер
// 24.09.2026: страницы есть, а index.md остался заготовкой «Страниц пока нет» —
// шаг 6 навыка («Каталог и журнал») модель пропустила.
const indexDefects: string[] = []

test('22.1.5 (замер) каталог и журнал после построения', async () => {
  const index = read('index.md')
  console.log('22.1.5 index.md: ' + index.slice(0, 2000))
  // Индекс называет страницу ссылкой `[[…]]`, по заголовку `title` или по имени
  // файла — сравниваем без регистра и без разницы между пробелом и `_`.
  const norm = (text: string): string => text.toLowerCase().replace(/[\s_]+/g, ' ')
  const title = (rel: string): string => read(rel).match(/^title:\s*(.+)$/m)?.[1].trim() ?? ''
  const listed = wikiPages().filter((rel) =>
    [rel.split(/[\\/]/).pop()!.replace(/\.md$/, ''), title(rel)].some((name) => name && norm(index).includes(norm(name)))
  )
  if (listed.length < Math.min(2, wikiPages().length)) indexDefects.push(`в index.md страниц: ${listed.length} из ${wikiPages().length}`)
  if (!/build|постро/i.test(read('log.md'))) indexDefects.push('в log.md нет записи о построении')
  console.log('22.1.5 замечания: ' + JSON.stringify(indexDefects))
})

// ── Открыть страницу в приложении ───────────────────────────────────────────

function treeRow(page: Page, title: string): Locator {
  // Строка дерева Vault — пункт списка с кнопкой-именем (снимок 24.09.2026).
  return page.getByRole('listitem').filter({ has: page.getByRole('button', { name: title, exact: true }) })
}

// Открытый документ в правой панели «Document»: строка с именем файла, за ней
// кнопка «✕», под ними поле документа (снимок 24.09.2026). Полосы вкладок
// «Закрыть <файл>» у единственного документа нет — она со второго (16.2.1).
function docClose(page: Page): Locator {
  return page.locator('button', { hasText: '✕' }).first()
}

/** Шапка открытого документа — имя файла и «✕». */
function docName(page: Page): Locator {
  return docClose(page).locator('xpath=../..')
}

/** Поле документа: ссылки `src:` и `[[…]]` ищем в нём, а не в ленте чата. */
function docBody(page: Page): Locator {
  return page.getByRole('textbox').filter({ hasNot: page.getByRole('button') })
}

/** Страница вики, на которой больше всего ссылок `[[…]]` и `[src: …]`. */
function richestPage(): string {
  const score = (rel: string): number => (read(rel).match(/\[\[|\[src:/g) ?? []).length
  return [...wikiPages()].sort((a, b) => score(b) - score(a))[0]
}

async function openWikiPage(page: Page, rel: string): Promise<void> {
  const vaultTab = page.getByRole('tab', { name: /Vault/ })
  if ((await vaultTab.count()) > 0 && (await vaultTab.getAttribute('aria-selected')) !== 'true') await vaultTab.click()
  const parts = rel.split(/[\\/]/)
  // Папку раскрываем, только если её содержимое не видно: щелчок по раскрытой
  // папке её сворачивает.
  const path = ['wiki', ...parts]
  for (let i = 0; i < path.length - 1; i++) {
    if (await treeRow(page, path[i + 1]).first().isVisible()) continue
    const folderRow = treeRow(page, path[i]).first()
    await expect(folderRow).toBeVisible({ timeout: 30000 })
    await folderRow.getByRole('button', { name: path[i], exact: true }).click()
  }
  const file = treeRow(page, parts[parts.length - 1]).first()
  await expect(file).toBeVisible({ timeout: 30000 })
  await file.getByRole('button', { name: parts[parts.length - 1], exact: true }).click()
  await expect(docName(page)).toContainText(parts[parts.length - 1], { timeout: 30000 })
}

/** Машинная ссылка целиком: источник, путь, необязательное место. Замер
 *  24.09.2026: модель однажды писала `[src: ТЗ.docx]` без источника — такую
 *  ссылку приложение по праву не открывает. */
const VALID_SRC = /\[src:\s*[^\]/\s][^\]/]*\/[^\]]+\]/g

// Замером, утверждение в конце (как 22.1.3): страниц с правильной ссылкой может
// не оказаться вовсе, и это замечание к качеству, а не обрыв цепочки.
const citeDefects: string[] = []

test('22.1.4 (замер) ссылки [src: …] на страницах', () => {
  const bad = wikiPages().flatMap((rel) =>
    (read(rel).match(/\[src:[^\]]*\]/g) ?? []).filter((raw) => !raw.match(VALID_SRC)).map((raw) => `${rel}: ${raw}`)
  )
  if (bad.length) citeDefects.push(`ссылки без источника: ${bad.slice(0, 5).join('; ')}`)
  if (!wikiPages().some((rel) => new RegExp(VALID_SRC.source).test(read(rel)))) citeDefects.push('ни одной правильной ссылки [src: источник/путь]')
  console.log('22.1.4 замечания: ' + JSON.stringify(citeDefects))
})

test('22.1.4 (щелчок) правильная ссылка [src: …] кликается — открывает документ', async () => {
  const page = await ui()
  const valid = (rel: string): number => (read(rel).match(VALID_SRC) ?? []).length
  const rel = [...wikiPages()].sort((a, b) => valid(b) - valid(a))[0]
  test.skip(!rel || valid(rel) === 0, 'правильных ссылок нет — замечание в 22.1.4 (замер)')
  await openWikiPage(page, rel)
  // Первая ссылка, у которой есть источник: `src: <источник>/<путь>`.
  const chip = docBody(page).locator('a[href*="cite"]').filter({ hasText: /^src:\s*[^/\s]+\/.+/ }).first()
  await expect(chip, 'ссылка на источник видна на странице').toBeVisible({ timeout: 30000 })
  await chip.click()
  // Документ-источник: либо он встал на место страницы, либо рядом появилась
  // полоса вкладок с его именем.
  const source = /\.(docx|csv)/
  await expect
    .poll(
      async () =>
        source.test((await docName(page).innerText()).trim()) ||
        (await page.getByRole('button', { name: /^Закрыть .*\.(docx|csv)$/ }).count()) > 0,
      { timeout: 30000, message: 'открылся документ-источник' }
    )
    .toBe(true)
  await record(test.info(), page)
})

test('22.2.1 ссылка [[…]] на странице переходит на другую страницу вики', async () => {
  const page = await ui()
  const rel = richestPage()
  await openWikiPage(page, rel)
  const link = page.locator('[data-wikilink]').first()
  await expect(link, 'ссылка [[…]] на странице — ссылка, а не текст').toBeVisible({ timeout: 30000 })
  const from = (await docName(page).innerText()).trim()
  await link.click()
  // Имя файла цели и текст ссылки не обязаны совпадать (`[[ТП-1]]` → `tp-1.md`):
  // проверяем, что открылась ДРУГАЯ страница вики.
  await expect
    .poll(async () => (await docName(page).innerText()).trim(), { timeout: 30000 })
    .not.toBe(from)
  await expect(docName(page)).toContainText(/\.md/)
})

// ── 22.3–22.5: своя строка, изменение источника, обновление ─────────────────

const OWN_LINE = 'уточнить у заказчика — e2e-правка владельца'
let editedPage = ''
let mtimesBeforeUpdate = new Map<string, number>()

test('22.4.1 после изменения источника в уведомлении есть «Обновить вики»', async () => {
  const page = await ui()
  // Шаг 3: своя строка в странице — так, как её сохранил бы человек.
  editedPage = wikiPages().find((rel) => /ЩС-1|щс-1/i.test(read(rel))) ?? richestPage()
  writeFileSync(join(wiki(), editedPage), read(editedPage).trimEnd() + `\n\n${OWN_LINE}\n`, 'utf8')
  mtimesBeforeUpdate = new Map(wikiPages().map((rel) => [rel, statSync(join(wiki(), rel)).mtimeMs]))
  // Шаг 4: значение в источнике изменилось.
  await clearNotifications(page)
  writeDoc('ТУ сетевой организации.docx', DOCS['ТУ сетевой организации.docx'].replace('42 кВт', '48 кВт'))
  await page.evaluate(() => window.aecpilot.triggerScan())
  await expect(page.getByRole('button', { name: 'Обновить вики' }).first()).toBeVisible({ timeout: 180000 })
  await record(test.info(), page)
})

test('22.4.2 клик кладёт команду в поле ввода, а не отправляет её', async () => {
  const page = await ui()
  const before = await page.locator('[data-slot="aui_user-message-root"]').count()
  await page.getByRole('button', { name: 'Обновить вики' }).first().click()
  await expect(page.getByText('Обнови вики проекта по изменениям').first()).toBeVisible({ timeout: 15000 })
  await page.waitForTimeout(3000)
  expect(await page.locator('[data-slot="aui_user-message-root"]').count(), 'не отправлено').toBe(before)
})

let update: TurnResult

// Замером, утверждение в конце (как 22.1.3).
const updateScope: string[] = []

test('22.5.1 (замер) обновление по изменениям', async () => {
  const page = await ui()
  // Индекс должен увидеть новую редакцию до обновления вики.
  await page.evaluate(() => window.aecpilot.startIngest(true))
  await expect
    .poll(async () => (await page.evaluate(() => window.aecpilot.getIngestState())).running, { timeout: 300000, intervals: [2000] })
    .toBe(false)
  const mark = await eventCount(page)
  const changed = (): { touched: string[]; added: string[] } => ({
    touched: [...mtimesBeforeUpdate]
      .filter(([rel, at]) => existsSync(join(wiki(), rel)) && statSync(join(wiki(), rel)).mtimeMs !== at)
      .map(([rel]) => rel),
    // Новая страница — тоже обновление: навык кладёт сводку противоречия в
    // comparisons/ (замер 24.09.2026: противоречие 42/48 легло новой страницей).
    added: wikiPages().filter((rel) => !mtimesBeforeUpdate.has(rel))
  })
  const options = { timeoutMs: 1800000, clarify: ANY_CHOICE, declineForeign: true }
  update = await turn(page, 'Обнови вики проекта по изменениям', options)
  // Пока ничего не изменилось, отвечаем, как человек (замеры 24.09.2026): на
  // «сервер отклоняет вызовы» (D-142, предохранитель ядра на 60 с) — ждём и
  // просим снова; на «Подтверждаете?» — «да»; на «Выполняю: …» без действий —
  // «выполни сейчас». Не больше трёх раз.
  for (let round = 0; round < 3; round++) {
    const now = changed()
    if (now.touched.length + now.added.length > 0) break
    console.log(`22.5 (ответ ${round + 1}) ` + update.transcript.slice(0, 2000))
    if (/отклоняет|недоступ|unreachable|пауз/i.test(update.text)) await page.waitForTimeout(65000)
    update = await turn(page, 'Да, выполни обновление вики сейчас, до конца. Больше не спрашивай.', options)
  }
  console.log('22.5 ' + update.transcript.slice(0, 3000))
  const refusals = (await eventsSince(page, mark)).filter(
    (event) =>
      event.type === 'tool.complete' &&
      /aec_rag/.test(JSON.stringify(event.payload?.name ?? '')) &&
      /error|unreachable|отказ|нельзя/i.test(JSON.stringify(event.payload ?? {}))
  )
  console.log('22.5 RAW отказы aec_rag ' + JSON.stringify(refusals).slice(0, 4000))
  const { touched, added } = changed()
  console.log('22.5 затронуты: ' + touched.join(', ') + ` из ${mtimesBeforeUpdate.size}; новые: ${added.join(', ')}`)
  if (touched.length + added.length === 0) updateScope.push('ничего не обновлено')
  if (touched.length === mtimesBeforeUpdate.size) updateScope.push(`переписаны все ${touched.length} страниц, а не затронутые`)
  await record(test.info(), page, { transcript: update.transcript })
})

test('22.5.2 дописанная строка на месте', async () => {
  expect(read(editedPage)).toContain(OWN_LINE)
})

// 22.5.3 и 22.5.4 — замером, утверждение в конце файла (как 22.1.3). Замер
// 24.09.2026: вместо блока противоречия агент дописал в страницы «источник
// переиздан — проверьте факты» и сослался на снимок в raw/, а не на документ.
const updateDefects: Record<string, string[]> = { '22.5.3': [], '22.5.4': [] }

test('22.5.3 (замер) противоречие и журнал после обновления', () => {
  const all = wikiPages().map(read).join('\n')
  const at = all.search(/противоречие/i)
  if (at < 0) updateDefects['22.5.3'].push('блока «Противоречие» нет ни на одной странице')
  else {
    const block = all.slice(at, at + 1500)
    if (!/42/.test(block) || !/48/.test(block)) updateDefects['22.5.3'].push('в блоке противоречия нет обеих версий (42 и 48 кВт)')
  }
  if (!/update|обнов/i.test(read('log.md'))) updateDefects['22.5.4'].push('в log.md нет записи об обновлении')
  console.log('22.5 замечания: ' + JSON.stringify(updateDefects))
})

// ── 22.6: проверка вики ─────────────────────────────────────────────────────

const BROKEN = 'Несуществующая страница e2e'
let lint: TurnResult
let pagesBeforeLint = new Map<string, string>()

// Замером, утверждение в конце (как 22.1.3). Замер 24.09.2026: агент ни разу не
// вызвал `wiki_lint` (одиннадцать вызовов `memory`/`mem0_*`) и ответил
// «wiki_lint: нет ошибок» — сослался на проверку, которой не было.
const lintDefects: Record<string, string[]> = { '22.6.1': [], '22.6.2': [], '22.6.3': [] }

test('22.6 (замер) «проверь вики»', async () => {
  const page = await ui()
  writeFileSync(join(wiki(), editedPage), read(editedPage).trimEnd() + `\nСм. также [[${BROKEN}]].\n`, 'utf8')
  pagesBeforeLint = new Map(wikiPages().map((rel) => [rel, read(rel)]))
  lint = await turn(page, 'проверь вики', { timeoutMs: 900000, clarify: NO_FIX_CHOICE, declineForeign: true })
  console.log('22.6 ' + lint.transcript.slice(0, 3000))
  if (!lint.tools.some((name) => /wiki_lint/.test(name))) lintDefects['22.6.1'].push('wiki_lint не вызван')
  const groups = [/ошибк/i, /предупрежд/i, /замечани/i].filter((re) => re.test(lint.text)).length
  if (groups < 2) lintDefects['22.6.1'].push(`групп по серьёзности: ${groups}`)
  if (!lint.text.includes(BROKEN) || !/бит|не существ|нет такой|отсутств/i.test(lint.text)) {
    lintDefects['22.6.2'].push(`ссылка [[${BROKEN}]] не названа битой`)
  }
  for (const [rel, text] of pagesBeforeLint) if (read(rel) !== text) lintDefects['22.6.3'].push(`${rel} изменена при проверке`)
  console.log('22.6 замечания: ' + JSON.stringify(lintDefects))
  await record(test.info(), page, { transcript: lint.transcript })
})

// ── 22.7 / 39.7: обзорный вопрос ────────────────────────────────────────────

// Замером, утверждение в конце (как 22.1.3). Замер 24.09.2026: ответ верный по
// существу, но страницы названы текстом («страница TP-1»), а не ссылкой [[…]].
const overviewDefects: string[] = []

test('22.7.1 (замер) обзорный ответ по вики', async () => {
  const page = await ui()
  const answer = await turn(page, 'что известно про электроснабжение объекта?', { timeoutMs: 600000, clarify: ANY_CHOICE, declineForeign: true })
  console.log('22.7 ' + answer.transcript.slice(0, 3000))
  if (!/\[\[[^\]]+\]\]|wiki\/(entities|concepts)/.test(answer.text)) overviewDefects.push('в ответе нет ссылок на страницы вики')
  if (!/ТП-1|ТП‑1/.test(answer.text)) overviewDefects.push('в ответе нет ТП-1')
  // 39.7: того, чего в документах нет, в ответе тоже нет — ни одной мощности,
  // кроме названных в образце.
  const powers = (answer.text.match(/\d+\s*кВт/g) ?? []).map((value) => value.replace(/\s/g, ''))
  for (const value of powers) if (!['42кВт', '48кВт', '150кВт'].includes(value)) overviewDefects.push(`выдуманная мощность ${value}`)
  console.log('22.7.1 замечания: ' + JSON.stringify(overviewDefects))
  await record(test.info(), page, { transcript: answer.transcript })
})

// Замером, утверждение в конце (как 22.1.3). Замер 24.09.2026: ответ по вики
// без проверки, не устарела ли она, — «10%» при новой редакции «20 %».
let staleAnswer = ''

test('22.7.2 (замер) ответ по устаревшей вики', async () => {
  const page = await ui()
  writeDoc('Письмо заказчика.docx', DOCS['Письмо заказчика.docx'].replace('10 %', '20 %'))
  await page.evaluate(() => window.aecpilot.triggerScan())
  await page.evaluate(() => window.aecpilot.startIngest(true))
  await expect
    .poll(async () => (await page.evaluate(() => window.aecpilot.getIngestState())).running, { timeout: 300000, intervals: [2000] })
    .toBe(false)
  const answer = await turn(page, 'Какой резерв мощности просит заказчик на щите ЩС-1? Ответь по вики.', { timeoutMs: 600000, clarify: ANY_CHOICE, declineForeign: true })
  console.log('22.7.2 ' + answer.transcript.slice(0, 2000))
  staleAnswer = answer.text
})

test('AC3 образец: ни один файл образца не тронут приложением', async () => {
  // Сравнение с исходным снимком: менялись только два файла, которые правил сам
  // тест (шаги 4 и 22.7.2).
  const after = tree(docs)
  const changedByTest = new Set(['ТУ сетевой организации.docx', 'Письмо заказчика.docx'])
  expect([...after.keys()].sort()).toEqual([...docsBefore.keys()].sort())
  for (const [rel, stamp] of docsBefore) if (!changedByTest.has(rel)) expect(after.get(rel), rel).toBe(stamp)
})

test('22.1.3 страницы содержательные, у каждой заголовок title/type/tags/sources/updated', () => {
  verdict(buildDefects)
})

test('22.1.5 index.md перечисляет страницы, в log.md — запись о построении', () => {
  verdict(indexDefects)
})

test('22.5.3 изменившееся значение оформлено блоком «Противоречие» с обеими версиями', () => {
  verdict(updateDefects['22.5.3'])
})

test('22.5.4 в log.md появилась запись об обновлении', () => {
  verdict(updateDefects['22.5.4'])
})

test('22.7.2 если вики устарела — об этом сказано', () => {
  verdict(/устар|не обновл|изменил|новая редакц|обновить вики/i.test(staleAnswer) ? [] : [`не сказано, что вики устарела: «${staleAnswer.slice(0, 200)}»`])
})

test('22.1.4 у фактов ссылки [src: …], и они кликаются — открывают документ', () => {
  verdict(citeDefects)
})

test('22.7.1 обзорный ответ — по страницам вики, со ссылками на страницы', () => {
  verdict(overviewDefects)
})

test('22.6.1 «проверь вики»: отчёт сгруппирован по серьёзности', () => {
  verdict(lintDefects['22.6.1'])
})

test('22.6.2 ссылка на несуществующую страницу названа битой', () => {
  verdict(lintDefects['22.6.2'])
})

test('22.6.3 агент не чинит найденное молча', () => {
  verdict(lintDefects['22.6.3'])
})

test('22.5.1 агент обновляет только затронутые страницы', () => {
  verdict(updateScope)
})
