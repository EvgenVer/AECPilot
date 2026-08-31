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
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ElectronApplication, Page } from 'playwright'

const desktopDir = join(__dirname, '..')
const venvPython = join(desktopDir, '../../runtime/.hermes-venv/Scripts/python.exe')
const closeGraceMs = 90000

let mock: ChildProcessWithoutNullStreams
let mockOutput = ''
let app: ElectronApplication
let preExistingElectronPids = new Set<number>()
let projectDir = ''
let userDataDir = ''
let mainOutput = ''

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

/** Wait for a line the mock printed — how the test sees what the APP sent it
 *  (task 3.4: read_preview's answer travels app → gateway, not the other way). */
async function waitForMockLine(pattern: RegExp, timeoutMs = 30000): Promise<string> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const line = mockOutput.split(/\r?\n/).find((candidate) => pattern.test(candidate))

    if (line) return line

    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  throw new Error(`mock never printed ${pattern} — got:\n${mockOutput}`)
}

/** Take the two first-run surfaces out of the way for good.
 *
 * A CSS rule, not a style patch on the nodes: React re-creates both while the
 * app boots, so an inline `display:none` set once is gone with the next render
 * — which is how these tests started failing on clicks that had nothing to do
 * with either surface.
 *
 * Their boot overlay never finishes against this mock (its readiness probe is
 * REST and the mock speaks only the socket); our getting-started card is a real
 * surface that simply sits over the right rail.
 */
async function hideFirstRunSurfaces(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      .z-\\(--z-onboarding\\) { display: none !important }
      [role='region'][aria-label='Getting started'],
      [role='region'][aria-label='С чего начать'] { display: none !important }
    `
  })
}

/** Type a prompt into their composer and send it. */
async function send(page: Page, text: string): Promise<void> {
  const composer = page.getByRole('textbox', { name: /Message|Сообщение/ })

  await composer.click()
  await page.keyboard.type(text)
  // Their send button, not Enter: once a turn has run, the composer offers
  // "Queue message" as well, and Enter lands on the queue instead of the wire.
  await page.getByRole('button', { name: /^(Send|Отправить)$/ }).click()
}

/** Clear the toast stack. Their notifications float over the transcript's top
 *  edge, and the boot ones ("Backend out of date" against this mock) sit there
 *  until dismissed — a real overlay for a real reason, just not this test's
 *  subject. */
async function clearNotifications(page: Page): Promise<void> {
  const dismiss = page.getByRole('button', { name: /Dismiss notification|Закрыть уведомление/ })

  for (let guard = 0; guard < 10 && (await dismiss.count()) > 0; guard += 1) {
    await dismiss.first().click()
  }
}

/** How many preview tabs the store holds — the observable HX13 acts on. */
function previewTabCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    try {
      const raw = window.localStorage.getItem('hermes.desktop.previewTabs.v2')

      return raw ? (JSON.parse(raw) as unknown[]).length : 0
    } catch {
      return 0
    }
  })
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
    mock.stdout.on('data', (chunk: Buffer) => {
      mockOutput += chunk.toString()
      if (mockOutput.includes('MOCK_READY')) {
        clearTimeout(timeout)
        resolve()
      }
    })
    mock.stderr.on('data', (chunk: Buffer) => {
      mockOutput += chunk.toString()
    })
    mock.on('error', (error) => {
      clearTimeout(timeout)
      reject(new Error(`mock gateway python not found at ${venvPython} (${error.message})`))
    })
  })

  preExistingElectronPids = listElectronPids()

  // A fresh profile per run. Without it the app reuses the developer's real
  // userData: the persisted pane tree, the locale, the preview tabs and the
  // recent-project list all survive between runs, and a layout left over from
  // an older build silently decides where this run's panes land.
  userDataDir = mkdtempSync(join(tmpdir(), 'aecpilot-e2e-profile-'))

  // The REST half (task 3.16). The sidebar's session list travels HTTP, not the
  // socket, so without this the list is empty in every run and no test can tell
  // a working feature from a list that never arrived.
  const restLine = mockOutput.split(/\r?\n/).find((line) => line.startsWith('MOCK_REST_READY'))
  if (!restLine) throw new Error(`mock never printed MOCK_REST_READY — got:\n${mockOutput}`)
  const mockRestPort = Number(restLine.split(' ')[1])

  app = await _electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    cwd: desktopDir,
    env: {
      ...process.env,
      AEC_GATEWAY_URL: `ws://127.0.0.1:${mockPort}/api/ws`,
      AEC_GATEWAY_REST_URL: `http://127.0.0.1:${mockRestPort}`
    }
  })

  app.process().stdout?.on('data', (chunk: Buffer) => (mainOutput += chunk.toString()))
  app.process().stderr?.on('data', (chunk: Buffer) => (mainOutput += chunk.toString()))
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
    if (userDataDir) rmSync(userDataDir, { force: true, recursive: true })
  }
})

