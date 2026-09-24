// Блок 38, шаги 19–21 (задача 3F.9): границы — что в продукт не приехало
// лишнее. Питомца нет (SPEC HX1), приложение не слушает сеть, обмена между
// экземплярами нет. Хода модели не нужно; живое ядро — потому что слушает
// именно оно.

import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

import { expect, test, type Locator, type Page } from '@playwright/test'

import { hideFirstRunSurfaces, mainWindow, openProject, standFixture } from '../lib/app'

test.describe.configure({ mode: 'serial' })

const stand = standFixture({ mode: 'live', label: 'live-38-boundaries' })

const desktopDir = join(__dirname, '..', '..')
const repoDir = join(desktopDir, '..', '..')

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

async function openCard(page: Page, title: string): Promise<Locator> {
  await page.getByRole('tab', { name: /Bots|Специалисты/i }).click()
  await page
    .getByRole('button', { name: new RegExp(`^${title}( ·|$)`) })
    .first()
    .click({ button: 'right' })
  await page.getByRole('menuitem', { name: /^Изменить/ }).click()
  const card = page.getByRole('dialog', { name: 'Изменить профиль', exact: true })
  await expect(card).toBeVisible({ timeout: 15000 })
  return card
}

/** Всё дерево процессов приложения: окно, ядро под ним и их потомки. */
function appPids(): number[] {
  const out = execFileSync(
    'powershell',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      join(__dirname, '..', 'lib', 'desktop-probe.ps1'),
      '-Action',
      'children',
      '-Pid2',
      String(stand.get().app.process().pid)
    ],
    { encoding: 'utf-8' }
  )
  const children = (JSON.parse(out) as { children: { pid: number }[] }).children
  return [stand.get().app.process().pid!, ...children.map((proc) => proc.pid)]
}

/** Слушающие сокеты этих процессов — тем же `Get-NetTCPConnection`, что в
 *  чек-листе, только по дереву приложения, а не по пути к файлу. */
function listening(pids: number[]): { addr: string; port: number; pid: number }[] {
  const script =
    `$ids = @(${pids.join(',')}); ` +
    'Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | ' +
    'Where-Object { $ids -contains $_.OwningProcess } | ' +
    'ForEach-Object { [pscustomobject]@{ addr = $_.LocalAddress; port = $_.LocalPort; pid = $_.OwningProcess } } | ' +
    'ConvertTo-Json -Compress'
  const out = execFileSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf-8' }).trim()
  if (!out) return []
  const parsed = JSON.parse(out) as unknown
  return (Array.isArray(parsed) ? parsed : [parsed]) as { addr: string; port: number; pid: number }[]
}

test('38.19.1 тест «нет питомца» проходит', () => {
  const out = execFileSync('corepack', ['pnpm', 'exec', 'vitest', 'run', 'no-pet'], {
    cwd: desktopDir,
    encoding: 'utf-8',
    shell: true
  })
  expect(out).toMatch(/Tests\s+\d+ passed/)
  expect(out).not.toMatch(/\d+ failed/)
})

test('38.19.2 в выборе лица в карточке нет питомца', async () => {
  const page = await ui()
  const card = await openCard(page, 'AECPilot')
  await expect(card.getByRole('button', { name: 'Специалист', exact: true })).toBeVisible()
  await expect(card).not.toContainText(/Питом|\bPet\b/)
  await card.getByRole('button', { name: /^Отмена$/ }).click()
  await expect(card).toBeHidden()
})

let listenerPids: number[] = []

test('38.20.1 слушает только петля 127.0.0.1 — шлюз ядра', async () => {
  await ui()
  const sockets = listening(appPids())
  console.log('38.20.1 ' + JSON.stringify(sockets))
  expect(sockets.length, 'шлюз ядра слушает').toBeGreaterThan(0)
  expect(
    sockets.filter((socket) => socket.addr !== '127.0.0.1'),
    'ни 0.0.0.0, ни ::, ни адреса машины в сети'
  ).toEqual([])
  expect(sockets.map((socket) => socket.port)).toContain(stand.get().servePort)
  listenerPids = [...new Set(sockets.map((socket) => socket.pid))]
})

test('38.21.1 «hermes peer» в нашем коде не найден', () => {
  let out = ''
  try {
    out = execFileSync('git', ['grep', '-n', 'hermes peer', '--', 'apps/desktop/src', 'mcp/'], {
      cwd: repoDir,
      encoding: 'utf-8'
    })
  } catch (error) {
    // `git grep` без совпадений выходит с кодом 1 — это и есть ответ.
    if ((error as { status?: number }).status !== 1) throw error
  }
  expect(out).toBe('')
})

// Последней: закрывает приложение.
test('38.20.2 при закрытом приложении список пустой', async () => {
  expect(listenerPids.length, 'в 38.20.1 было кого проверять').toBeGreaterThan(0)
  // Обычный выход приложения. Не `app.close()` Playwright: тот рвёт связь со
  // стендом, и его уборка после теста теряет процесс.
  await stand
    .get()
    .app.evaluate(({ app }) => app.quit())
    .catch(() => undefined)
  await expect.poll(() => listening(listenerPids), { timeout: 60000, intervals: [2000] }).toEqual([])
})
