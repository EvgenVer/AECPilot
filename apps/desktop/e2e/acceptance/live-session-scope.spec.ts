// Фаза 3L (задача 3L.1, D-206, SPEC UR46) на ЖИВОМ стенде: в панели сеансов —
// только сеансы открытого проекта.
//
// Два проекта на одном стенде. На папку каждого приложение заводит проект ядра
// и входит в него; сеанс, начатый в проекте A, ядро кладёт в проект A, и в
// панели проекта B его нет. Повторное открытие A второго проекта ядра не
// заводит.

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import { hideFirstRunSurfaces, mainWindow, openProject, standFixture } from '../lib/app'
import { record } from '../lib/evidence'
import { turn } from '../lib/turn'

test.describe.configure({ mode: 'serial' })

const stand = standFixture({ mode: 'live', label: 'live-3l1', providerKeyInStore: true })

interface CoreProject {
  id: string
  isAuto?: boolean
  isNoProject?: boolean
  path?: null | string
  sessionIds?: string[]
}

const folder = (path: string): string => path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

async function rpc<T>(page: Page, method: string, params: Record<string, unknown>): Promise<T> {
  const answer = (await page.evaluate(
    ([m, p]) => window.aecpilot.gatewayRpc(m as string, p as Record<string, unknown>),
    [method, params] as const
  )) as { ok?: boolean; value?: unknown; error?: unknown }
  if (answer?.ok === false) throw new Error(`${method}: ${JSON.stringify(answer.error)}`)
  return (answer?.value ?? answer) as T
}

/** Явные проекты ядра на эту папку. */
async function coreProjects(page: Page, dir: string): Promise<CoreProject[]> {
  const tree = await rpc<{ projects: CoreProject[] }>(page, 'projects.tree', {})
  return tree.projects.filter(
    (project) =>
      !project.isAuto && !project.isNoProject && folder(project.path ?? '') === folder(dir)
  )
}

/** Названия строк сеансов в панели — как их рисует сама панель. Название
 *  берётся у панели, а не у ядра: панель показывает заголовок, который ядро
 *  присваивает после хода. Ручки «Reorder …» в проекте у строк нет — там
 *  порядок не меняется, — поэтому строка узнаётся по своему названию
 *  (`hover-marquee-inner` у донора есть только у названия сеанса). */
async function sidebarSessions(page: Page): Promise<string[]> {
  return page
    .locator('[data-tour="sessions-sidebar"] .hover-marquee-inner')
    .evaluateAll((nodes) => nodes.map((node) => node.textContent?.trim() ?? ''))
}

/** Название сеанса у ядра так, как его рисует панель донора (`sessionTitle`:
 *  заголовок, иначе превью). Ядро переименовывает сеанс после первого хода,
 *  поэтому читается в момент сверки. */
async function titleOf(page: Page, id: string): Promise<string> {
  const list = await rpc<{ sessions: { id: string; preview?: string; title?: string }[] }>(
    page,
    'session.list',
    { limit: 50 }
  )
  const row = list.sessions.find((session) => session.id === id)
  return row?.title?.trim() || row?.preview?.trim() || ''
}

/** Сеансы проекта ядра на эту папку. */
async function coreSessions(page: Page, dir: string): Promise<string[]> {
  return (await coreProjects(page, dir))[0]?.sessionIds ?? []
}

let page: Page
let projectB = ''
let sessionA = ''

test.afterAll(() => {
  if (projectB) rmSync(projectB, { force: true, recursive: true })
})

test('55.1.1 проект A: на его папку заведён проект ядра', async () => {
  page = await mainWindow(stand.get())
  await hideFirstRunSurfaces(page)
  await openProject(stand.get(), page)
  await expect
    .poll(async () => (await coreProjects(page, stand.get().projectDir)).length, {
      timeout: 60000,
      message: 'проект ядра на папку A'
    })
    .toBe(1)
})

test('55.1.2 сеанс, начатый в A, ядро кладёт в проект A, и панель показывает только его', async () => {
  await turn(page, 'Ответь одним словом: готово.', { timeoutMs: 180000 })
  await expect
    .poll(async () => (await coreSessions(page, stand.get().projectDir)).length, {
      timeout: 60000,
      message: 'сеанс в проекте A'
    })
    .toBe(1)
  sessionA = (await coreSessions(page, stand.get().projectDir))[0]
  await expect
    .poll(async () => (await sidebarSessions(page)).length, {
      timeout: 60000,
      message: 'в панели — один сеанс проекта A'
    })
    .toBe(1)
  await record(test.info(), page)
})

test('55.1.3 проект B: свой проект ядра, сеанса A в панели нет', async () => {
  projectB = mkdtempSync(join(tmpdir(), 'aecpilot-e2e-B-'))
  // Приложение открывает только папку, выбранную в диалоге (4D-11).
  await stand.get().app.evaluate(({ dialog }, dir) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [dir] })) as never
  }, projectB)
  expect(await page.evaluate(() => window.aecpilot.pickProjectDirectory())).toBe(projectB)
  const created = await page.evaluate(
    (dir) => window.aecpilot.createProject(dir, 'e2e-B', true),
    projectB
  )
  expect(created, JSON.stringify(created)).toMatchObject({ ok: true })
  await expect
    .poll(async () => (await coreProjects(page, projectB)).length, {
      timeout: 60000,
      message: 'проект ядра на папку B'
    })
    .toBe(1)
  await expect
    .poll(() => sidebarSessions(page), { timeout: 30000, message: 'в панели B сеансов нет' })
    .toEqual([])
  await record(test.info(), page)
})

test('55.1.4 сеанс B — в проекте B; снова A — тот же проект ядра, его сеанс на месте', async () => {
  await turn(page, 'Ответь одним словом: принято.', { timeoutMs: 180000 })
  await expect
    .poll(async () => (await coreSessions(page, projectB)).length, {
      timeout: 60000,
      message: 'сеанс в проекте B'
    })
    .toBe(1)
  expect((await coreSessions(page, projectB))[0]).not.toBe(sessionA)
  expect(await coreSessions(page, stand.get().projectDir)).toEqual([sessionA])
  await expect
    .poll(async () => (await sidebarSessions(page)).length, {
      timeout: 60000,
      message: 'в панели — один сеанс проекта B'
    })
    .toBe(1)

  const reopened = await page.evaluate(
    (dir) => window.aecpilot.openProject(dir),
    stand.get().projectDir
  )
  expect(reopened, JSON.stringify(reopened)).toMatchObject({ ok: true })
  await expect
    .poll(
      async () => {
        const rows = await sidebarSessions(page)
        const title = await titleOf(page, sessionA)
        return rows.length === 1 && rows[0] === title ? 'сеанс A' : `${rows.join(' | ')} ≠ ${title}`
      },
      { timeout: 60000, message: 'снова A — его сеанс' }
    )
    .toBe('сеанс A')
  expect(await coreProjects(page, stand.get().projectDir)).toHaveLength(1)
  await record(test.info(), page)
})