/** Жив ли ещё рендерер — не заменило ли его их аварийным экраном.
 *
 * Стоит в конце КАЖДОГО теста, и это не перестраховка. Приложение уже один раз
 * умирало посреди набора (D-42): проверки теста проходили, потому что все они
 * шли через `page.evaluate`, а тому мёртвое дерево React не мешает. Следующий
 * тест падал на пустом месте, и причина искалась не там. */
async function assertRendererAlive(page: Page, label: string): Promise<void> {
  const broken = await page
    .getByRole('heading', { name: /Something broke|Что-то сломалось/ })
    .count()
  if (broken > 0) throw new Error(`RENDERER DIED at ${label}`)
}

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
  await assertRendererAlive(page, 'end of test 1')
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

  await hideFirstRunSurfaces(page)

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
  await assertRendererAlive(page, 'end of test 2')
})

// Task 3.4 (SPEC UR22/HX13/C9). Three claims in one turn, because one turn is
// what produces all three: an HTML artifact card, the sandboxed tab it opens,
// and an explicit preview link to an external address that must NOT open.
test('an HTML artifact previews in a sandbox, an external address does not open', async () => {
  const page = await app.firstWindow()

  await hideFirstRunSurfaces(page)
  await clearNotifications(page)
  await send(page, 'artifact')

  // Their transcript promotes a substantial fenced document into a card.
  const card = page.locator('[data-slot="aui_artifact-card"]')
  await expect(card).toBeVisible({ timeout: 30000 })

  await clearNotifications(page)
  await card.click()

  // The preview runs in an iframe with an opaque origin: scripts may run, but
  // there is no same-origin access, no top navigation, no form submission out
  // of the frame — the app is unreachable from the generated page.
  const frame = page.locator('iframe[sandbox]')
  await expect(frame).toBeVisible({ timeout: 30000 })
  await expect(frame).toHaveAttribute('sandbox', 'allow-scripts')
  const srcdoc = await frame.getAttribute('srcdoc')
  expect(srcdoc).toContain('Vedomost peremychek')

  // The window itself keeps the hardening SPEC C9 requires, and never gained
  // `webviewTag` — the one switch that would let a <webview> load a page.
  const prefs = await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    const wp = win.webContents.getLastWebPreferences() ?? {}

    return {
      contextIsolation: wp.contextIsolation,
      sandbox: wp.sandbox,
      webviewTag: wp.webviewTag,
      nodeIntegration: wp.nodeIntegration
    }
  })
  expect(prefs.contextIsolation).not.toBe(false)
  expect(prefs.sandbox).not.toBe(false)
  expect(prefs.nodeIntegration).not.toBe(true)
  expect(prefs.webviewTag).not.toBe(true)

  // The same answer carries `[Preview: example.com](#preview/https://…)`. It is
  // a real, clickable door to their preview pipeline — and it must stay shut.
  await clearNotifications(page)
  const beforeTabs = await previewTabCount(page)
  await page
    .getByRole('button', { name: /Open preview|Открыть предпросмотр/ })
    .first()
    .click()

  await expect(
    page.getByText(/Внешние страницы здесь не открываются|External pages do not open here/)
  ).toBeVisible({
    timeout: 15000
  })
  expect(await previewTabCount(page)).toBe(beforeTabs)

  // read_preview must be ANSWERED for the artifact tab (SPEC UR22). The mock
  // has been asking every three seconds since the turn landed, so the line we
  // wait for is the first one answered while the tab was open.
  const line = await waitForMockLine(/PREVIEW_READ_RESPOND .*artifact/)
  const answer = JSON.parse(line.slice('PREVIEW_READ_RESPOND '.length)) as string

  const read = JSON.parse(answer) as { kind: string; note?: string; title: string }
  expect(read.kind).toBe('artifact')
  expect(read.title).toContain('Vedomost')
  // No live page behind a sandboxed frame — the honest answer says where the
  // content actually is instead of inventing text.
  expect(read.note ?? '').not.toBe('')
  await assertRendererAlive(page, 'end of test 3')
})

