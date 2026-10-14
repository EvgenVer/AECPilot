// Блок 40 чек-листа (задача 3F.9): «Добавить в граф знаний» из проводника на
// ЖИВОМ ядре. Индексации нужен ключ провайдера в хранилище приложения — его
// кладёт стенд (D-117). Шаг 4 тратит деньги (вызов модели на фрагмент),
// поэтому в отмечаемой папке ОДИН маленький документ, как велит чек-лист.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test, type Locator, type Page } from '@playwright/test'

import { addSourceAsUser, hideFirstRunSurfaces, mainWindow, openProject, standFixture } from '../lib/app'
import { record } from '../lib/evidence'

test.describe.configure({ mode: 'serial' })

const stand = standFixture({ mode: 'live', label: 'live-40', providerKeyInStore: true })

const FOLDER = 'одна'
const FILE = `${FOLDER}/смета.csv`
const NEW_FOLDER = 'новая'

/** Проиндексированный источник с одной папкой и одним документом в ней. */
const indexed = mkdtempSync(join(tmpdir(), 'aecpilot-e2e-graph-'))
/** Источник, подключённый ПОСЛЕ индексации — его документы не проиндексированы. */
const fresh = mkdtempSync(join(tmpdir(), 'aecpilot-e2e-graph-new-'))

mkdirSync(join(indexed, FOLDER))
writeFileSync(
  join(indexed, FILE),
  ['Позиция;Количество;Цена, руб', 'Кабель ВВГнг-LS 3х2,5;120 м;96', 'Щит ЩР-1;1 шт;18400'].join('\n') + '\n',
  'utf8'
)
mkdirSync(join(fresh, NEW_FOLDER))
writeFileSync(join(fresh, NEW_FOLDER, 'перечень.csv'), 'Позиция;Количество\nЛоток;30 м\n', 'utf8')

interface IngestState {
  running: boolean
  lastReport?: { files_total: number } | null
}

let prepared = false

async function ui(): Promise<Page> {
  const page = await mainWindow(stand.get())
  await hideFirstRunSurfaces(page)
  if (!prepared) {
    prepared = true
    await openProject(stand.get(), page)
    expect(await addSourceAsUser(stand.get(), page, indexed)).toMatchObject({ ok: true })
    await page.evaluate(() => window.aecpilot.startIngest(true))
    await expect
      .poll(
        async () => {
          const state = (await page.evaluate(() => window.aecpilot.getIngestState())) as IngestState
          return !state.running && (state.lastReport?.files_total ?? 0) > 0
        },
        { timeout: 300000, intervals: [3000], message: 'индексация закончилась' }
      )
      .toBe(true)
    expect(await addSourceAsUser(stand.get(), page, fresh)).toMatchObject({ ok: true })
    // Прогноз окна берёт файлы из каталога скана: у только что подключённого
    // источника каталога ещё нет, и окно честно говорит «добавлять нечего».
    // Человек в шаге 2 работает с уже просканированным источником.
    const scanned = await page.evaluate(async () => {
      const report = new Promise<unknown>((resolve) => {
        const off = window.aecpilot.onScanReport((envelope) => {
          off()
          resolve(envelope)
        })
        setTimeout(() => {
          off()
          resolve(null)
        }, 180000)
      })
      await window.aecpilot.triggerScan()
      return report
    })
    expect(scanned, 'скан отчитался').not.toBeNull()
    const vaultTab = page.getByRole('tab', { name: /Vault/ })
    await expect(vaultTab).toBeVisible({ timeout: 30000 })
    if ((await vaultTab.getAttribute('aria-selected')) !== 'true') await vaultTab.click()
  }
  return page
}

function sourceRow(page: Page, root: string): Locator {
  return page.locator(`button[title="${root.replace(/\\/g, '\\\\')}"]`).first()
}

function node(page: Page, rel: string): Locator {
  return page.locator(`button[title="${rel}"]`).first()
}

async function expand(page: Page, row: Locator, child: Locator): Promise<void> {
  if (!(await child.isVisible())) await row.click()
  await expect(child).toBeVisible({ timeout: 30000 })
}

async function menuOn(page: Page, target: Locator): Promise<Locator> {
  await target.click({ button: 'right' })
  const item = page.getByRole('menuitem', { name: 'Добавить в граф знаний' })
  await expect(item).toBeVisible({ timeout: 10000 })
  return item
}

async function openDialog(page: Page, target: Locator): Promise<Locator> {
  await (await menuOn(page, target)).click()
  const dialog = page.getByRole('dialog', { name: 'Добавить в граф знаний' })
  await expect(dialog).toBeVisible({ timeout: 15000 })
  await expect(dialog).not.toContainText('Считаю объём работы', { timeout: 60000 })
  return dialog
}

function projectJson(): { graph_scope?: unknown } {
  const file = join(stand.get().projectDir, '.aecpilot', 'project.json')
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as { graph_scope?: unknown }) : {}
}

