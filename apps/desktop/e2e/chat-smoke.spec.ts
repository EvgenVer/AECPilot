import { test, expect, _electron } from '@playwright/test'
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createServer } from 'node:net'
import { join } from 'node:path'
import type { ElectronApplication } from 'playwright'

const desktopDir = join(__dirname, '..')
// This venv is created by runtime/setup.mjs (task 0.6) — not committed, must
// already exist on the machine running this test.
const venvPython = join(desktopDir, '../../runtime/.hermes-venv/Scripts/python.exe')
// afterAll gives app.close() a grace period, then force-kills whatever is
// left so a hung close (see task 1.5.11) never leaves zombie processes or a
// held port behind.
const closeGraceMs = 90000

let mock: ChildProcessWithoutNullStreams
let app: ElectronApplication
// electron.exe PIDs that already existed before we launched the app under
// test — used to spot leaked helper processes (GPU/renderer) that escape the
// tree-kill below because Chromium reparents or sandboxes them.
let preExistingElectronPids = new Set<number>()

// Lists running electron.exe PIDs (Windows-only; empty elsewhere).
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

// Allocates an OS-assigned free port instead of a hardcoded one, so a leaked
// process from a previous run (or a parallel run) can't collide on bind.
function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => {
        if (address && typeof address === 'object') {
          resolve(address.port)
        } else {
          reject(new Error('failed to allocate a free port'))
        }
      })
    })
  })
}

// child_process#kill() on Windows only signals the process itself, not the
// tree Electron/child processes spawn under it — use taskkill /t so a hung
// close doesn't leave orphans behind.
function killProcessTree(pid: number | undefined): void {
  if (!pid) return
  try {
    if (process.platform === 'win32') {
      // taskkill routinely reports "process not found" for a child that
      // already exited on its own (the race this function guards against) —
      // ignore its stdio so that expected, harmless outcome doesn't spam
      // the test log.
      execFileSync('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore' })
    } else {
      process.kill(pid, 'SIGKILL')
    }
  } catch {
    // already exited — nothing to do
  }
}

test.beforeAll(async () => {
  const mockPort = await getFreePort()
  const mockScript = join(desktopDir, 'e2e', 'mock_gateway.py')
  mock = spawn(venvPython, [mockScript, String(mockPort)], { cwd: desktopDir })

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
      reject(
        new Error(
          `mock gateway python not found at ${venvPython} — run \`node runtime/setup.mjs\` first (${error.message})`
        )
      )
    })
    mock.on('exit', (code) => {
      if (code !== null && code !== 0) {
        clearTimeout(timeout)
        reject(new Error(`mock_gateway.py exited early with code ${code}: ${output}`))
      }
    })
  })

  preExistingElectronPids = listElectronPids()

  app = await _electron.launch({
    args: ['.'],
    cwd: desktopDir,
    env: {
      ...process.env,
      AEC_GATEWAY_URL: `ws://127.0.0.1:${mockPort}/api/ws`
    }
  })
})

test.afterAll(async () => {
  test.setTimeout(closeGraceMs + 30000)
  const electronPid = app?.process()?.pid

  try {
    await Promise.race([
      app?.close(),
      new Promise((_resolve, reject) =>
        setTimeout(
          () => reject(new Error(`app.close() did not resolve within ${closeGraceMs}ms`)),
          closeGraceMs
        )
      )
    ])
  } catch (error) {
    console.warn(`[e2e] ${(error as Error).message} — force-killing the Electron process`)
  } finally {
    killProcessTree(electronPid)
    killProcessTree(mock?.pid)
    // Chromium's own child processes (GPU/renderer) are sometimes not
    // reachable through the tree-kill above (reparented or sandboxed) — sweep
    // for any electron.exe that appeared during this run and is still alive.
    for (const pid of listElectronPids()) {
      if (!preExistingElectronPids.has(pid)) killProcessTree(pid)
    }
  }
})

test('chat panel connects to the mock gateway and streams a reply', async () => {
  const page = await app.firstWindow()

  await expect(page.getByText('Подключено')).toBeVisible({ timeout: 15000 })

  const input = page.getByPlaceholder('Спросите про проект…')
  await input.fill('ping')
  await input.press('Enter')

  await expect(page.getByText('ping')).toBeVisible()
  await expect(page.getByText('PONG')).toBeVisible({ timeout: 15000 })
})

