// Фаза 3L (задача 3L.10) на ЖИВОМ стенде: граф по образцу КР получает типы
// сущностей КР (3L.7), карта документов связывает КР с отчётом ИГИ по шифру
// (3L.8), вкладка «Граф» рисует её (3L.9), а в дереве источников у файла —
// значки и действия «Убрать из индекса» / «Индексировать» (3L.6).
//
// Граф строится по двум маленьким документам — вызов модели на фрагмент стоит
// денег, поэтому только они.

import { mkdtempSync, writeFileSync } from 'node:fs'
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

const stand = standFixture({ mode: 'live', label: 'live-3l', providerKeyInStore: true })

const KR = '297-2024-КР Пояснительная записка.md'
const IGI = '297-1-ИГИ Отчёт об изысканиях.md'

const source = mkdtempSync(join(tmpdir(), 'aecpilot-e2e-3l-'))
writeFileSync(
  join(source, KR),
  [
    '# Конструктивные решения',
    '',
    'Фундамент — монолитная железобетонная плита толщиной 600 мм из бетона B25 W6 F150,',
    'армирование — арматура А500С. Основание плиты — ИГЭ-2 (суглинок тугопластичный)',
    'по отчёту об инженерно-геологических изысканиях 297-1-ИГИ.',
    '',
    'Колонны сечением 400×400 мм, перекрытия — плиты толщиной 200 мм. Расчёт плиты',
    'на продавливание выполнен по СП 63.13330.2018.',
    ''
  ].join('\n'),
  'utf8'
)
writeFileSync(
  join(source, IGI),
  [
    '# Отчёт об инженерно-геологических изысканиях',
    '',
    'На участке выделен ИГЭ-2: суглинок тугопластичный, модуль деформации 18 МПа.',
    'Уровень грунтовых вод — на отметке −3,200. Заказчик — ООО «Пример».',
    ''
  ].join('\n'),
  'utf8'
)

/** `ENTITY_TYPES_GUIDANCE` (rag_index.py) — как LightRAG их хранит: строчными. */
const KR_TYPES = [
  'документ',
  'норматив',
  'конструкция',
  'узел',
  'материал',
  'нагрузка',
  'параметр',
  'расчёт',
  'грунт',
  'место',
  'организация',
  'работа',
  'прочее'
]

let prepared = false
let sourceId = ''

async function waitIngest(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        const state = (await page.evaluate(() => window.aecpilot.getIngestState())) as {
          lastReport?: { files_total: number } | null
          running: boolean
        }
        return !state.running && state.lastReport ? 'готово' : 'идёт'
      },
      { timeout: 300000, intervals: [2000], message: 'индексация закончилась' }
    )
    .toBe('готово')
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
  await waitIngest(page)

  const started = (await page.evaluate(
    (id) => window.aecpilot.startGraphAdd(id, '', 'folder'),
    sourceId
  )) as { error?: string; started: boolean }
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
    .toBe('добавлено: 2')
  return page
}

async function openGraphTab(page: Page): Promise<void> {
  await page
    .locator('[data-tour="sessions-sidebar"]')
    .getByRole('button', { name: /^Индекс/ })
    .first()
    .click()
  await expect(page.getByRole('region', { name: 'Индекс', exact: true })).toBeVisible({
    timeout: 15000
  })
  await page.getByRole('tab', { name: 'Граф' }).click()
}

test('3L.7 граф по образцу КР: сущности получают типы КР', async () => {
  const page = await ui()
  const exported = (await page.evaluate(() => window.aecpilot.exportGraph())) as {
    graph: { nodes: { label: string; type: string }[] }
    ok: boolean
  }
  expect(exported.ok).toBe(true)
  const types = exported.graph.nodes.map((node) => node.type)
  const kr = types.filter((type) => KR_TYPES.includes(type))
  test.info().annotations.push({
    type: 'типы сущностей',
    description: JSON.stringify(
      Object.fromEntries(
        [...new Set(types)].map((type) => [type, types.filter((t) => t === type).length])
      )
    )
  })
  expect(types.length).toBeGreaterThan(0)
  // Модель вправе ошибиться в одной-двух сущностях; граф с прежними типами
  // LightRAG (person, artifact, concept…) не набрал бы и половины.
  expect(kr.length / types.length).toBeGreaterThanOrEqual(0.8)
  expect(types.some((type) => ['конструкция', 'материал', 'грунт'].includes(type))).toBe(true)
})