async function indexPopover(page: Page): Promise<Locator> {
  await page.locator('button[title="Индекс"]').first().click()
  const popover = page.locator('[data-radix-popper-content-wrapper]').filter({ hasText: 'Граф знаний' }).last()
  await expect(popover).toBeVisible({ timeout: 15000 })
  return popover
}

test('40.1.1 на источнике в меню есть «Добавить в граф знаний»', async () => {
  const page = await ui()
  await menuOn(page, sourceRow(page, indexed))
  await page.keyboard.press('Escape')
})

test('40.1.2 то же меню есть на папке и на файле внутри источника', async () => {
  const page = await ui()
  await expand(page, sourceRow(page, indexed), node(page, FOLDER))
  await menuOn(page, node(page, FOLDER))
  await page.keyboard.press('Escape')
  await expand(page, node(page, FOLDER), node(page, FILE))
  await menuOn(page, node(page, FILE))
  await page.keyboard.press('Escape')
})

test('40.2.1 окно называет число документов и примерное число фрагментов — до запуска', async () => {
  const page = await ui()
  const dialog = await openDialog(page, node(page, FOLDER))
  await expect(dialog).toContainText(/1 документ\(ов\), примерно \d+ фрагмент/)
  await expect(dialog.getByRole('button', { name: 'Добавить', exact: true })).toBeVisible()
  await record(test.info(), page)
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click()
  await expect(dialog).toBeHidden()
})

test('40.2.2 документы не проиндексированы — так и сказано, кнопки «Добавить» нет', async () => {
  const page = await ui()
  await expand(page, sourceRow(page, fresh), node(page, NEW_FOLDER))
  const dialog = await openDialog(page, node(page, NEW_FOLDER))
  await expect(dialog).toContainText(/ещё не проиндексированы/)
  await expect(dialog.getByRole('button', { name: 'Добавить', exact: true })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click()
  await expect(dialog).toBeHidden()
})

test('40.3.1 после «Закрыть» ничего не запустилось — индикатор не строит граф', async () => {
  const page = await ui()
  const dialog = await openDialog(page, node(page, FOLDER))
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click()
  await expect(dialog).toBeHidden()
  await page.waitForTimeout(3000)
  const popover = await indexPopover(page)
  await expect(popover).not.toContainText(/строю граф/i)
  await expect(popover).toContainText(/Пуст\./)
  await page.keyboard.press('Escape')
})

test('40.3.2 в project.json раздела graph_scope с этой папкой нет', async () => {
  expect(JSON.stringify(projectJson().graph_scope ?? null)).not.toContain(FOLDER)
})

test('40.4.1 после «Добавить» видно «Строю граф: N из M»; окно можно закрыть', async () => {
  const page = await ui()
  const dialog = await openDialog(page, node(page, FOLDER))
  await page.evaluate(() => {
    const w = window as unknown as { __graphSeen?: string[] }
    w.__graphSeen = []
    new MutationObserver(() => {
      const text = document.body.innerText
      // 3M.4: внутри документа — «Строю граф: документ N из M · фрагмент …».
      const match = text.match(/[Сс]трою граф: (документ )?\d+ из \d+/)
      if (match) w.__graphSeen?.push(match[0])
    }).observe(document.body, { characterData: true, childList: true, subtree: true })
  })
  await dialog.getByRole('button', { name: 'Добавить', exact: true }).click()
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __graphSeen?: string[] }).__graphSeen ?? []), {
      timeout: 60000,
      message: 'ход «строю граф: N из M» показан'
    })
    .not.toEqual([])
  // Окно закрывается, прогон идёт дальше — его ход в индикаторе индекса.
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click()
  await expect(dialog).toBeHidden()
  await record(test.info(), page)
})

test('40.4.2 по завершении граф вырос, отмеченная папка — в списке «что входит»', async () => {
  const page = await ui()
  await expect
    .poll(
      async () => {
        const popover = await indexPopover(page)
        const text = await popover.innerText()
        await page.keyboard.press('Escape')
        return text
      },
      { timeout: 600000, intervals: [10000], message: 'граф построен' }
    )
    .toMatch(/[1-9]\d* документ\(ов\), \d+ фрагмент/)
  const popover = await indexPopover(page)
  await expect(popover.locator('li').filter({ hasText: FOLDER })).toHaveCount(1)
  await page.keyboard.press('Escape')
  expect(JSON.stringify(projectJson().graph_scope ?? null)).toContain(FOLDER)
})

test('40.5.1 файл внутри отмеченной папки — добавлять нечего', async () => {
  const page = await ui()
  await expand(page, node(page, FOLDER), node(page, FILE))
  const dialog = await openDialog(page, node(page, FILE))
  await expect(dialog).toContainText('Добавлять нечего')
  await expect(dialog.getByRole('button', { name: 'Добавить', exact: true })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click()
})

test('40.5.2 второй записи на тот же файл в «что входит» не появилось', async () => {
  const page = await ui()
  const popover = await indexPopover(page)
  await expect(popover.locator('li').filter({ hasText: FOLDER })).toHaveCount(1)
  await expect(popover.locator('li').filter({ hasText: 'смета.csv' })).toHaveCount(0)
  await page.keyboard.press('Escape')
})
