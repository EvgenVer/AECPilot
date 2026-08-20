// The first end-to-end proof that the migrated interface actually runs (task
// 1.8.9): launch the packaged renderer against the mock gateway and check that
// THEIR shell paints and reaches the connected state through our IPC bridge.
//
// It deliberately asserts very little. The old chat-smoke suite asserted our
// markup down to the label of a panel resizer, and every one of those strings
// died with the screens; this one pins the two things the migration is allowed
// to be judged on right now — the app boots, and the composer is live, which
// means their gateway client is talking to main and main is talking to the
// gateway. The full rewrite of the e2e suite is task 1.8.21 (D-18).

import { test, expect, _electron } from '@playwright/test'
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ElectronApplication } from 'playwright'

const desktopDir = join(__dirname, '..')
const venvPython = join(desktopDir, '../../runtime/.hermes-venv/Scripts/python.exe')
const closeGraceMs = 90000

let mock: ChildProcessWithoutNullStreams
let app: ElectronApplication
let preExistingElectronPids = new Set<number>()
let projectDir = ''

function listElectronPids(): Set<number> {
  if (process.platform !== 'win32') return new Set()
  try {
    const output = execFileSync(
      'tasklist',
      ['/fi', 'IMAGENAME eq electron.exe', '/fo', 'csv', '/nh'],
      { encoding: 'utf8' }
    )
    const pids = new Set<number>()
    for (const line of output.split('\n')) {
      const match = line.match(/^"[^"]*","(\d+)"/)
      if (match) pids.add(Number(match[1]))
    }
    return pids
  } catch {
    return new Set()
  }
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => {
        if (address && typeof address === 'object') resolve(address.port)
        else reject(new Error('failed to allocate a free port'))
      })
    })
  })
}

function killProcessTree(pid: number | undefined): void {
  if (!pid) return
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore' })
    } else {
      process.kill(pid, 'SIGKILL')
    }
  } catch {
    // already exited
  }
}

test.beforeAll(async () => {
  const mockPort = await getFreePort()
  mock = spawn(venvPython, [join(desktopDir, 'e2e', 'mock_gateway.py'), String(mockPort)], {
    cwd: desktopDir
  })

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('mock_gateway.py did not print MOCK_READY within 15s')),
      15000
    )
    let output = ''
    mock.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString()
      if (output.includes('MOCK_READY')) {
        clearTimeout(timeout)
        resolve()
      }
    })
    mock.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    mock.on('error', (error) => {
      clearTimeout(timeout)
      reject(new Error(`mock gateway python not found at ${venvPython} (${error.message})`))
    })
  })

  preExistingElectronPids = listElectronPids()

  app = await _electron.launch({
    args: ['.'],
    cwd: desktopDir,
    env: { ...process.env, AEC_GATEWAY_URL: `ws://127.0.0.1:${mockPort}/api/ws` }
  })
})

test.afterAll(async () => {
  test.setTimeout(closeGraceMs + 30000)
  const electronPid = app?.process()?.pid

  try {
    await Promise.race([
      app?.close(),
      new Promise((_resolve, reject) =>
        setTimeout(() => reject(new Error('app.close() timed out')), closeGraceMs)
      )
    ])
  } catch (error) {
    console.warn(`[e2e] ${(error as Error).message} — force-killing Electron`)
  } finally {
    killProcessTree(electronPid)
    killProcessTree(mock?.pid)
    for (const pid of listElectronPids()) {
      if (!preExistingElectronPids.has(pid)) killProcessTree(pid)
    }
    if (projectDir) rmSync(projectDir, { force: true, recursive: true })
  }
})