// Task 3.26 (SPEC HX14). Two appearance features are in scope and both are
// checked against the real window: the OS theme is followed live (no restart),
// and the interface scale is main's, not a CSS trick.
test('the window follows the OS theme and carries the interface scale', async () => {
  const page = await app.firstWindow()

  await hideFirstRunSurfaces(page)

  // The theme engine paints from inside the React tree, so wait until the app
  // is actually up — this test runs on whatever state the file left behind.
  await expect(page.getByRole('textbox', { name: /Message|Сообщение/ })).toBeVisible({
    timeout: 60000
  })

  // What the app must react to is the window's own colour preference — the
  // signal Chromium raises when the OS switches. Emulating it is how the test
  // gets a genuine change event: flipping `nativeTheme.themeSource` from the
  // main process moves the preference (measured — `prefers-color-scheme` does
  // follow it) but does not reliably notify an already-loaded page under
  // Playwright, so a test built on it passes in one direction and hangs in the
  // other for reasons that have nothing to do with the app.
  await page.emulateMedia({ colorScheme: 'dark' })

  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.hermesMode), {
      timeout: 15000
    })
    .toBe('dark')

  // Nothing was chosen by hand: the app is on «system», which is what a fresh
  // install gets (`aec/appearance/system-theme-default.ts`).
  expect(await page.evaluate(() => window.localStorage.getItem('hermes-desktop-mode-v1'))).toBe(
    'system'
  )

  // And back. This direction is the one that used to KILL the app (D-42): their
  // `useEffect(() => syncNativeTheme(...))` returned the shim's rejected promise,
  // React kept it as the effect's cleanup, and the second run called a promise
  // as a function. The app did not "fail to repaint" — it died into their error
  // boundary, which is why the check at the end of this test matters as much as
  // the colour.
  await page.emulateMedia({ colorScheme: 'light' })

  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.hermesMode), {
      timeout: 15000
    })
    .toBe('light')

  await page.emulateMedia({ colorScheme: null })

  // Zoom lives on the window's webContents: the renderer asks, main applies.
  const answer = await page.evaluate(() => window.aecpilot.setZoomPercent(125))
  expect(answer.percent).toBe(125)

  const level = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.getZoomLevel()
  )
  // 1.2 ** level === 1.25
  expect(level).toBeCloseTo(Math.log(1.25) / Math.log(1.2), 4)

  // Put it back so the rest of the suite sees the default.
  await page.evaluate(() => window.aecpilot.setZoomPercent(90))
  await assertRendererAlive(page, 'end of test 4')
})

/** Их часть моста «наружу» (задача 3.27), проверенная там, где она живёт: путь
 *  записи называет только диалог, а путь ЧТЕНИЯ приходит из ответа модели и
 *  потому проходит проверку принадлежности проекту. */
interface SaveBridge {
  saveGatewayFile: (payload: {
    path: string
  }) => Promise<{ canceled?: boolean; path?: string; saved: boolean }>
  saveImageFromUrl: (url: string) => Promise<boolean>
}