test('3L.8 карта документов: КР ссылается на ИГИ по шифру, общие сущности — ребром', async () => {
  const page = await ui()
  const answer = (await page.evaluate(() => window.aecpilot.exportDocumentMap())) as {
    map: {
      edges: { code?: string; kind: string; source: string; target: string; weight: number }[]
      nodes: { code: null | string; id: string }[]
    }
    ok: boolean
  }
  expect(answer.ok, JSON.stringify(answer)).toBe(true)
  const kr = `${sourceId}/${KR}`
  const igi = `${sourceId}/${IGI}`
  expect(answer.map.nodes.map((node) => [node.id, node.code]).sort()).toEqual(
    [
      [igi, '297-1-ИГИ'],
      [kr, '297-2024-КР']
    ].sort()
  )
  expect(
    answer.map.edges
      .filter((edge) => edge.kind === 'refers')
      .map((edge) => [edge.source, edge.target, edge.code])
  ).toEqual([[kr, igi, '297-1-ИГИ']])
  test.info().annotations.push({
    type: 'общих сущностей',
    description: String(answer.map.edges.find((edge) => edge.kind === 'shared')?.weight ?? 0)
  })
})

test('3L.9 вкладка «Граф» открывается картой документов; поиск и «на весь экран»', async () => {
  const page = await ui()
  await openGraphTab(page)
  await expect(page.getByRole('button', { name: 'Документы' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await expect(page.getByRole('img', { name: 'Карта документов' })).toBeVisible({ timeout: 30000 })
  await expect(page.getByText(/Документов: 2, связей: \d+/)).toBeVisible()
  await expect(page.locator('[data-testid="index-graph-canvas"] canvas').first()).toBeVisible({
    timeout: 30000
  })
  await page.getByRole('searchbox', { name: 'Поиск по имени' }).fill('ИГИ')
  await record(test.info(), page)

  await page.getByRole('button', { name: 'На весь экран' }).click()
  // Слой на всё окно (полноэкранный режим ОС закрыт политикой разрешений 3.7a).
  const layer = page.getByRole('dialog', { name: 'Граф на всё окно' })
  await expect(layer).toBeVisible()
  const box = await layer.boundingBox()
  const viewport = await page.evaluate(() => [window.innerWidth, window.innerHeight])
  expect([Math.round(box?.width ?? 0), Math.round(box?.height ?? 0)]).toEqual(viewport)
  await page.keyboard.press('Escape')
  await expect(layer).toBeHidden()

  await page.getByRole('button', { name: 'Сущности' }).click()
  await expect(page.getByRole('img', { name: 'Граф знаний' })).toBeVisible({ timeout: 30000 })
})

function fileRow(page: Page, rel: string): { button: Locator; row: Locator } {
  const button = page.locator(`button[title="${rel}"]`).first()
  return { button, row: button.locator('..') }
}

async function openSourceTree(page: Page): Promise<void> {
  const vaultTab = page.getByRole('tab', { name: /Vault/ })
  await expect(vaultTab).toBeVisible({ timeout: 30000 })
  if ((await vaultTab.getAttribute('aria-selected')) !== 'true') await vaultTab.click()
  const { button } = fileRow(page, IGI)
  if (!(await button.isVisible())) {
    await page
      .locator(`button[title="${source.replace(/\\/g, '\\\\')}"]`)
      .first()
      .click()
  }
  await expect(button).toBeVisible({ timeout: 30000 })
}

test('3L.6 дерево источников: значки, «Убрать из индекса» с вопросом, «Индексировать» возвращает', async () => {
  const page = await ui()
  await openSourceTree(page)
  const { button, row } = fileRow(page, IGI)
  await expect(row.getByRole('img', { name: 'В индексе' })).toBeVisible({ timeout: 30000 })
  await expect(row.getByRole('img', { name: 'в графе' })).toBeVisible()

  await button.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Убрать из индекса' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible({ timeout: 10000 })
  await dialog.getByRole('button', { name: 'Убрать из индекса' }).click()
  await expect
    .poll(() => page.evaluate(() => window.aecpilot.listIndexExclude()), { timeout: 60000 })
    .toEqual([`${sourceId}/${IGI}`])
  await expect(row.getByRole('img', { name: 'убран из индекса' })).toBeVisible({ timeout: 30000 })
  await record(test.info(), page)

  await button.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Индексировать' }).click()
  await expect
    .poll(() => page.evaluate(() => window.aecpilot.listIndexExclude()), { timeout: 60000 })
    .toEqual([])
  await waitIngest(page)
  await openSourceTree(page)
  await expect(fileRow(page, IGI).row.getByRole('img', { name: 'В индексе' })).toBeVisible({
    timeout: 60000
  })
})
