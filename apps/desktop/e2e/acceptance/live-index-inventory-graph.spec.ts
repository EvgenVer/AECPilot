// Фаза 3J (задача 3J.15) на ЖИВОМ стенде: опись индекса, ошибка файла словами,
// «Повторить» на один файл, значок строки «Индекс» и вкладка «Граф».
//
// Источник — три файла, по одному на каждый исход: таблица CSV читается,
// записка `.txt` пропускается (формат, D-199), «PDF» из мусора не разбирается.
// Граф строится по одному маленькому документу — вызов модели на фрагмент стоит
// денег, поэтому только он.

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test, type Locator, type Page } from '@playwright/test'

import {
  addSourceAsUser,
  hideFirstRunSurfaces,
  mainWindow,
  openProject,
  standFixture
} from '../lib/app'
import { record } from '../lib/evidence'

test.describe.configure({ mode: 'serial' })

const stand = standFixture({ mode: 'live', label: 'live-3j', providerKeyInStore: true })

const GOOD = 'паспорт объекта.csv'
const NOTE = 'Изыскания/заметки.txt'
const BROKEN = 'битый.pdf'

const source = mkdtempSync(join(tmpdir(), 'aecpilot-e2e-3j-'))
writeFileSync(
  join(source, GOOD),
  'Поле;Значение\nОбъект;Жилой дом на Нагатинской\nЗаказчик;ООО «Пример»\nГенпроектировщик;ООО «Прогресс Проект»\n',
  'utf8'
)
mkdirSync(join(source, 'Изыскания'))
writeFileSync(join(source, NOTE), 'Записка инженера: сваи С-1 по ИГЭ-2.\n', 'utf8')
writeFileSync(join(source, BROKEN), '%PDF-1.4\nэто не PDF, а мусор\n', 'utf8')

const CODES = [
  'source_detached',
  'unsupported',
  'file_unreadable',
  'parse_failed',
  'ocr_failed',
  'not_indexed',
  'provider_missing',
  'provider_key',
  'provider_limit',
  'provider_unreachable',
  'graph_failed',
  'unknown'
]

interface Report {
  files_failed: number
  files_total: number
}
interface IngestState {
  failure: unknown
  lastReport?: Report | null
  running: boolean
}
interface InventoryFile {
  errors: { code: string; stage: string }[]
  graph: string
  index: string
  reason: null | string
  rel_path: string
}

let prepared = false
let sourceId = ''

async function waitIngest(page: Page): Promise<Report> {
  await expect
    .poll(
      async () => {
        const state = (await page.evaluate(() => window.aecpilot.getIngestState())) as IngestState
        return !state.running && state.lastReport ? state.lastReport.files_total : 0
      },
      { timeout: 300000, intervals: [2000], message: 'индексация закончилась' }
    )
    .toBeGreaterThan(0)
  const state = (await page.evaluate(() => window.aecpilot.getIngestState())) as IngestState
  return state.lastReport as Report
}

async function inventory(page: Page): Promise<Map<string, InventoryFile>> {
  const answer = (await page.evaluate(() => window.aecpilot.getIndexInventory())) as {
    inventory?: { files: InventoryFile[] }
    ok: boolean
  }
  expect(answer.ok, JSON.stringify(answer)).toBe(true)
  return new Map((answer.inventory?.files ?? []).map((file) => [file.rel_path, file]))
}

async function ui(): Promise<Page> {
  const page = await mainWindow(stand.get())
  await hideFirstRunSurfaces(page)
  if (prepared) return page
  prepared = true

  await openProject(stand.get(), page)
  expect(await addSourceAsUser(stand.get(), page, source)).toMatchObject({ ok: true })
  const sources = (await page.evaluate(() => window.aecpilot.listSources())) as { id: string }[]
  sourceId = sources[0].id
  await page.evaluate(() => window.aecpilot.startIngest(true))
  const report = await waitIngest(page)
  expect(report.files_failed, JSON.stringify(report)).toBe(1)
  return page
}

/** Строка «Индекс» боковой панели (подпись может нести ход или «требует внимания»). */
function indexRow(page: Page): Locator {
  return page
    .locator('[data-tour="sessions-sidebar"]')
    .getByRole('button', { name: /^Индекс/ })
    .first()
}

async function openIndex(page: Page): Promise<void> {
  await indexRow(page).click()
  await expect(page.getByRole('region', { name: 'Индекс', exact: true })).toBeVisible({
    timeout: 15000
  })
}