test('their shell paints and the composer goes live over our bridge', async () => {
  const page = await app.firstWindow()

  // Their application only starts behind our project gate — the agent's working
  // directory is the vault. So the smoke opens one first, through the same IPC
  // path the create-project dialog uses, which makes vault creation part of
  // what this test covers rather than something it works around.
  projectDir = mkdtempSync(join(tmpdir(), 'aecpilot-e2e-'))
  // Task 4D-11: main only creates a project in a folder a human picked in a
  // native dialog. A test cannot click a native dialog, so it stands in for the
  // human at the only place that matters — the dialog itself — and then walks
  // the same two IPC calls the create-project screen walks. Stubbing the
  // create-time guard instead would test a build nobody ships.
  await app.evaluate(({ dialog }, dir) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [dir] })) as never
  }, projectDir)
  const picked = await page.evaluate(() => window.aecpilot.pickProjectDirectory())
  expect(picked, 'pickProjectDirectory should return the stubbed folder').toBe(projectDir)

  // The other half of the same guard: a valid, writable, absolute path that
  // nobody picked is refused. Without this line the test above would pass
  // just as happily with the guard deleted.
  const unpicked = mkdtempSync(join(tmpdir(), 'aecpilot-e2e-unpicked-'))
  const refused = await page.evaluate(
    (dir) => window.aecpilot.createProject(dir, 'e2e', true),
    unpicked
  )
  expect(refused).toMatchObject({ ok: false })
  rmSync(unpicked, { force: true, recursive: true })

  const created = await page.evaluate(
    (dir) => window.aecpilot.createProject(dir, 'e2e', true),
    projectDir
  )
  expect(created, `createProject failed: ${JSON.stringify(created)}`).toMatchObject({ ok: true })

  // Their composer's textbox is labelled from their own catalog, so finding it
  // also proves the i18n layer resolved (task 1.8.6) — a raw key would read
  // 'composer.message'.
  const composer = page.getByRole('textbox', { name: /Message|Сообщение/ })
  await expect(composer).toBeVisible({ timeout: 60000 })

  // 'Starting Hermes…' is the placeholder while their client is not connected.
  // It clearing is the observable end of the boot handshake — the bridge asked
  // main, main asked the gateway, and the gateway answered.
  await expect(composer).not.toHaveAttribute('data-placeholder', /Starting|Reconnecting|Запуск/, {
    timeout: 60000
  })
})

// Task 3.3 (SPEC UR16/HX6). Runs against the app and project the test above
// left open — this file has one worker and one `beforeAll` boot, so order is
// the dependency and there is nothing to re-create.
//
// What it proves cannot be proven by a unit test: the pane behind their ⌘G is
// OURS. `registerChangesPane()` wins the pane id `review` only if it runs after
// their controller registered it, and that ordering lives in module-evaluation
// semantics, not in any function this repo can call twice.
test('Ctrl+G opens the change history, not a git surface', async () => {
  const page = await app.firstWindow()

  // Their boot overlay never finishes against the mock: it clears on a
  // readiness answer the mock cannot give (that probe is REST, and this mock
  // speaks only the socket), so it stays as a full-screen layer over
  // everything. It is an artifact of the harness, not of the app, and it is not
  // what this test is about — take it out of the page so the rail underneath is
  // both visible and clickable.
  await page.evaluate(() => {
    for (const el of document.querySelectorAll<HTMLElement>('div.fixed.inset-0')) {
      if (el.className.includes('z-(--z-onboarding)')) el.style.display = 'none'
    }
  })

  // Our own getting-started card is a real, dismissible surface sitting in the
  // bottom-right corner — over the right rail. Closed the way a person closes
  // it.
  const guide = page.getByRole('region', { name: /Getting started|С чего начать/ })
  if (await guide.count()) await guide.getByRole('button', { name: /Close|Закрыть/ }).click()

  await page.keyboard.press('Control+G')

  // The list names snapshots by time (the mock answers two).
  const newest = page.getByText('06.08.2026, 10:00')
  await expect(newest).toBeVisible({ timeout: 30000 })
  await expect(page.getByText('06.08.2026, 09:00')).toBeVisible()

  await newest.click()

  // Line by line, with the changed file named — the UR16 requirement.
  await expect(page.getByText('wiki/smeta.md').first()).toBeVisible({ timeout: 30000 })
  await expect(page.getByText('+novoe znachenie')).toBeVisible()
  await expect(page.getByText('-staroe znachenie')).toBeVisible()

  // …and the way back is offered for the file and for the whole snapshot.
  await expect(page.getByRole('button', { name: /Восстановить файл|Restore file/ })).toBeVisible()

  // Their review pane's own chrome came with the body we replaced. None of it
  // is on screen, and neither is the hash the panel used to print.
  for (const label of [/^Stage all$/, /^Commit$/, /^Push$/, /Create PR/, /Unstage/]) {
    await expect(page.getByRole('button', { name: label })).toHaveCount(0)
  }
  await expect(page.getByText(/a1b2c3d4/)).toHaveCount(0)
})