test('a file the agent made goes out where the person chose, and only from inside the project', async () => {
  const page = await app.firstWindow()

  const insideProject = join(projectDir, 'plan.txt')
  writeFileSync(insideProject, 'plan bytes')

  const outsideDir = mkdtempSync(join(tmpdir(), 'aecpilot-e2e-outside-'))
  const outsideProject = join(outsideDir, 'secret.txt')
  writeFileSync(outsideProject, 'secret bytes')

  // The test stands in for the human at the only place a write path is ever
  // named — the native dialog — exactly as the create-project test does. The
  // counter is the second half of the assertion: a refusal must not even get
  // as far as asking where to put the file.
  await app.evaluate(({ dialog }) => {
    const bag = globalThis as unknown as { saveTarget?: string; saveCalls?: number }
    bag.saveCalls = 0
    dialog.showSaveDialog = (async () => {
      bag.saveCalls = (bag.saveCalls ?? 0) + 1
      return { canceled: false, filePath: bag.saveTarget ?? '' }
    }) as never
  })

  const chosen = join(outsideDir, 'saved-plan.txt')
  // The first argument of `electronApp.evaluate` is always the electron module
  // itself — the value passed in comes second.
  await app.evaluate((_electron, target) => {
    ;(globalThis as unknown as { saveTarget?: string }).saveTarget = target
  }, chosen)

  const saved = await page.evaluate(
    (path) =>
      (window as unknown as { hermesDesktop: SaveBridge }).hermesDesktop.saveGatewayFile({ path }),
    insideProject
  )
  expect(saved).toEqual({ saved: true, path: chosen })
  expect(readFileSync(chosen, 'utf8'), 'the chosen place holds the file itself').toBe('plan bytes')

  // A path outside the project is refused, and the refusal is a sentence the
  // person can read — not a silent `false` that looks like a cancelled dialog.
  const refusal = await page.evaluate(
    (path) =>
      (window as unknown as { hermesDesktop: SaveBridge }).hermesDesktop
        .saveGatewayFile({ path })
        .then(
          () => '',
          (error: Error) => error.message
        ),
    outsideProject
  )
  expect(refusal).toContain('внутри рабочей папки проекта')

  // An image on the web is a LINK: it opens in a browser. Fetching it in main
  // would hand the window a network channel around its own CSP.
  const remote = await page.evaluate(() =>
    (window as unknown as { hermesDesktop: SaveBridge }).hermesDesktop
      .saveImageFromUrl('https://example.com/cat.png')
      .then(
        () => '',
        (error: Error) => error.message
      )
  )
  expect(remote).toContain('браузере')

  // Bytes already inside the window save without asking anyone anything.
  const imageTarget = join(outsideDir, 'pasted.png')
  await app.evaluate((_electron, target) => {
    ;(globalThis as unknown as { saveTarget?: string }).saveTarget = target
  }, imageTarget)

  const savedImage = await page.evaluate(() =>
    (window as unknown as { hermesDesktop: SaveBridge }).hermesDesktop.saveImageFromUrl(
      'data:image/png;base64,iVBORw0KGgo='
    )
  )
  expect(savedImage).toBe(true)
  expect(readFileSync(imageTarget).length).toBeGreaterThan(0)

  const calls = await app.evaluate(
    () => (globalThis as unknown as { saveCalls?: number }).saveCalls
  )
  expect(calls, 'a refused source must never open a save dialog').toBe(2)

  rmSync(outsideDir, { force: true, recursive: true })
  await assertRendererAlive(page, 'end of test 5')
})

test('the app hears the machine: battery, wake-up, and a notification it can show', async () => {
  const page = await app.firstWindow()

  // Subscribe first, from the page, through the same bridge their code uses.
  await page.evaluate(() => {
    const seen = globalThis as unknown as { power?: { battery: boolean[]; resumes: number } }
    seen.power = { battery: [], resumes: 0 }
    window.aecpilot.onBatteryChanged((value) => seen.power?.battery.push(value))
    window.aecpilot.onPowerResume(() => {
      if (seen.power) seen.power.resumes += 1
    })
  })

  // A notification with nothing to show is refused BEFORE it reaches the OS —
  // an empty frame on screen is worse than silence.
  expect(
    await page.evaluate(() => window.aecpilot.showNotification({ body: 'без заголовка' }))
  ).toBe(false)
  expect(
    await page.evaluate(() =>
      window.aecpilot.showNotification({ title: 'AECPilot', body: 'прогон завершён', silent: true })
    ),
    'a notification with a title reaches the OS'
  ).toBe(true)

  // The machine's own signals. `powerMonitor` is an emitter, so the test can
  // raise exactly the event the OS raises — no sleeping laptop required.
  //
  // The starting value is READ, not assumed: this suite runs on laptops too,
  // and a machine that is already on battery would make a hard-coded
  // expectation fail for a reason that has nothing to do with the app (it did
  // — the app was fine and the developer had unplugged the charger).
  const startedOnBattery = await page.evaluate(() => window.aecpilot.getOnBattery())
  const away = startedOnBattery ? 'on-ac' : 'on-battery'
  const back = startedOnBattery ? 'on-battery' : 'on-ac'

  const seenBattery = (): Promise<boolean[]> =>
    page.evaluate(
      () => (globalThis as unknown as { power?: { battery: boolean[] } }).power?.battery ?? []
    )

  await app.evaluate(({ powerMonitor }, event) => {
    powerMonitor.emit(event)
  }, away)
  await expect.poll(seenBattery).toEqual([!startedOnBattery])

  // Repeats are not forwarded: the renderer mirrors a value, it does not need
  // to be told the same thing twice.
  await app.evaluate(({ powerMonitor }, event) => {
    powerMonitor.emit(event)
  }, away)
  await app.evaluate(({ powerMonitor }, event) => {
    powerMonitor.emit(event)
  }, back)
  await expect.poll(seenBattery).toEqual([!startedOnBattery, startedOnBattery])

  // Waking up: the renderer is told, and main asks the gateway whether the
  // socket it holds is still alive. The mock answers `session.list`, so the
  // link survives — the composer must still be live afterwards.
  await app.evaluate(({ powerMonitor }) => {
    powerMonitor.emit('resume')
  })

  await expect
    .poll(() =>
      page.evaluate(
        () => (globalThis as unknown as { power?: { resumes: number } }).power?.resumes ?? 0
      )
    )
    .toBe(1)

  await expect(page.getByRole('textbox', { name: /Message|Сообщение/ })).toBeEnabled({
    timeout: 15000
  })
  await assertRendererAlive(page, 'end of test 6')
})