test('3J.8 опись: прочитан, пропущен по формату, ошибка — кодом из закрытого списка', async () => {
  const page = await ui()
  const files = await inventory(page)

  expect(files.get(GOOD)).toMatchObject({ errors: [], index: 'indexed' })
  expect(files.get(NOTE)).toMatchObject({ index: 'skipped', reason: 'unsupported' })
  const broken = files.get(BROKEN)
  expect(broken?.index).toBe('failed')
  expect(broken?.errors[0]?.stage).toBe('index')
  expect(CODES).toContain(broken?.errors[0]?.code)
  test.info().annotations.push({ type: 'код ошибки', description: broken?.errors[0]?.code ?? '' })
})

test('3J.10 страница «Индекс»: дерево, причина словами, «только требующие внимания»', async () => {
  const page = await ui()
  await openIndex(page)
  const tree = page.getByRole('tree', { name: 'Состав индекса' })
  await expect(tree).toBeVisible({ timeout: 30000 })
  await expect(page.getByText(/Файлов: 3, в индексе: 1, требуют внимания: 2/)).toBeVisible()

  await page.getByLabel('Только требующие внимания').check()
  await expect(tree.getByText(BROKEN)).toBeVisible()
  await expect(tree.getByText('заметки.txt')).toBeVisible()
  await expect(tree.getByText('пропущен: формат не читается')).toBeVisible()
  await expect(tree.getByText(/^Индексация: /)).toBeVisible()
  await expect(tree.getByText(GOOD)).toHaveCount(0)
  await record(test.info(), page)
})

test('3J.10 «Повторить» индексирует только этот файл', async () => {
  const page = await ui()
  await openIndex(page)
  const tree = page.getByRole('tree', { name: 'Состав индекса' })
  await page.getByLabel('Только требующие внимания').check()
  await tree.getByRole('button', { name: 'Повторить' }).click()

  const report = await waitIngest(page)
  expect(report).toMatchObject({ files_failed: 1, files_total: 1 })
})

test('3J.11 строка «Индекс» в боковой панели говорит, что требует внимания', async () => {
  const page = await ui()
  await expect(indexRow(page)).toContainText('требует внимания', {
    timeout: 15000
  })
})

test('3J.13–3J.14 граф одного документа: сущности с документом, вкладка рисует', async () => {
  const page = await ui()
  const started = (await page.evaluate(
    ([id, rel]) => window.aecpilot.startGraphAdd(id, rel, 'file'),
    [sourceId, GOOD] as const
  )) as { started: boolean; error?: string }
  expect(started, JSON.stringify(started)).toMatchObject({ started: true })
  await expect
    .poll(
      async () => {
        const state = (await page.evaluate(() => window.aecpilot.getGraphAddState())) as {
          error: null | string
          lastReport: { documents_added: number } | null
          running: boolean
        }
        if (state.running) return 'идёт'
        return state.error ?? `добавлено: ${state.lastReport?.documents_added ?? 0}`
      },
      { timeout: 600000, intervals: [3000], message: 'граф построен' }
    )
    .toBe('добавлено: 1')

  const exported = (await page.evaluate(() => window.aecpilot.exportGraph())) as {
    graph: {
      documents: { rel_path: string }[]
      nodes: { documents: { rel_path: string }[] }[]
    }
    ok: boolean
  }
  expect(exported.ok).toBe(true)
  expect(exported.graph.nodes.length).toBeGreaterThan(0)
  expect(exported.graph.documents.map((doc) => doc.rel_path)).toContain(GOOD)
  expect((await inventory(page)).get(GOOD)?.graph).toBe('in')

  await openIndex(page)
  await page.getByRole('tab', { name: 'Граф' }).click()
  await expect(page.getByRole('img', { name: 'Граф знаний' })).toBeVisible({ timeout: 30000 })
  await expect(page.getByText(/Сущностей: \d+, связей: \d+/)).toBeVisible()
  await expect(page.locator('[data-testid="index-graph-canvas"] canvas').first()).toBeVisible({
    timeout: 30000
  })
  await page.getByRole('combobox').selectOption(`${sourceId}/${GOOD}`)
  await expect(page.getByText(/Сущностей: \d+/)).toBeVisible({ timeout: 30000 })
  await record(test.info(), page)
})
