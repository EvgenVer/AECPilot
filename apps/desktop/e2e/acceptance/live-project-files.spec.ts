// Фаза 3K (задача 3K.8, SPEC UR45) на ЖИВОМ стенде: файлы самого проекта — в
// индекс и граф только по выбору человека.
//
// В папке проекта три файла: страница вики и черновик отмечаются, третий — нет,
// и он не должен попасть в индекс ни при одном скане. Агент находит отмеченное
// поиском и ссылается на него как на файл проекта, а не на документ источника.
// Граф строится по одной маленькой странице — вызов модели на фрагмент стоит денег.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test, type Locator, type Page } from '@playwright/test'

import { hideFirstRunSurfaces, mainWindow, openProject, standFixture } from '../lib/app'
import { record } from '../lib/evidence'
import { eventCount, eventsSince, recordChatEvents, turn } from '../lib/turn'

test.describe.configure({ mode: 'serial' })

const stand = standFixture({ mode: 'live', label: 'live-3k', providerKeyInStore: true })

const WIKI = 'wiki/Сваи КР.md'
const DRAFT = 'workspace/черновик расчёта.md'
const HIDDEN = 'workspace/не отмечен.md'

interface IngestState {
  lastReport?: { files_failed: number; files_total: number } | null
  running: boolean
}
interface InventoryFile {
  graph: string
  index: string
  rel_path: string
  source_id: string
}

let prepared = false

async function ui(): Promise<Page> {
  const page = await mainWindow(stand.get())
  await hideFirstRunSurfaces(page)
  if (!prepared) {
    prepared = true
    await openProject(stand.get(), page)
    const dir = stand.get().projectDir
    mkdirSync(join(dir, 'wiki'), { recursive: true })
    mkdirSync(join(dir, 'workspace'), { recursive: true })
    writeFileSync(
      join(dir, WIKI),
      '# Сваи\n\nДлина сваи С-17 по расчёту — 14,6 м. Бетон сваи С-17 — класс B30.\n',
      'utf8'
    )
    writeFileSync(join(dir, DRAFT), '# Черновик\n\nНагрузка на ростверк Р-9 — 812 кН.\n', 'utf8')
    writeFileSync(join(dir, HIDDEN), 'Шифр закрытого раздела — ЗЕБРА-44.\n', 'utf8')
  }
  await recordChatEvents(page)
  return page
}

/** Строка дерева по её `title` — пути узла. */
function row(page: Page, title: string): Locator {
  return page.locator('div.group').filter({ has: page.locator(`[title="${title}"]`) })
}

async function showVault(page: Page): Promise<void> {
  const vaultTab = page.getByRole('tab', { name: /^Vault/ })
  await expect(vaultTab).toBeVisible({ timeout: 30000 })
  if ((await vaultTab.getAttribute('aria-selected')) !== 'true') await vaultTab.click()
  await page
    .getByRole('button', { name: /^(Refresh|Обновить)$/ })
    .first()
    .click()
}

async function marked(page: Page): Promise<string[]> {
  return (await page.evaluate(() => window.aecpilot.listProjectIndex())) as string[]
}

async function waitIngest(page: Page): Promise<IngestState['lastReport']> {
  await expect
    .poll(
      async () => {
        const state = (await page.evaluate(() => window.aecpilot.getIngestState())) as IngestState
        return !state.running && state.lastReport ? 'готово' : 'идёт'
      },
      { timeout: 300000, intervals: [2000], message: 'индексация закончилась' }
    )
    .toBe('готово')
  const state = (await page.evaluate(() => window.aecpilot.getIngestState())) as IngestState
  return state.lastReport
}

async function inventory(page: Page): Promise<Map<string, InventoryFile>> {
  const answer = (await page.evaluate(() => window.aecpilot.getIndexInventory())) as {
    inventory?: { files: InventoryFile[] }
    ok: boolean
  }
  expect(answer.ok, JSON.stringify(answer)).toBe(true)
  return new Map((answer.inventory?.files ?? []).map((file) => [file.rel_path, file]))
}

test('3K.5 «Включить в индекс» в дереве проекта отмечает, индексирует и открывает «Индекс»', async () => {
  const page = await ui()
  expect(await marked(page)).toEqual([])
  await showVault(page)
  await row(page, 'wiki').locator('[title="wiki"]').click()
  await row(page, WIKI).click({ button: 'right' })
  const menu = page.getByRole('menu')
  await expect(menu.getByRole('menuitem', { name: 'Убрать из индекса' })).toHaveCount(0)
  await menu.getByRole('menuitem', { name: 'Включить в индекс' }).click()

  await expect.poll(() => marked(page), { timeout: 60000 }).toEqual([WIKI])
  await expect(page.getByRole('region', { name: 'Индекс', exact: true })).toBeVisible({
    timeout: 30000
  })
  const report = await waitIngest(page)
  expect(report?.files_failed, JSON.stringify(report)).toBe(0)
  expect((await inventory(page)).get(WIKI)).toMatchObject({
    index: 'indexed',
    source_id: 'project'
  })
  await expect(page.getByText('Файлы проекта').first()).toBeVisible({ timeout: 30000 })

  await showVault(page)
  await expect(row(page, WIKI).getByRole('img', { name: 'В индексе' })).toBeVisible({
    timeout: 30000
  })
  await record(test.info(), page)
})