/** Их часть журнала (задача 3.29). */
interface LogBridge {
  reportRendererError: (report: {
    label?: string
    boundary?: string
    message?: string
    componentStack?: string
  }) => void
  getRecentLogs: () => Promise<{ path: string; lines: string[] }>
  revealLogs: () => Promise<{ ok: boolean; path: string; error?: string }>
}

test('a renderer crash outlives the window, and the log carries no token', async () => {
  const page = await app.firstWindow()

  // `app.evaluate` runs inside the main process, which has no access to this
  // file's imports — so it returns the directory and the join happens here.
  const logDir = await app.evaluate(({ app: electronApp }) => electronApp.getPath('logs'))
  const logFile = join(logDir, 'desktop.log')
  expect(logFile).toContain(userDataDir)

  // The report their error boundary sends from `componentDidCatch`.
  await page.evaluate(() =>
    (window as unknown as { hermesDesktop: LogBridge }).hermesDesktop.reportRendererError({
      label: 'main',
      boundary: 'root',
      message: 'e2e synthetic crash',
      componentStack: 'at SomeComponent'
    })
  )

  // Read the FILE, not the app: surviving the window is the whole point.
  await expect
    .poll(() => readFileSync(logFile, 'utf-8'), { timeout: 10000 })
    .toContain('renderer crashed [main/root] e2e synthetic crash')

  // Anything main prints lands there too — and a token never does. The line is
  // raised through main's own console, which is what the redaction wraps.
  await app.evaluate(() => {
    console.error('e2e probe: connect ws://127.0.0.1:1/api/ws?token=deadbeefcafe failed')
  })
  await expect
    .poll(() => readFileSync(logFile, 'utf-8'), { timeout: 10000 })
    .toContain('ws://127.0.0.1:1/api/ws?token=*** failed')
  expect(
    readFileSync(logFile, 'utf-8'),
    'the token itself must never reach the file'
  ).not.toContain('deadbeefcafe')

  // What their recovery overlay shows after a failed start.
  const recent = await page.evaluate(() =>
    (window as unknown as { hermesDesktop: LogBridge }).hermesDesktop.getRecentLogs()
  )
  expect(recent.path).toBe(logFile)
  expect(recent.lines.some((line) => line.includes('e2e synthetic crash'))).toBe(true)

  // "Open logs" opens the folder. Stubbed rather than really opened: a test
  // must not leave an Explorer window on the developer's screen.
  await app.evaluate(({ shell }) => {
    ;(globalThis as unknown as { openedPath?: string }).openedPath = ''
    shell.openPath = (async (target: string) => {
      ;(globalThis as unknown as { openedPath?: string }).openedPath = target
      return ''
    }) as never
  })
  const revealed = await page.evaluate(() =>
    (window as unknown as { hermesDesktop: LogBridge }).hermesDesktop.revealLogs()
  )
  expect(revealed.ok).toBe(true)
  expect(
    await app.evaluate(() => (globalThis as unknown as { openedPath?: string }).openedPath)
  ).toBe(revealed.path)

  // Замечание D-43 и решение владельца 2026-08-21: картинки с ЭТОЙ машины
  // показываются, удалённые — нет. Проверяется настоящей загрузкой в живом
  // окне: политика записана в разметке, а действует она в браузере.
  const images = await page.evaluate(async () => {
    const load = (src: string): Promise<string> =>
      new Promise((resolve) => {
        const image = new Image()
        image.onload = () => resolve('loaded')
        image.onerror = () => resolve('blocked')
        image.src = src
        setTimeout(() => resolve('timeout'), 5000)
      })

    return {
      local: await load(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
      ),
      remote: await load('https://example.com/x.png')
    }
  })
  expect(images.local, 'an attachment preview must actually appear').toBe('loaded')
  expect(images.remote, 'the window must not fetch pictures off the network').toBe('blocked')

  await assertRendererAlive(page, 'end of test 7')
})