// Regression for task 1.6.L4: clicking a separator has to focus it, or the
// arrow-key control required by UR12 never receives a key. The defect was
// invisible to unit tests (the maths was fine — the element simply never had
// focus), and there is no component-test environment in the project yet, so
// the real app is the only place this can be pinned down. Both axes are
// covered: the sidebar separator is vertical, the bottom panel's horizontal.
// A separator takes no layout size — its hit area is a ::before straddling the
// border — so it is clicked the way a user does it, by coordinate on the
// border itself. Playwright's own `locator.click()` refuses a zero-size box.
test('separators take keyboard control after a click (both axes)', async () => {
  const page = await app.firstWindow()

  const sidebar = page.locator('.sidebar')
  const sidebarResizer = page.getByRole('separator', { name: 'Изменить ширину боковой панели' })
  const sidebarBox = (await sidebar.boundingBox())!
  await page.mouse.click(sidebarBox.x + sidebarBox.width, sidebarBox.y + sidebarBox.height / 2)
  await expect(sidebarResizer).toBeFocused()
  await page.keyboard.press('ArrowRight')
  expect((await sidebar.boundingBox())!.width).toBeGreaterThan(sidebarBox.width)

  const bottomPanel = page.locator('.bottom-panel')
  const bottomResizer = page.getByRole('separator', { name: 'Изменить высоту нижней панели' })
  // Reset to the default size first (the app's own double-click affordance):
  // panel sizes persist to localStorage, and the userData dir survives between
  // e2e runs — so without this the arrow press below walks the panel one step
  // closer to its minimum on every run, and the assertion eventually fails on
  // a panel that simply cannot shrink any further. Found exactly that way.
  const initialBox = (await bottomPanel.boundingBox())!
  await page.mouse.dblclick(initialBox.x + initialBox.width / 2, initialBox.y)
  const bottomBox = (await bottomPanel.boundingBox())!
  await page.mouse.click(bottomBox.x + bottomBox.width / 2, bottomBox.y)
  await expect(bottomResizer).toBeFocused()
  // Down shrinks a panel that lives below its separator (direction -1).
  await page.keyboard.press('ArrowDown')
  expect((await bottomPanel.boundingBox())!.height).toBeLessThan(bottomBox.height)
})

// Task 1.6.2 — the owner's manual run of 2026-07-26 reported that the turn's
// cards vanish once the answer arrives. The reducer, the render and the React
// keys were already ruled out by inspection, and the plan called for a live
// run with a real model to get the event log. This drives the same sequence
// through the mock gateway instead: reasoning, a tool call, then the answer —
// payload shapes taken from the real `_on_tool_start`/`_on_tool_complete`.
// Deterministic, no model, no API key.
test('the turn cards survive the answer, and the next turn (block J)', async () => {
  const page = await app.firstWindow()
  const input = page.getByPlaceholder('Спросите про проект…')

  await input.fill('turn1')
  await input.press('Enter')

  await expect(page.getByText('расхождение найдено (turn1)')).toBeVisible({ timeout: 15000 })
  await expect(page.getByText('Рассуждение')).toBeVisible()
  await expect(page.getByText('read_file')).toBeVisible()

  // Second turn in the same session must not erase the first one's cards.
  await input.fill('turn2')
  await input.press('Enter')

  await expect(page.getByText('расхождение найдено (turn2)')).toBeVisible({ timeout: 15000 })
  expect(await page.getByText('Рассуждение').count()).toBe(2)
  expect(await page.getByText('read_file').count()).toBe(2)
  await expect(page.getByText('расхождение найдено (turn1)')).toBeVisible()
})

// Kept LAST on purpose: a cancelled navigation stays pending in the
// renderer, which stalls any locator call in a test that runs after it.
// Regression for task 1.6.4a. Since task 1.6.4 the transcript renders
// agent-authored markdown, so a link in it is content we did not write; if the
// window followed one, our preload API would travel onto a foreign page. The
// policy itself is unit-tested (main/external-link-policy.test.ts) — what only
// the real app can show is that the guard is actually wired to the window.
// The probe navigates to a `file:` URL on purpose: it exercises the same
// `will-navigate` path as a web link while being refused by the policy, so the
// test never launches a real browser on the machine running it.
test('the window refuses to navigate away from the app', async () => {
  const page = await app.firstWindow()
  const before = page.url()

  // Guard 1 — `setWindowOpenHandler`: a target=_blank link, a middle click or
  // window.open must not spawn a second window carrying the preload API.
  await page.evaluate(() => {
    window.open('file:///C:/Windows/System32/drivers/etc/hosts')
  })
  await page.waitForTimeout(500)
  expect(app.windows()).toHaveLength(1)

  // Guard 2 — `will-navigate`: the window itself may not leave its own page.
  // Asserted on `page.url()` alone, and last: Chromium leaves a cancelled
  // navigation pending in the renderer, which would stall any later locator
  // or evaluate call in this test rather than fail it.
  await page.evaluate(() => {
    window.location.href = 'file:///C:/Windows/System32/drivers/etc/hosts'
  })
  await page.waitForTimeout(1500)
  expect(page.url()).toBe(before)
})