test('3K.2 неотмеченный файл проекта не индексируется — ни при отметке соседа, ни при скане', async () => {
  const page = await ui()
  const answer = (await page.evaluate(
    (rel) => window.aecpilot.includeInIndex({ kind: 'file', rel }),
    DRAFT
  )) as { ok: boolean; started?: boolean }
  expect(answer, JSON.stringify(answer)).toMatchObject({ ok: true, started: true })
  await waitIngest(page)

  const files = await inventory(page)
  expect(files.get(DRAFT)).toMatchObject({ index: 'indexed', source_id: 'project' })
  expect(files.has(HIDDEN), 'неотмеченный файл в индексе').toBe(false)
  expect(await marked(page)).toEqual([WIKI, DRAFT])
})

test('3K.7 агент находит файл проекта и ссылается на него как на файл проекта', async () => {
  const page = await ui()
  // «Включить в индекс» увёл окно на страницу «Индекс» — к чату, как человек.
  await page.evaluate(() => {
    location.hash = '#/'
  })
  const mark = await eventCount(page)
  const result = await turn(
    page,
    'Найди поиском по индексу документов проекта — инструментом rag_query: какая длина сваи С-17? ' +
      'Ответь со ссылкой на документ.',
    { declineForeign: true, timeoutMs: 300000 }
  )
  console.log('3K.7 ' + result.transcript)
  // Вызов — по событиям ЭТОГО хода, без повтора: повтор отвечает из контекста
  // первого и инструментов не зовёт. `agent.log` стенда строк о вызовах не пишет.
  expect(result.tools.join(','), 'искал по индексу').toMatch(/rag_query/)
  // D-201: проект открыт, пока ядро стартовало, — поиск обязан идти по НЕМУ, а
  // не по проекту, с которым ядро поднялось.
  const rag = (await eventsSince(page, mark)).filter(
    (event) =>
      event.type === 'tool.complete' && /rag_query/.test(JSON.stringify(event.payload ?? {}))
  )
  console.log('3K.7 RAW ' + JSON.stringify(rag).slice(0, 1500))
  expect(JSON.stringify(await eventsSince(page, mark)), 'поиск по открытому проекту').not.toMatch(
    /project\.json not found/
  )
  expect(result.text).toMatch(/14[,.]6/)
  expect(result.text, 'ссылка на файл проекта').toMatch(/\[src: project\/wiki\/Сваи КР\.md/)
  // Фишкой становится только ссылка по навыку, `[src: …](#cite)` (D-92); голую
  // `[src: …]` модель иногда пишет, и тогда это текст — пометку фишки проверяет
  // юнит-тест 3K.6, а здесь записывается, в какой форме пришла ссылка.
  if (/\[src: project\/[^\]]+\]\(#cite\)/.test(result.text)) {
    const chip = page
      .locator('[data-slot="aui_assistant-message-root"]')
      .last()
      .getByRole('button', { name: /файл проекта/ })
    await expect(chip.first(), 'фишка ссылки помечена «файл проекта»').toBeVisible({
      timeout: 30000
    })
  } else {
    test.info().annotations.push({ type: 'ссылка', description: 'без (#cite) — фишки нет' })
  }
  await record(test.info(), page, { transcript: result.transcript })
})

test('3K.5 граф по отмеченной странице: документ проекта в графе', async () => {
  const page = await ui()
  const started = (await page.evaluate(
    (rel) => window.aecpilot.startGraphAdd('project', rel, 'file'),
    WIKI
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
    .toBe('добавлено: 1')

  const exported = (await page.evaluate(() => window.aecpilot.exportGraph())) as {
    graph: { documents: { rel_path: string; source_id: string }[] }
    ok: boolean
  }
  expect(exported.ok).toBe(true)
  expect(exported.graph.documents).toContainEqual(
    expect.objectContaining({ rel_path: WIKI, source_id: 'project' })
  )
  expect((await inventory(page)).get(WIKI)?.graph).toBe('in')
})

test('3K.5 «Убрать из индекса»: из поиска и графа уходит, файл на диске остаётся', async () => {
  const page = await ui()
  await showVault(page)
  if ((await row(page, WIKI).count()) === 0)
    await row(page, 'wiki').locator('[title="wiki"]').click()
  page.once('dialog', (dialog) => void dialog.accept())
  await row(page, WIKI).click({ button: 'right' })
  await page.getByRole('menu').getByRole('menuitem', { name: 'Убрать из индекса' }).click()

  await expect.poll(() => marked(page), { timeout: 120000 }).toEqual([DRAFT])
  const files = await inventory(page)
  expect(files.has(WIKI), 'убранный файл в описи').toBe(false)
  expect(files.get(DRAFT)?.index).toBe('indexed')
  const exported = (await page.evaluate(() => window.aecpilot.exportGraph())) as {
    graph: { documents: { rel_path: string }[] }
  }
  expect(exported.graph.documents.map((doc) => doc.rel_path)).not.toContain(WIKI)
  expect(existsSync(join(stand.get().projectDir, WIKI))).toBe(true)
  await expect(row(page, WIKI).getByRole('img', { name: 'В индексе' })).toHaveCount(0)
  await record(test.info(), page)
})