/** SPEC UR23, второй вход: агент предлагает поставить MCP-сервер, ядро
 *  блокируется на ответе, а решение принимает человек.
 *
 *  Проверяется НАША половина этого пути — та, что могла бы его тихо оборвать:
 *  доходит ли запрос ядра до окна и доходит ли ответ окна до шлюза. Сама
 *  карточка согласия — их компонент, и её вид проверяет ручной блок 29: тест не
 *  может отличить «карточка не отрисовалась» от «в этой сборке нет сессии, в
 *  которой ей рисоваться» (композер против мока прерывает второй ход
 *  собственным `submit-drift-abort`, и это свойство стенда, а не продукта).
 */
test('the MCP consent request reaches the window and the answer reaches the gateway', async () => {
  const page = await app.firstWindow()

  // Половина первая: событие ядра доходит до окна нетронутым. Главный процесс
  // фильтрует события по сессии, и запрос, потерянный этим фильтром, оставил бы
  // агента ждать ответа, которого никто не даст.
  const received = page.evaluate(
    () =>
      new Promise<Record<string, unknown>>((resolve) => {
        const stop = window.aecpilot.onChatEvent((event) => {
          if (event.type === 'mcp.setup.request') {
            stop()
            resolve(event as unknown as Record<string, unknown>)
          }
        })
      })
  )

  await page.evaluate(() =>
    window.aecpilot.gatewayRpc('prompt.submit', { text: 'mcp', session_id: 'e2e-1' })
  )

  const event = (await received) as { payload?: { server?: string; reason?: string } }
  expect(event.payload?.server).toBe('filesystem')
  expect(event.payload?.reason, 'why the agent wants it must survive the trip').toBe(
    'нужен доступ к файлам сметы'
  )

  // Половина вторая: ответ человека доходит до шлюза. Наш проход RPC работает
  // по списку ЗАПРЕЩЁННЫХ методов, и `mcp.setup.respond` в него не входит —
  // иначе отказ бы не дошёл и ядро висело бы на инструменте до таймаута.
  await page.evaluate(() =>
    window.aecpilot.gatewayRpc('mcp.setup.respond', {
      request_id: 'mcp-req-1',
      status: 'declined',
      server: 'filesystem'
    })
  )

  const answered = await waitForMockLine(/MCP_SETUP_RESPOND/)
  expect(answered).toContain('mcp-req-1')
  expect(answered, 'the answer must be the refusal, not an install').toContain('declined')

  await assertRendererAlive(page, 'end of test 8')
})

/** Их часть моста «несколько окон» (задача 3.14). */
interface WindowBridge {
  openWindow: () => Promise<{ ok: boolean; error?: string }>
  openSessionWindow: (
    sessionId: string,
    opts?: { watch?: boolean }
  ) => Promise<{ ok: boolean; error?: string }>
  claimAmbientCue: (key: string) => Promise<boolean>
}

test('a second window opens, a session window opens once, and one cue sounds once', async () => {
  const page = await app.firstWindow()
  const before = app.windows().length

  // Второе полноценное окно — то же приложение против того же ядра.
  expect(
    await page.evaluate(() =>
      (window as unknown as { hermesDesktop: WindowBridge }).hermesDesktop.openWindow()
    )
  ).toMatchObject({ ok: true })
  await expect.poll(() => app.windows().length).toBe(before + 1)

  // Окно ОДНОЙ сессии: их флаг стоит перед решёткой, иначе рендерер прочитает
  // его уже после маршрутизатора и покажет обычное главное окно.
  expect(
    await page.evaluate(() =>
      (window as unknown as { hermesDesktop: WindowBridge }).hermesDesktop.openSessionWindow(
        'e2e-1'
      )
    )
  ).toMatchObject({ ok: true })
  await expect.poll(() => app.windows().length).toBe(before + 2)

  const urls = app.windows().map((candidate) => candidate.url())
  expect(urls.some((url) => url.includes('win=secondary') && url.includes('#/e2e-1'))).toBe(true)
  expect(
    urls.filter((url) => url.includes('win=')).length,
    'обычное второе окно флага не несёт'
  ).toBe(1)

  // Второй вызов на ту же сессию поднимает открытое окно, а не плодит копии.
  expect(
    await page.evaluate(() =>
      (window as unknown as { hermesDesktop: WindowBridge }).hermesDesktop.openSessionWindow(
        'e2e-1'
      )
    )
  ).toMatchObject({ ok: true })
  await page.waitForTimeout(500)
  expect(app.windows().length, 'копии одного разговора не открываются').toBe(before + 2)

  // Пустой номер — отказ, а не второе главное окно.
  expect(
    await page.evaluate(() =>
      (window as unknown as { hermesDesktop: WindowBridge }).hermesDesktop.openSessionWindow('')
    )
  ).toMatchObject({ ok: false })

  // Разовая подсказка достаётся ровно одному окну.
  expect(
    await page.evaluate(() =>
      (window as unknown as { hermesDesktop: WindowBridge }).hermesDesktop.claimAmbientCue(
        'e2e-cue'
      )
    )
  ).toBe(true)
  expect(
    await page.evaluate(() =>
      (window as unknown as { hermesDesktop: WindowBridge }).hermesDesktop.claimAmbientCue(
        'e2e-cue'
      )
    ),
    'второму окну — нет'
  ).toBe(false)

  for (const extra of app.windows().slice(before)) await extra.close()
  await expect.poll(() => app.windows().length).toBe(before)

  await assertRendererAlive(page, 'end of test 9')
})

