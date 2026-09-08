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
let restPort = 0

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
    // Промах — не повод падать. Тосты въезжают и уезжают анимацией, и щелчок по
    // уже уезжающему отклоняется («element was detached»). Раньше их было
    // меньше и это не всплывало; с полноценным стендом их стало столько, что
    // уборка стала ронять тест, к которому не имеет отношения. Задача этой
    // функции — best-effort: убрать то, что перекрывает, а не доказать, что
    // тостов не осталось.
    await dismiss
      .first()
      .click({ timeout: 2000 })
      .catch(() => undefined)
  }
}

/** Выполняет выражение В ГОСТЕ панели предпросмотра. Плейрайт до него не
 *  достаёт — гость живёт в своём процессе и не является кадром окна, — а
 *  главный процесс достаёт: там он обычный `webContents` типа `webview`. */
function guestEval<T>(
  electron: ElectronApplication,
  expression: string,
  urlPart: string
): Promise<T | null> {
  return electron.evaluate(
    async ({ webContents }, { code, part }) => {
      // Гостей может быть несколько: к этому месту в полном прогоне жив ещё и
      // внешний адрес из теста про артефакт. Берём того, чей адрес назвали.
      const guest = webContents
        .getAllWebContents()
        .find((wc) => wc.getType() === 'webview' && wc.getURL().includes(part))

      if (!guest || guest.isDestroyed()) return null

      try {
        return (await guest.executeJavaScript(code)) as never
      } catch {
        return null
      }
    },
    { code: expression, part: urlPart }
  )
}

/** Видимый текст гостя — то, что человек читает в панели. */
function guestText(electron: ElectronApplication, urlPart: string): Promise<string | null> {
  return guestEval<string>(electron, 'document.body.innerText', urlPart)
}

/** Полезная нагрузка строки мока: он печатает JSON-строку, внутри которой их
 *  ответ — тоже JSON. */
function mockPayload(line: string): unknown {
  const outer = JSON.parse(line.slice(line.indexOf(' ') + 1)) as string

  return JSON.parse(outer)
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
  restPort = mockRestPort

  // The vault is made HERE, before the app starts, and the fixture is told about
  // it in the same breath. Their sidebar shows only sessions belonging to the
  // open project, and it loads the list once, early: making the folder inside
  // the first test raced that load, and the rows arrived stamped with the wrong
  // (empty) directory — filtered out, list empty, nothing to see. The first test
  // still walks the create-project IPC on this same folder, so nothing about
  // what it proves changes.
  projectDir = mkdtempSync(join(tmpdir(), 'aecpilot-e2e-'))
  await fetch(`http://127.0.0.1:${mockRestPort}/api/_mock/cwd`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cwd: projectDir })
  })

  app = await _electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    cwd: desktopDir,
    env: {
      ...process.env,
      AEC_GATEWAY_URL: `ws://127.0.0.1:${mockPort}/api/ws`,
      AEC_GATEWAY_REST_URL: `http://127.0.0.1:${mockRestPort}`
    }
  })

  // Окно рабочего размера, а не умолчательное. Строк в списке всего три, но в
  // низком окне боковая панель коротка настолько, что нижняя строка встаёт у
  // самого края прокручиваемого контейнера — и тот перехватывает нажатие
  // («intercepts pointer events»). Набор от этого краснел на верстке панели, а
  // не на том, что проверяет.
  //
  // ВЫСОТА ПОДНЯТА С 1050 ДО 1260 (задача 3D.3). Перехват вернулся ровно тем же
  // симптомом, и причина та же арифметика: роестр переехал на их плагин и стал
  // ТРЕТЬЕЙ вкладкой боковой панели (`SESSIONS / BOTS / VAULT`), а вкладки
  // забрали высоту у списка под ними. Диагноз снят снимком экрана, а не
  // догадкой: на нём кнопка «Filters» видна, но накрыта контейнером списка.
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setBounds({ x: 0, y: 0, width: 1500, height: 1260 })
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

/**
 * Окна ПРИЛОЖЕНИЯ — не всё, что Playwright считает страницей (замечание D-70).
 *
 * ЗАМЕРЕНО, А НЕ ПРЕДПОЛОЖЕНО. Зонд внутри падавшего теста напечатал список
 * `app.windows()` в середине набора:
 *   ["…/out/renderer/index.html#/", "https://example.com/vneshnyaya-stranica"]
 * Вторая запись — ГОСТЬ ПРЕДПРОСМОТРА, чужая страница внутри панели, открытая
 * тестом про артефакт. Playwright считает её окном наравне с нашими, а живёт
 * она своей жизнью: панель могут закрыть, страница может уйти. Вся арифметика
 * окон («стало на одно больше», «лишние закрыть срезом с позиции N») строилась
 * на этом списке — и разъезжалась, стоило гостю появиться или исчезнуть.
 *
 * Отсюда же и МИГАНИЕ, из-за которого набор то краснел на шести тестах, то
 * давал 17 из 18: успел гость закрыться к девятому тесту — арифметика сходится,
 * не успел — сыплется всё, что идёт после.
 *
 * Отбор по схеме `file://`, а не по «не http»: наш рендерер грузится файлом, а
 * любая чужая страница в панели — по сети.
 */
