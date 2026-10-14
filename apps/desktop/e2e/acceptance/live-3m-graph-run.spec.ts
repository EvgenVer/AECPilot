// Фаза 3M (задача 3M.8) на ЖИВОМ стенде: построение графа по большому
// документу показывает ход внутри него — «фрагмент i из K · извлечено
// сущностей S» (3M.4, приёмка 46.7.2), — и «Остановить построение» гасит его
// сразу: готовое остаётся, начатый документ назван (3M.5, приёмка 46.7.1).
//
// Документ — около тридцати фрагментов; остановка приходит после первых, так
// что модель зовётся несколько раз, а не тридцать.

import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import {
  addSourceAsUser,
  hideFirstRunSurfaces,
  mainWindow,
  openProject,
  standFixture
} from '../lib/app'
import { record } from '../lib/evidence'

test.describe.configure({ mode: 'serial' })

const stand = standFixture({ mode: 'live', label: 'live-3m', providerKeyInStore: true })

const BIG = '297-3-КР Расчёт плит перекрытия.md'

const source = mkdtempSync(join(tmpdir(), 'aecpilot-e2e-3m-'))
const sections: string[] = []
for (let floor = 1; floor <= 30; floor += 1) {
  sections.push(`# Плита перекрытия этажа ${floor}`, '')
  for (let line = 1; line <= 9; line += 1) {
    sections.push(
      `Плита П-${floor}.${line} толщиной ${180 + line * 10} мм из бетона B${20 + (line % 3) * 5}, ` +
        `армирование — арматура А500С шагом ${100 + line * 25} мм, нагрузка ${floor + line} кПа, ` +
        `опирание на колонны К-${floor}.${line} сечением 400×400 мм по оси ${line}.`
    )
  }
  sections.push('')
}
writeFileSync(join(source, BIG), sections.join('\n'), 'utf8')

let sourceId = ''

async function ui(): Promise<Page> {
  const page = await mainWindow(stand.get())
  await hideFirstRunSurfaces(page)
  if (sourceId) return page

  await openProject(stand.get(), page)
  expect(await addSourceAsUser(stand.get(), page, source)).toMatchObject({ ok: true })
  const sources = (await page.evaluate(() => window.aecpilot.listSources())) as { id: string }[]
  sourceId = sources[0].id
  await page.evaluate(() => window.aecpilot.startIngest(true))
  await expect
    .poll(
      async () => {
        const state = (await page.evaluate(() => window.aecpilot.getIngestState())) as {
          lastReport?: { chunks: number } | null
          running: boolean
        }
        return !state.running && state.lastReport ? state.lastReport.chunks : -1
      },
      { timeout: 300000, intervals: [2000], message: 'индексация закончилась' }
    )
    .toBeGreaterThanOrEqual(20)
  return page
}

test('3M.4–3M.5 большой документ: ход по фрагментам, «Остановить построение» — сразу', async () => {
  const page = await ui()
  await page
    .locator('[data-tour="sessions-sidebar"]')
    .getByRole('button', { name: /^Индекс/ })
    .first()
    .click()
  await page.getByRole('tab', { name: 'Граф' }).click()

  const started = (await page.evaluate(
    (id) => window.aecpilot.startGraphAdd(id, '', 'folder'),
    sourceId
  )) as { error?: string; started: boolean }
  expect(started, JSON.stringify(started)).toMatchObject({ started: true })

  const line = page.getByText(
    /^Строю граф: документ 1 из 1 · фрагмент \d+ из \d+ · извлечено сущностей: \d+$/
  )
  await expect(line).toBeVisible({ timeout: 180000 })
  const said = (await line.textContent()) ?? ''
  const [, chunk, chunks] = said.match(/фрагмент (\d+) из (\d+)/) ?? []
  expect(Number(chunks)).toBeGreaterThanOrEqual(20)
  expect(Number(chunk)).toBeLessThan(Number(chunks))
  await expect(page.getByRole('button', { name: 'Перестроить граф' })).toBeDisabled()
  await record(test.info(), page)

  const stop = page.getByRole('button', { name: 'Остановить построение' })
  await expect(stop).toHaveAttribute('title', /начатый будет построен заново/)
  const pressed = Date.now()
  await stop.click()
  await expect(
    page.getByText(
      `Построение графа остановлено: готово 0 из 1. «${BIG}» будет построен заново при следующем запуске.`
    )
  ).toBeVisible({ timeout: 30000 })
  test.info().annotations.push({ type: 'остановка, мс', description: String(Date.now() - pressed) })
  const state = (await page.evaluate(() => window.aecpilot.getGraphAddState())) as {
    error: null | string
    running: boolean
    stopped: null | { done: number; interrupted: null | string; total: number }
  }
  expect(state).toMatchObject({
    error: null,
    running: false,
    stopped: { done: 0, interrupted: BIG, total: 1 }
  })
  await expect(page.getByRole('button', { name: 'Перестроить граф' })).toBeEnabled()
  await record(test.info(), page)
})