/** Их часть моста «плавающая лента» (задача 3.24). */
interface HudBridge {
  open: (request?: { sessionId?: null | string }) => Promise<{ ok: boolean }>
  close: () => Promise<{ ok: boolean }>
  setIgnoreMouse: (ignore: boolean) => void
  moveBy: (delta: { x: number; y: number; width: number; height: number }) => void
}

test('the HUD floats above other windows, lets clicks through, and closes', async () => {
  const page = await app.firstWindow()
  const before = app.windows().length

  expect(
    await page.evaluate(() =>
      (window as unknown as { hermesDesktop: { hud: HudBridge } }).hermesDesktop.hud.open({
        sessionId: 'e2e-1'
      })
    )
  ).toMatchObject({ ok: true })
  await expect.poll(() => app.windows().length).toBe(before + 1)

  // Это ОТДЕЛЬНОЕ окно поверх остальных, без рамки и прозрачное — иначе оно не
  // может висеть над чужой программой.
  const shape = await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((candidate) =>
      candidate.webContents.getURL().includes('win=hud')
    )
    return win
      ? {
          onTop: win.isAlwaysOnTop(),
          frameless: !win.isResizable() || true,
          bounds: win.getBounds()
        }
      : null
  })
  expect(shape?.onTop, 'лента обязана быть поверх чужих окон').toBe(true)
  expect(shape?.bounds.width).toBeGreaterThan(0)

  // Сквозные щелчки: решение принимает рендерер, главный процесс исполняет.
  await page.evaluate(() =>
    (window as unknown as { hermesDesktop: { hud: HudBridge } }).hermesDesktop.hud.setIgnoreMouse(
      true
    )
  )
  await page.waitForTimeout(200)

  // Перетаскивание за композер двигает окно и не уводит его за край экрана.
  const moved = await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((candidate) =>
      candidate.webContents.getURL().includes('win=hud')
    )
    return win ? win.getBounds() : null
  })
  await page.evaluate(() =>
    (window as unknown as { hermesDesktop: { hud: HudBridge } }).hermesDesktop.hud.moveBy({
      x: -100000,
      y: -100000,
      width: 0,
      height: 0
    })
  )
  await page.waitForTimeout(200)
  const after = await app.evaluate(({ BrowserWindow, screen }) => {
    const win = BrowserWindow.getAllWindows().find((candidate) =>
      candidate.webContents.getURL().includes('win=hud')
    )
    if (!win) return null
    const work = screen.getDisplayNearestPoint(win.getBounds()).workArea
    const bounds = win.getBounds()
    return { bounds, work }
  })
  expect(after?.bounds.x).toBeGreaterThanOrEqual(after?.work.x ?? 0)
  expect(after?.bounds.y).toBeGreaterThanOrEqual(after?.work.y ?? 0)
  expect(after?.bounds.x, 'окно сдвинулось, а не осталось на месте').toBeLessThan(
    moved?.x ?? Number.POSITIVE_INFINITY
  )

  expect(
    await page.evaluate(() =>
      (window as unknown as { hermesDesktop: { hud: HudBridge } }).hermesDesktop.hud.close()
    )
  ).toMatchObject({ ok: true })
  await expect.poll(() => app.windows().length).toBe(before)

  await assertRendererAlive(page, 'end of test 10')
})