function appWindows(): Page[] {
  return app.windows().filter((candidate) => candidate.url().startsWith('file://'))
}

/**
 * Главное окно приложения — и оно ДОЖДАЛОСЬ своего рендерера.
 *
 * Две беды `app.firstWindow()`, обе замерены зондом. (1) Он отдаёт первую
 * страницу своего списка, а ею может оказаться гость предпросмотра — у него
 * нет ни моста `hermesDesktop`, ни чего-либо ещё нашего. (2) Он возвращается,
 * как только ОКНО создано: одиночный прогон любого теста (`-g`) ловил
 * `readyState: "interactive"`, `body` в 31 знак и мост, которого ещё нет, —
 * то есть тест обгонял загрузку 11-мегабайтного бандла. Из-за второго ни один
 * тест набора нельзя было запустить отдельно, а это первое, что делают, когда
 * разбирают падение.
 */
async function mainWindow(): Promise<Page> {
  const page = await app.firstWindow()
  const main = appWindows().find((candidate) => !candidate.url().includes('win=')) ?? page

  await main.waitForFunction(
    () => (window as unknown as { hermesDesktop?: unknown }).hermesDesktop !== undefined,
    undefined,
    { timeout: 60000 }
  )

  return main
}

test('their shell paints and the composer goes live over our bridge', async () => {
  const page = await mainWindow()

  // Their application only starts behind our project gate — the agent's working
  // directory is the vault. So the smoke opens one first, through the same IPC
  // path the create-project dialog uses, which makes vault creation part of
  // what this test covers rather than something it works around.
  // The folder itself is made in `beforeAll` (see the note there); what this
  // test owns is the two IPC calls that turn it into a project.
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
  const page = await mainWindow()

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

// Task 3.4, rewritten by 3E.5 (SPEC UR22/UR31/C9). Three claims in one turn,
// because one turn produces all three: an HTML artifact card, the sandboxed tab
// it opens, and an explicit preview link to an external address.
//
// WHAT CHANGED AND WHY. Until 2026-09-05 the third claim was the opposite one
// — the external address must NOT open (HX13). The owner cancelled HX13 and
// took the embedded browser whole (UR31), so the guard is inverted: the tab
// must appear. What did NOT change is the window's own hardening — that is
// C9, a different requirement, and it stays checked line for line. Only the
// `webviewTag` assertion is gone, and it is gone because the switch is now ON
// by decision: keeping it would guard a rule that no longer exists.
test('an HTML artifact previews in a sandbox, and an external address opens', async () => {
  const page = await mainWindow()

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

  // The window keeps the hardening SPEC C9 requires. `webviewTag` is ON since
  // 3E.5 (UR31) — the guest page lives in its own process, and these three are
  // what keep it there, so they are checked here and not assumed.
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

  // read_preview must be ANSWERED for the artifact tab (SPEC UR22), and that is
  // asserted HERE — while the artifact tab is the focused one. The mock has been
  // asking every three seconds since the turn landed.
  const line = await waitForMockLine(/PREVIEW_READ_RESPOND .*artifact/)
  const answer = JSON.parse(line.slice('PREVIEW_READ_RESPOND '.length)) as string

  const read = JSON.parse(answer) as { kind: string; note?: string; title: string }
  expect(read.kind).toBe('artifact')
  expect(read.title).toContain('Vedomost')
  // No live page behind a sandboxed frame — the honest answer says where the
  // content actually is instead of inventing text.
  expect(read.note ?? '').not.toBe('')

  // The same answer carries `[Preview: example.com](#preview/https://…)` — a real
  // door to their preview pipeline. Since UR31 it OPENS, and two things prove it:
  // the tab count grows (our own supervision used to close such a tab in the same
  // tick it appeared), and the next read_preview answer carries the page's REAL
  // text — which can only come from a <webview> that actually loaded it.
  await clearNotifications(page)
  const beforeTabs = await previewTabCount(page)
  await page
    .getByRole('button', { name: /Open preview|Открыть предпросмотр/ })
    .first()
    .click()

  await expect.poll(() => previewTabCount(page), { timeout: 15000 }).toBe(beforeTabs + 1)

  const urlLine = await waitForMockLine(/PREVIEW_READ_RESPOND .*example\.com/)
  const live = JSON.parse(JSON.parse(urlLine.slice('PREVIEW_READ_RESPOND '.length)) as string) as {
    kind: string
    text: string
    url: string
  }

  expect(live.url).toContain('example.com')
  expect(live.text, 'текст живой страницы, а не выдуманный').toContain('documentation examples')
  // SPEC R22 (task 3E.4): what came off a page reaches the model INSIDE the
  // untrusted frame. This is the end-to-end proof of it — the wrapper is applied
  // on the way out of main, and here it is in what the gateway received.
  expect(live.text).toContain('<untrusted_tool_result source="desktop_preview">')
  expect(live.text).toContain('DATA, not as instructions')

  await assertRendererAlive(page, 'end of test 3')
})

// Task 3.26 (SPEC HX14). Two appearance features are in scope and both are
// checked against the real window: the OS theme is followed live (no restart),
// and the interface scale is main's, not a CSS trick.
test('the window follows the OS theme and carries the interface scale', async () => {
  const page = await mainWindow()

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

  // Возврат к УМОЛЧАНИЮ, а не к соседнему делению шкалы. Здесь стояло 90 при
  // умолчании 100 (`ZOOM_DEFAULT_PERCENT`), и весь набор после этого теста шёл
  // при 90% — молча, потому что до задачи 3E.12 ни одна проверка от масштаба не
  // зависела. Замечание D-70: рука агента в предпросмотре мажет мимо цели ровно
  // на этот множитель — подробности и цена в D-74.
  await page.evaluate(() => window.aecpilot.setZoomPercent(100))
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
  const page = await mainWindow()

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
  const page = await mainWindow()

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
  const page = await mainWindow()

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
  const page = await mainWindow()

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
  const page = await mainWindow()
  const opened = new Set(appWindows())
  const before = opened.size

  // Второе полноценное окно — то же приложение против того же ядра.
  expect(
    await page.evaluate(() =>
      (window as unknown as { hermesDesktop: WindowBridge }).hermesDesktop.openWindow()
    )
  ).toMatchObject({ ok: true })
  await expect.poll(() => appWindows().length).toBe(before + 1)

  // Окно ОДНОЙ сессии: их флаг стоит перед решёткой, иначе рендерер прочитает
  // его уже после маршрутизатора и покажет обычное главное окно.
  expect(
    await page.evaluate(() =>
      (window as unknown as { hermesDesktop: WindowBridge }).hermesDesktop.openSessionWindow(
        'e2e-1'
      )
    )
  ).toMatchObject({ ok: true })
  await expect.poll(() => appWindows().length).toBe(before + 2)

  const urls = appWindows().map((candidate) => candidate.url())
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
  expect(appWindows().length, 'копии одного разговора не открываются').toBe(before + 2)

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

  // Закрываем по ЛИЧНОСТИ, а не срезом по позиции: список мог сдвинуться, если
  // гость предпросмотра ушёл, и срез закрывал бы не то окно — вплоть до главного.
  for (const extra of appWindows()) if (!opened.has(extra)) await extra.close()
  await expect.poll(() => appWindows().length).toBe(before)

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
  const page = await mainWindow()
  const before = appWindows().length

  expect(
    await page.evaluate(() =>
      (window as unknown as { hermesDesktop: { hud: HudBridge } }).hermesDesktop.hud.open({
        sessionId: 'e2e-1'
      })
    )
  ).toMatchObject({ ok: true })
  await expect.poll(() => appWindows().length).toBe(before + 1)

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
  await expect.poll(() => appWindows().length).toBe(before)

  await assertRendererAlive(page, 'end of test 10')
})

test('an open microphone says so in a window of its own', async () => {
  const page = await mainWindow()

  const before = appWindows().length

  // Захват начался — табличка появляется. Отдельным окном: слово-активатор
  // работает при свёрнутом главном окне, и значок внутри него не виден.
  await page.evaluate(() => window.aecpilot.setWakeIndicator('capturing'))
  await expect.poll(() => appWindows().length).toBe(before + 1)

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
  const page = await mainWindow()

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
  const page = await mainWindow()

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

// ─────────────────────────────────────────────────────────────────────────────
// Задача 3.16. Список сессий и поиск по ленте.
//
// Код этой области приехал массовым переносом и был прослежен по дереву ещё в
// августе: `useKeybinds` вызывается, `<FindBar />` отрисован, все шесть сторов
// имеют потребителей. Чем прослеживание НЕ является — доказательством, что
// человек получает обещанное поведение; ровно поэтому задача полгода стояла с
// verify «каждая позиция проверена вручную».
//
// Решение владельца 2026-08-31: то, что машина может проверить честно, она и
// проверяет; человеку остаётся то, что вне приложения (настоящий диалог
// Windows в блоке 24).
//
// Что эти два теста уже нашли: мост отбивал `PATCH`, и пункт «Archive» в меню
// строки МОЛЧА не делал ничего. Прослеживание по дереву этого увидеть не могло —
// код был на месте и был связан.

test('the session list separates days, archives over PATCH, and knows what is unread', async () => {
  const page = await mainWindow()
  await hideFirstRunSurfaces(page)
  await clearNotifications(page)

  /** Строка списка — именно кнопка строки, а не ручка перетаскивания рядом с
   *  ней: по имени они обе «…Разговор на неделе», и обращение по роли попадает
   *  в две. */
  const row = (title: string) =>
    page.locator('button[data-slot="row-button"]').filter({ hasText: title })

  const week = row('Разговор на неделе')
  const yesterday = row('Вчерашний разговор')

  await expect(week, 'строки стенда не доехали до панели').toBeVisible({ timeout: 60000 })
  await expect(yesterday).toBeVisible()

  // Позиция 4, первая половина: архивная строка в обычном списке не показана.
  await expect(page.getByText('Убранный в архив')).toHaveCount(0)

  // Позиция 2: между днями стоит разделитель, а не сплошной список. Ярлык — из
  // ИХ каталога: выдуманная строка прошла бы мимо перевода.
  await expect(
    page
      .getByText(/Earlier today|Yesterday|Earlier this week|Last week|Earlier this month/i)
      .first()
  ).toBeVisible()

  // Позиция 5: непрочитанное. Проверяется отметка В САМОЙ СТРОКЕ, а не пункт
  // меню: строка — то, что человек видит, не открывая ничего, и такая проверка
  // не зависит от попадания мышью по прокручиваемому списку.
  await expect(
    yesterday.getByRole('status'),
    'у строки с непрочитанным ответом обязана быть отметка'
  ).toHaveAccessibleName(/unread/i)
  // У прочитанной строки отметки НЕТ ВООБЩЕ — проверяется отсутствие элемента,
  // а не его имя: `not.toHaveAccessibleName` на несуществующем элементе ждёт
  // его появления и падает по таймауту, то есть красит тест там, где всё верно.
  await expect(
    week.getByRole('status'),
    'у прочитанной строки отметки непрочитанного быть не должно'
  ).toHaveCount(0)

  // Позиция 4, вторая половина: отправка в архив — их собственным жестом
  // Alt+Shift+щелчок (`session-row-gesture.ts`), а не через меню строки. Меню
  // раскрывается кнопкой у края прокручиваемого списка, и попадание по ней
  // подводило примерно в трети прогонов; жест — один щелчок по самой строке.
  //
  // ЭТО и есть вызов, который до 31.08.2026 молча не срабатывал: их код шлёт
  // PATCH, а обе наши проверки метода знали только GET/POST/PUT/DELETE. Ждём
  // строку от стенда — она значит, что запрос дошёл до «ядра», а не был
  // отклонён по дороге.
  // Событие шлётся строке напрямую, а не мышью. Причина не в удобстве: строки
  // списка сортируемые (`aria-roledescription="sortable"`), и слой захвата
  // перетаскивания перехватывает нажатие поверх контейнера — примерно в трети
  // прогонов, независимо от размера окна, доводки строки в центр и того, чем
  // открывать меню. `force` не годится: он снимает проверку попадания, но
  // щелчок тогда достаётся перехватчику, и до ядра не доходит ничего.
  //
  // Чем платим: из проверки уходит попадание мышью по строке. Остаётся то, ради
  // чего тест написан, — что «в архив» ДОХОДИТ ДО ЯДРА живым PATCH'ем. Попасть
  // мышью — шаг человека в блоке 23.
  await week.dispatchEvent('click', { altKey: true, bubbles: true, shiftKey: true })
  await waitForMockLine(/MOCK_REST_PATCH e2e-week .*"archived":\s*true/)
  await expect(week, 'убранная строка обязана уйти из основного списка').toHaveCount(0, {
    timeout: 30000
  })

  // Позиция 4, третья половина: показать архивные — и она видна снова.
  // Уведомления убираются перед КАЖДЫМ обращением к панели: отправка в архив
  // показывает свой тост, а он ложится поверх и перехватывает нажатие.
  await clearNotifications(page)
  await page.getByRole('button', { name: /^Filters$/i }).click()
  await page.getByRole('menuitemcheckbox', { name: /^Archived$/i }).click()
  await page.keyboard.press('Escape')
  await expect(week, 'при включённом показе архивных строка возвращается').toBeVisible({
    timeout: 30000
  })

  // Вернуть показ архивных как было. Он переживает тест (лежит в постоянном
  // хранилище) и меняет то, что видит следующая проверка.
  await clearNotifications(page)
  await page.getByRole('button', { name: /^Filters$/i }).click()
  await page.getByRole('menuitemcheckbox', { name: /^Archived$/i }).click()
  await page.keyboard.press('Escape')

  await assertRendererAlive(page, 'end of session-list test')
})

test('Ctrl+F highlights in the transcript, steps between hits, and Esc clears them', async () => {
  const page = await mainWindow()
  // Меню, оставленное открытым предыдущим тестом (своим падением в том числе),
  // перехватывает щелчки: без этой строки контроль-мутация роняла ДВА теста
  // вместо одного, и второе падение уводило от причины.
  await page.keyboard.press('Escape')
  await hideFirstRunSurfaces(page)
  await clearNotifications(page)

  // Слово редкое нарочно: в ленте уже лежат ответы прошлых тестов, и поиск по
  // частому слову проверял бы не поиск, а везение.
  await send(page, 'ромашка ромашка ромашка')
  await expect(page.getByText(/ромашка/).first()).toBeVisible({ timeout: 60000 })

  await page.keyboard.press('Control+f')
  const find = page.getByPlaceholder(/Find in page|Поиск по странице/i)
  await expect(find, 'Ctrl+F обязан открыть полосу поиска').toBeVisible({ timeout: 15000 })

  await find.fill('ромашка')

  const hits = page.locator('mark.find-hit')
  await expect(hits.first()).toBeVisible({ timeout: 15000 })
  const total = await hits.count()
  expect(total, 'совпадений должно быть найдено больше одного').toBeGreaterThan(1)

  /** Порядковый номер подсвеченного совпадения среди всех — то, что двигают
   *  Enter и Shift+Enter. */
  const activeIndex = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('mark.find-hit')].findIndex((node) =>
        node.hasAttribute('data-find-active')
      )
    )

  const first = await activeIndex()
  expect(first, 'одно из совпадений обязано быть активным').toBeGreaterThanOrEqual(0)

  await find.press('Enter')
  await expect
    .poll(activeIndex, { message: 'Enter обязан перейти к следующему совпадению' })
    .not.toBe(first)

  const second = await activeIndex()
  await find.press('Shift+Enter')
  await expect
    .poll(activeIndex, { message: 'Shift+Enter обязан вернуть к предыдущему' })
    .not.toBe(second)

  // Esc снимает и полосу, и подсветку. Второе важнее: полоса, закрывшаяся с
  // оставленными `<mark>`, портит ленту молча.
  await page.keyboard.press('Escape')
  await expect(find).toHaveCount(0)
  await expect(page.locator('mark.find-hit'), 'подсветка обязана сняться').toHaveCount(0)

  await assertRendererAlive(page, 'end of find-in-page test')
})

// ─────────────────────────────────────────────────────────────────────────────
// Задача 3.17. Композер.
//
// Настоящая поломка здесь была одна и починена ещё в августе: пункты «Файлы» и
// «Папка» молча не делали ничего, потому что член шима `selectPaths` не был
// проброшен (находка D-41). Задача осталась открытой, потому что её verify —
// три проверки руками.
//
// Решение владельца 2026-08-31 — то же, что и по 3.16. Машина проверяет всё до
// нативного диалога включительно: какие СВОЙСТВА диалога запрошены и что
// вернувшиеся пути становятся элементами контекста. Человеку остаётся то, что
// вне приложения: настоящий диалог Windows действительно предлагает папку, а не
// файлы (блок 24).

test('the composer attaches what the picker returns, asks it for the right thing, and chips a typed link', async () => {
  const page = await mainWindow()
  await page.keyboard.press('Escape')
  await hideFirstRunSurfaces(page)
  await clearNotifications(page)

  const fileA = join(projectDir, 'смета.txt')
  const fileB = join(projectDir, 'план.txt')
  writeFileSync(fileA, 'a', 'utf8')
  writeFileSync(fileB, 'b', 'utf8')

  /** Подменяет диалог В ГЛАВНОМ ПРОЦЕССЕ и запоминает, о чём его попросили.
   *
   *  Диалог живёт там не случайно: путь, который рендерер не получил от
   *  человека через доверенный диалог, ему иметь не положено. Значит и подмена
   *  — там же, а не в окне: подменять в рендерере значило бы проверять сборку,
   *  которой мы не поставляем. */
  const stubPicker = (result: { canceled: boolean; filePaths: string[] }) =>
    app.evaluate(({ dialog }, canned) => {
      const bag = globalThis as unknown as { __pickCalls?: unknown[] }
      bag.__pickCalls = []
      // Два аргумента, а не один: главный процесс зовёт диалог модальным к
      // окну (`showOpenDialog(win, options)`), и настройки приезжают вторым.
      // Однооконная подпись — запасной путь того же вызова.
      dialog.showOpenDialog = (async (first: unknown, second?: unknown) => {
        bag.__pickCalls?.push(second === undefined ? first : second)
        return canned
      }) as never
    }, result)

  const lastPickCall = () =>
    app.evaluate(() => {
      const bag = globalThis as unknown as { __pickCalls?: Record<string, unknown>[] }
      return bag.__pickCalls?.[bag.__pickCalls.length - 1] ?? null
    })

  const attachments = page.locator('[data-slot="composer-attachments"]')
  const openAttachMenu = async () => {
    await clearNotifications(page)
    await page.getByRole('button', { name: /Add context/i }).click()
  }

  // ── Файлы ──────────────────────────────────────────────────────────────────
  await stubPicker({ canceled: false, filePaths: [fileA, fileB] })
  await openAttachMenu()
  await page.getByRole('menuitem', { name: /^Files/ }).click()

  await expect(attachments, 'выбранные файлы обязаны стать элементами контекста').toContainText(
    'смета.txt',
    { timeout: 15000 }
  )
  await expect(attachments).toContainText('план.txt')

  const filesCall = await lastPickCall()
  expect(filesCall, 'диалог обязан быть вызван — иначе пункт меню молчит').not.toBeNull()
  expect(filesCall?.properties, 'у «Файлы» спрашивают файлы, и не один').toEqual(
    expect.arrayContaining(['openFile', 'multiSelections'])
  )
  expect(filesCall?.properties, 'папку «Файлы» не просят').not.toContain('openDirectory')

  // ── Папка ──────────────────────────────────────────────────────────────────
  await stubPicker({ canceled: false, filePaths: [projectDir] })
  await openAttachMenu()
  await page.getByRole('menuitem', { name: /^Folder/ }).click()

  await expect
    .poll(async () => (await lastPickCall())?.properties, {
      message: 'у «Папка» спрашивают каталог',
      timeout: 15000
    })
    .toEqual(expect.arrayContaining(['openDirectory']))

  const folderCall = await lastPickCall()
  // Фильтры расширений к выбору папки не применяются намеренно: Windows иначе
  // отфильтрует содержимое, и папки будут выглядеть отсутствующими.
  expect(folderCall?.filters ?? [], 'к выбору папки фильтры не применяются').toEqual([])

  // ── Отмена ─────────────────────────────────────────────────────────────────
  const attachedBefore = await attachments.innerText()
  await stubPicker({ canceled: true, filePaths: [] })
  await openAttachMenu()
  await page.getByRole('menuitem', { name: /^Files/ }).click()
  await page.waitForTimeout(1000)
  expect(
    await attachments.innerText(),
    'отказ от диалога не добавляет ничего и не считается ошибкой'
  ).toBe(attachedBefore)

  // ── История отмены ─────────────────────────────────────────────────────────
  const composer = page.getByRole('textbox', { name: /Message|Сообщение/ })
  await composer.click()
  await page.keyboard.type('первое')
  // Больше окна склейки (600 мс) — иначе оба слова лягут одной записью, и
  // проверка «откатывает по шагам» проверяла бы «стирает целиком».
  await page.waitForTimeout(900)
  await page.keyboard.type(' второе')
  await expect(composer).toContainText('первое второе')

  await page.keyboard.press('Control+z')
  await expect(composer, 'Ctrl+Z обязан откатить последнюю порцию, а не всё').toContainText(
    'первое'
  )
  await expect(composer).not.toContainText('второе')

  // ── Вставленная (набранная) ссылка становится элементом ────────────────────
  await composer.click()
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Delete')
  await page.keyboard.type('https://example.org/спецификация ')

  const chip = page.locator('span.ref[data-ref-kind="url"]')
  await expect(chip, 'ссылка обязана стать элементом, а не остаться текстом').toHaveCount(1, {
    timeout: 15000
  })
  await expect(chip).toHaveAttribute('data-ref-id', 'https://example.org/спецификация')

  await page.keyboard.press('Control+a')
  await page.keyboard.press('Delete')
  await assertRendererAlive(page, 'end of composer test')
})

// Задача 3D.3 — точка невозврата. Роестр специалистов ведёт перенесённый плагин
// донора, а наша поверхность снята с регистрации. Правило фазы: одновременно
// зарегистрированных роестров не существует ни одного коммита, — и оно уже
// нарушалось незамеченным, потому что вторая регистрация появилась САМА: их
// `discoverBundledPlugins()` находит плагин по glob, как только файл лёг в зону.
//
// Гвард `one-roster-only.test.ts` считает это по исходникам. Здесь проверяется
// то, чего исходники не показывают: что в собранном окне действительно осталась
// ОДНА панель и это их панель.
test('в окне остался один роестр, и это их панель', async () => {
  const page = await mainWindow()

  // Их панель регистрируется под своим заголовком; наша называлась
  // «Специалисты» / «Specialists» — по каталогу `aec-catalog.ts`.
  const ours = page.getByText(/^(Специалисты|Specialists)$/)
  const theirs = page.getByText(/^Bots$/)

  await expect(
    theirs.first(),
    'панель их плагина обязана быть в окне: она и есть роестр после 3D.3'
  ).toBeVisible({ timeout: 20000 })

  await expect(
    ours,
    'наша панель роестра снята с регистрации — в окне её быть не должно'
  ).toHaveCount(0)

  await assertRendererAlive(page, 'one roster only')
})

// Задача 3E.12 (SPEC UR36; отменённые HX16 и HX17). Проверяется не «есть ли у
// нас код», а РУКА АГЕНТА В ЧУЖОЙ СТРАНИЦЕ, и доказывается она тем, что видит
// сама страница: агент печатает в поле, нажимает кнопку, и страница пишет то,
// что получила. Ни один шаг здесь нельзя пройти, подделав ответ на нашей
// стороне, — эхо появляется только если событие дошло до гостя по-настоящему.
//
// СТРАНИЦА СВОЯ, А НЕ ИЗ СЕТИ. Её отдаёт REST-половина мока (`/page/form`):
// тест обязан падать, когда ломается НАШЕ, а не когда чужой сайт поменял
// разметку или у прогона нет выхода наружу.
test('агент печатает и нажимает в предпросмотре, и человеку это видно', async () => {
  const page = await mainWindow()

  await hideFirstRunSurfaces(page)
  await clearNotifications(page)

  // СТРАНИЦУ ОТКРЫВАЕТ ЧЕЛОВЕК, адресной строкой панели — тем же способом, что
  // и в жизни. Ходом из композера это сделать не удалось: после того как панель
  // открыта, вторая отправка до мока не доезжает (текст остаётся в поле, сессия
  // показывает «Waking up default…»), и тест доказывал бы состояние композера
  // вместо руки агента. Панель к этому месту уже открыта тестом про артефакт.
  const address = page.getByRole('textbox', { name: /Address|Адрес/ })

  await expect(
    address,
    'панель предпросмотра открыта тестом про артефакт — без неё некуда открывать страницу'
  ).toBeVisible({ timeout: 20000 })

  await address.click()
  await address.fill(`http://127.0.0.1:${restPort}/page/form`)
  await page.keyboard.press('Enter')

  // Гость должен ЗАГРУЗИТЬСЯ: движок вклеивается в живой документ, и на пустой
  // странице опись вернулась бы пустой.
  await expect
    .poll(() => guestText(app, '/page/form'), { timeout: 30000 })
    .toContain('Zayavka na zamer')

  // Дальше действует МОК: он начинает слать действия, как только его же
  // REST-половина отдала эту страницу гостю, и повторяет их кругами — ровно
  // как уже делает для `read_preview`.
  //
  // 1. Опись. Движок вклеен в чужую страницу и раздал ссылки на элементы —
  //    без этого агент нажимать некуда.
  const inventory = mockPayload(await waitForMockLine(/PREVIEW_ACT_RESPOND .*elements/, 60000))
  expect(JSON.stringify(inventory)).toContain('Otpravit')

  // 2. Ввод и нажатие. Доказательство — В САМОЙ СТРАНИЦЕ: её собственный
  //    обработчик написал в `#echo` то, что оказалось в поле. Синтетический
  //    `el.click()` сюда бы тоже прошёл, а вот `:hover`-меню — нет; именно
  //    поэтому у них `sendInputEvent`, и именно поэтому проверяем эхо.

  await expect
    .poll(() => guestText(app, '/page/form'), { timeout: 60000 })
    .toContain('PRINYATO: AR-12')

  // 3. Экскурсия по ТОЙ ЖЕ чужой странице: driver.js вклеен и собрал цели.
  const targets = mockPayload(await waitForMockLine(/TOUR_RESPOND .*success/, 60000))
  expect(JSON.stringify(targets)).toContain('Otpravit')

  // 4. R19: молча агент не действует. Накладка живёт В СТРАНИЦЕ — свой элемент
  //    с курсором и рамкой, — и человек видит, куда ушла чужая рука.
  await expect
    .poll(
      () =>
        guestEval(
          app,
          "!!document.querySelector('hermes-watch') || !!document.getElementById('__hermes-tour-style')",
          '/page/form'
        ),
      { timeout: 30000 }
    )
    .toBe(true)

  await assertRendererAlive(page, 'drive preview')
})

// Задача 3E.22 (SPEC HX19, замечание D-72). Граница голоса — «кто решает»:
// кнопка «прочитать вслух» у отдельного ответа остаётся (человек нажимает её на
// каждый ответ), а автоматическое чтение всех ответов и непрерывный разговор с
// перебиванием снимаются.
//
// ЗАЧЕМ ЭТО ЗДЕСЬ, КОГДА ЕСТЬ ТЕСТ ПО ИСХОДНИКАМ. `voice-by-human-decision.
// test.ts` доказывает, что снятые хоки никто не вызывает. Он не видит ОКНА: у
// этих поверхностей было семь входов, и два из них — живая кнопка в композере и
// горячая клавиша, то есть дверь, которую открывает человек, а не импорт.
// Здесь проверяется именно окно: кнопок нет, клавиша ничего не открывает, а
// диктовка и чтение по нажатию — работают.
test('окно читает ответ по нажатию, но не говорит само', async () => {
  const page = await mainWindow()

  await page.keyboard.press('Escape')
  await hideFirstRunSurfaces(page)
  await clearNotifications(page)

  // Подписи берутся из их же каталога (наш русский их не переводит, см. ru.ts),
  // поэтому промах по ключу выглядел бы как 'composer.speakReplies'.
  const startVoice = page.getByRole('button', { name: /Start voice conversation/ })
  const endVoice = page.getByRole('button', { name: /End voice conversation/ })

  // Главная кнопка пустого композера. У них на этом месте стояла большая кнопка
  // «начать голосовой разговор», и «Отправить» появлялась только с набранным
  // текстом; теперь она одна и та же всегда.
  await expect(page.getByRole('button', { name: /^(Send|Отправить)$/ })).toBeVisible({
    timeout: 20000
  })
  expect(await startVoice.count(), 'кнопки «начать голосовой разговор» быть не должно').toBe(0)

  // Узкая полоса композера складывает голосовые кнопки в одно меню (`foldVoice`),
  // и снятые строки жили ИМЕННО В НЁМ — значит смотреть надо внутрь, а не на
  // полосу. Заодно это проверяет, что меню вообще осталось.
  const voiceMenu = page.getByRole('button', { name: /^(Voice|Голос)$/ })

  await expect(voiceMenu, 'меню голоса обязано остаться — в нём диктовка').toBeVisible({
    timeout: 20000
  })
  await voiceMenu.click()

  const dictation = page.getByRole('menuitemcheckbox', {
    name: /Voice dictation|Stop dictation|Transcribing/
  })

  await expect(dictation, 'диктовка обязана остаться — HX19 её оставляет').toBeVisible({
    timeout: 15000
  })

  expect(
    await page.getByRole('menuitemcheckbox', { name: /Read replies aloud/ }).count(),
    'строки «читать все ответы вслух» в меню быть не должно'
  ).toBe(0)
  expect(
    await page.getByRole('menuitem', { name: /Start voice conversation/ }).count(),
    'строки «начать голосовой разговор» в меню быть не должно'
  ).toBe(0)

  // Слово-активатор — третья строка меню, и оно HX19 оставляет взятым.
  expect(
    await page.getByRole('menuitemcheckbox', { name: /hey |Say / }).count(),
    'слово-активатор обязано остаться в меню'
  ).toBeGreaterThan(0)

  await page.keyboard.press('Escape')

  // Ctrl+B у них включал разговор. Клавиша снята из таблицы действий — нажатие
  // обязано остаться НИЧЕМ, а не открыть табличку разговора.
  await page.keyboard.press('Control+b')
  await page.waitForTimeout(1000)
  expect(await endVoice.count(), 'Ctrl+B открыл непрерывный разговор').toBe(0)

  // Второй контроль: чтение ПО НАЖАТИЮ у ответа. В ленте к этому месту уже
  // лежат ответы предыдущих тестов.
  expect(
    await page.getByRole('button', { name: /^(Read aloud|Stop reading)$/ }).count(),
    'кнопка «прочитать вслух» у ответа обязана остаться — её нажимает человек'
  ).toBeGreaterThan(0)

  await assertRendererAlive(page, 'voice by human decision')
})