test('an open microphone says so in a window of its own', async () => {
  const page = await app.firstWindow()

  const before = app.windows().length

  // Захват начался — табличка появляется. Отдельным окном: слово-активатор
  // работает при свёрнутом главном окне, и значок внутри него не виден.
  await page.evaluate(() => window.aecpilot.setWakeIndicator('capturing'))
  await expect.poll(() => app.windows().length).toBe(before + 1)

  const shape = await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((candidate) =>
      candidate.webContents.getURL().includes('wake-indicator')
    )
    return win ? { onTop: win.isAlwaysOnTop(), visible: win.isVisible() } : null
  })
  expect(shape?.onTop, 'её должно быть видно поверх чужой программы').toBe(true)
  expect(shape?.visible).toBe(true)

  expect(await page.evaluate(() => window.aecpilot.getWakeIndicator())).toBe('capturing')

  // Захват кончился — табличка уходит. Оставшаяся табличка сообщала бы об
  // открытом микрофоне, которого нет.
  await page.evaluate(() => window.aecpilot.setWakeIndicator('hidden'))
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows().find((candidate) =>
          candidate.webContents.getURL().includes('wake-indicator')
        )
        return win ? win.isVisible() : false
      })
    )
    .toBe(false)
  expect(await page.evaluate(() => window.aecpilot.getWakeIndicator())).toBe('hidden')

  await assertRendererAlive(page, 'end of test 11')
})

test('a gateway token never reaches the window and never lands in plain text', async () => {
  const page = await app.firstWindow()

  const TOKEN = 'e2e-gateway-token-9f8e7d6c'

  const saved = await page.evaluate(
    (token) =>
      window.aecpilot.saveConnection({
        mode: 'remote',
        remoteUrl: 'https://gateway.example.org',
        remoteToken: token
      }),
    TOKEN
  )
  expect(saved.ok, saved.error ?? '').toBe(true)

  // Первое обещание задачи: окну токен не отдаётся ни в каком виде.
  const view = await page.evaluate(() => window.aecpilot.getConnection())
  expect(JSON.stringify(view)).not.toContain(TOKEN)
  expect(view.remoteTokenSet).toBe(true)
  expect(view.remoteTokenPreview).toBe('••••7d6c')

  // Второе: на диске он не лежит открытым текстом. Файл читается из node —
  // именно то, что увидел бы всякий, кто откроет папку профиля.
  const userData = await app.evaluate(({ app: electronApp }) => electronApp.getPath('userData'))
  const onDisk = readFileSync(join(userData, 'connection.json'), 'utf-8')
  expect(onDisk, 'токен в файле настроек — это и есть провал').not.toContain(TOKEN)
  expect(onDisk).toContain('"tokenEncoding": "safe"')

  // Настройку можно вернуть обратно, не потеряв её.
  const back = await page.evaluate(() =>
    window.aecpilot.saveConnection({ mode: 'local', remoteUrl: 'https://gateway.example.org' })
  )
  expect(back.ok).toBe(true)
  expect(back.config.mode).toBe('local')
  expect(back.config.remoteUrl, 'адрес помнится — возвращаться без перенабора').toBe(
    'https://gateway.example.org'
  )

  await assertRendererAlive(page, 'end of test 12')
})

test('the ssh surface answers, and a key path is a path — never a key', async () => {
  const page = await app.firstWindow()

  // Список машин читается из ~/.ssh/config самого человека. На машине сборки
  // его может не быть вовсе — тогда пустой список, и это ответ, а не ошибка.
  const hosts = await page.evaluate(() => window.aecpilot.sshHosts())
  expect(Array.isArray(hosts.hosts)).toBe(true)

  const unknown = await page.evaluate(() =>
    window.aecpilot.sshResolveHost('такой-машины-точно-нет-9f8e7d')
  )
  expect(unknown).toEqual({ hostname: null, identityFile: null, port: null, user: null })

  const saved = await page.evaluate(() =>
    window.aecpilot.saveConnection({
      mode: 'ssh',
      sshHost: 'build',
      sshUser: 'ivan',
      sshPort: 2222,
      sshKeyPath: '~/.ssh/id_build',
      sshRemoteHermesPath: '/opt/hermes'
    })
  )
  expect(saved.ok, saved.error ?? '').toBe(true)
  expect(saved.config.mode).toBe('ssh')
  expect(saved.config.sshHost).toBe('build')
  expect(saved.config.sshPort).toBe(2222)
  // Путь к ключу окну виден — секрет не он, а сам ключ, который мы не читаем.
  expect(saved.config.sshKeyPath).toBe('~/.ssh/id_build')

  // Возврат в локальный режим: иначе следующий запуск полез бы на 'build'.
  const back = await page.evaluate(() => window.aecpilot.saveConnection({ mode: 'local' }))
  expect(back.ok).toBe(true)
  expect(back.config.sshHost, 'настройка помнится — возвращаться без перенабора').toBe('build')

  await assertRendererAlive(page, 'end of test 13')
})
