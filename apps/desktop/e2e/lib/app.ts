// Стенд автоприёмки (задача 3F.1): одно окно приложения на файл спеки, поднятое
// либо на mock-шлюзе (как `donor-shell-smoke.spec.ts`), либо на ЖИВОМ ядре во
// временном профиле — и тогда ядро поднимает само приложение, тем же путём,
// каким оно поднимает его у человека (`AEC_HERMES_HOME`, `AEC_SERVE_PORT`).
//
// Помощники ниже — копия проверенных в smoke (страховка D-82, выбор главного
// окна D-70, оживление сдавшейся панели D-82, поверхности первого запуска).
// Smoke не трогается: он гейт и опора для сравнения, а этот файл — его
// параметризованная версия, где стенд передаётся явно, а не лежит в модуле.

import {
  test,
  expect,
  _electron,
  type ElectronApplication,
  type Locator,
  type Page
} from '@playwright/test'
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepareProfile, removeProfile } from './core'
import { record } from './evidence'

export const desktopDir = join(__dirname, '..', '..')
export const repoRoot = join(desktopDir, '..', '..')
export const venvPython = join(repoRoot, 'runtime', '.hermes-venv', 'Scripts', 'python.exe')
export const rootPython = join(repoRoot, '.venv', 'Scripts', 'python.exe')
/** Префикс временного профиля прогона — тот же, что у smoke: по нему сирота
 *  прошлого прогона отличается от любого другого Electron на машине (D-82). */
export const E2E_PROFILE_PREFIX = 'aecpilot-e2e-profile-'
const closeGraceMs = 90000

export type StandMode = 'mock' | 'live'

export interface Stand {
  mode: StandMode
  app: ElectronApplication
  /** Временный `userData` приложения. */
  userDataDir: string
  /** Папка проекта (vault), заведённая до старта окна. */
  projectDir: string
  /** Живой режим: временный профиль ядра (копия dev-profile) и порт шлюза. */
  profileDir?: string
  servePort?: number
  /** Mock-режим: порты мока. */
  mockPort?: number
  restPort?: number
  mainOutput(): string
  mockOutput(): string
  waitForMockLine(pattern: RegExp, timeoutMs?: number): Promise<string>
  /** Перезапуск приложения на тех же папках — для позиций «пережило
   *  перезапуск». Возвращает новый `ElectronApplication`. */
  relaunch(): Promise<ElectronApplication>
  close(): Promise<void>
}

export interface LaunchOptions {
  mode: StandMode
  /** Готовая папка проекта; без неё стенд заводит пустую временную. */
  projectDir?: string
  /** Живой режим: готовый профиль; без него стенд копирует dev-profile сам. */
  profileDir?: string
  /** Живой режим: копия профиля без `.env` — ядро без ключа провайдера. */
  withoutProviderKey?: boolean
  /** Живой режим, D-117 (решение владельца 24.09.2026): положить ключи
   *  провайдера из `.env` копии профиля в хранилище приложения — тем же
   *  `saveProviderKey`, каким их сохраняет человек. Индексацию и граф
   *  приложение запускает само, с ключом из СВОЕГО хранилища; без этого на
   *  стенде не индексируется ни один файл. Опция, а не умолчание: сохранение
   *  перезапускает ядро, остальным спекам эта цена не нужна. */
  providerKeyInStore?: boolean
  /** Дополнительное окружение приложения. */
  env?: Record<string, string>
  /** Имя для файлов журналов в `test-results/` (обычно имя спеки). */
  label?: string
}

/** Ключи провайдеров из `.env` профиля: `ИМЯ_API_KEY=значение`. Значения
 *  не печатаются и никуда, кроме хранилища приложения, не уходят. */
function profileProviderKeys(profileDir: string): Array<{ envVar: string; key: string }> {
  const file = join(profileDir, '.env')
  if (!existsSync(file)) return []
  const keys: Array<{ envVar: string; key: string }> = []
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*_API_KEY)\s*=\s*(.*?)\s*$/)
    if (!match) continue
    const key = match[2].replace(/^(['"])(.*)\1$/, '$2')
    if (key) keys.push({ envVar: match[1], key })
  }
  return keys
}

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

/** Живые electron.exe с e2e-профилем в командной строке, кроме своего (D-82). */
export function listE2eLeftovers(exceptProfile?: string): number[] {
  if (process.platform !== 'win32') return []
  try {
    const output = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        'Get-CimInstance Win32_Process -Filter "Name=\'electron.exe\'" | ' +
          'Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress'
      ],
      { encoding: 'utf8' }
    )
    const parsed: unknown = JSON.parse(output.trim() || 'null')
    const rows = Array.isArray(parsed) ? parsed : parsed ? [parsed] : []
    return rows
      .filter((row) => {
        const line = String((row as { CommandLine?: string }).CommandLine ?? '')
        return line.includes(E2E_PROFILE_PREFIX) && !(exceptProfile && line.includes(exceptProfile))
      })
      .map((row) => Number((row as { ProcessId: number }).ProcessId))
  } catch {
    return []
  }
}

export function getFreePort(): Promise<number> {
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

export function killProcessTree(pid: number | undefined): void {
  if (!pid) return
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore' })
    } else {
      process.kill(pid, 'SIGKILL')
    }
  } catch {
    // уже вышел
  }
}

async function spawnMock(projectDir: string): Promise<{
  proc: ChildProcessWithoutNullStreams
  port: number
  restPort: number
  output(): string
}> {
  const port = await getFreePort()
  let output = ''
  const proc = spawn(venvPython, [join(desktopDir, 'e2e', 'mock_gateway.py'), String(port)], {
    cwd: desktopDir,
    // Без этого Windows отдаёт stdout мока в кодировке консоли, и русская
    // строка приезжает мусором (замер задачи 5.14).
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
  })
  proc.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()))
  proc.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()))

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('mock_gateway.py did not print MOCK_READY within 15s')),
      15000
    )
    const check = (): void => {
      if (output.includes('MOCK_READY') && output.includes('MOCK_REST_READY')) {
        clearTimeout(timeout)
        resolve()
      }
    }
    proc.stdout.on('data', check)
    proc.on('error', (error) => {
      clearTimeout(timeout)
      reject(new Error(`mock gateway python not found at ${venvPython} (${error.message})`))
    })
  })

  const restLine = output.split(/\r?\n/).find((line) => line.startsWith('MOCK_REST_READY'))
  if (!restLine) throw new Error(`mock never printed MOCK_REST_READY — got:\n${output}`)
  const restPort = Number(restLine.split(' ')[1])

  // Их боковая панель показывает только сессии открытого проекта и грузит
  // список один раз, рано — папка заводится ДО старта окна (замер smoke).
  await fetch(`http://127.0.0.1:${restPort}/api/_mock/cwd`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cwd: projectDir })
  })

  return { proc, port, restPort, output: () => output }
}

/** Поднять окно приложения. Живой режим: временный профиль + свободный порт,
 *  ядро стартует главный процесс — как у человека. */
export async function launchStand(options: LaunchOptions): Promise<Stand> {
  const leftovers = listE2eLeftovers()
  if (leftovers.length > 0) {
    throw new Error(
      `[e2e] рядом живы electron.exe с e2e-профилем: ${leftovers.join(', ')}. ` +
        'Это либо сирота прерванного набора, либо второй набор, идущий прямо сейчас (D-82). ' +
        `Дождитесь того прогона или закройте их: Stop-Process -Id ${leftovers.join(',')} -Force`
    )
  }

  const label = options.label ?? 'acceptance'
  const projectDir = options.projectDir ?? mkdtempSync(join(tmpdir(), 'aecpilot-e2e-'))
  const ownsProject = !options.projectDir
  const userDataDir = mkdtempSync(join(tmpdir(), E2E_PROFILE_PREFIX))
  const preExisting = listElectronPids()
  let mainOutput = ''

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    ...options.env
  }
  let mock: Awaited<ReturnType<typeof spawnMock>> | undefined
  let profileDir: string | undefined
  let servePort: number | undefined
  let ownsProfile = false

  if (options.mode === 'mock') {
    mock = await spawnMock(projectDir)
    env.AEC_GATEWAY_URL = `ws://127.0.0.1:${mock.port}/api/ws`
    env.AEC_GATEWAY_REST_URL = `http://127.0.0.1:${mock.restPort}`
  } else {
    profileDir =
      options.profileDir ?? prepareProfile({ withoutProviderKey: options.withoutProviderKey })
    ownsProfile = !options.profileDir
    servePort = await getFreePort()
    env.AEC_HERMES_HOME = profileDir
    env.AEC_SERVE_PORT = String(servePort)
    delete env.AEC_GATEWAY_URL
    delete env.AEC_GATEWAY_REST_URL
  }

  if (process.env.AEC_KEEP_PROFILE && profileDir) {
    console.warn(`[e2e] live профиль: ${profileDir} порт: ${servePort}`)
  }

  /** Поднять процесс приложения на тех же папках. Отдельной функцией, потому
   *  что `relaunch()` делает ровно это второй раз. */
  async function spawnApp(): Promise<ElectronApplication> {
    const started = await _electron.launch({
      args: ['.', `--user-data-dir=${userDataDir}`],
      cwd: desktopDir,
      env
    })
    // Окно рабочего размера: в низком окне нижние строки боковой панели
    // перехватывает прокручиваемый контейнер (замер smoke, 3D.3).
    // Изредка (замер 24.09.2026, 2 из ~10 запусков) вызов попадает в момент
    // перезагрузки контекста и падает «Execution context was destroyed» —
    // стенд тогда не поднимается вовсе. Повтор через секунду.
    for (let attempt = 1; ; attempt += 1) {
      try {
        await started.evaluate(({ BrowserWindow }) => {
          BrowserWindow.getAllWindows()[0]?.setBounds({ x: 0, y: 0, width: 1500, height: 1260 })
        })
        break
      } catch (error) {
        if (attempt >= 3 || !/Execution context was destroyed/.test(String(error))) throw error
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }
    started.process().stdout?.on('data', (chunk: Buffer) => (mainOutput += chunk.toString()))
    started.process().stderr?.on('data', (chunk: Buffer) => (mainOutput += chunk.toString()))
    return started
  }

  const app = await spawnApp()

  const stand: Stand = {
    mode: options.mode,
    app,
    userDataDir,
    projectDir,
    profileDir,
    servePort,
    mockPort: mock?.port,
    restPort: mock?.restPort,
    mainOutput: () => mainOutput,
    mockOutput: () => mock?.output() ?? '',
    async waitForMockLine(pattern, timeoutMs = 30000) {
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        const line = stand
          .mockOutput()
          .split(/\r?\n/)
          .find((candidate) => pattern.test(candidate))
        if (line) return line
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      throw new Error(`mock never printed ${pattern} — got:\n${stand.mockOutput()}`)
    },
    /** Закрыть и поднять приложение заново НА ТЕХ ЖЕ папках: `userData` и
     *  проект переживают перезапуск — именно это проверяют позиции вида
     *  «выбор пережил перезапуск». Мок и профиль ядра не трогаются. */
    async relaunch() {
      await stopApp()
      stand.app = await spawnApp()
      return stand.app
    },
    async close() {
      await stopApp()
      try {
        mkdirSync(join(desktopDir, 'test-results'), { recursive: true })
        writeFileSync(join(desktopDir, 'test-results', `${label}-main-output.log`), mainOutput)
        if (mock) {
          writeFileSync(join(desktopDir, 'test-results', `${label}-mock-output.log`), mock.output())
        }
      } catch {
        // журнал — не цель прогона
      }
      killProcessTree(mock?.proc.pid)
      if (ownsProject) rmSync(projectDir, { force: true, recursive: true })
      rmSync(userDataDir, { force: true, recursive: true })
      if (ownsProfile && profileDir) removeProfile(profileDir)
    }
  }

  /** Погасить текущий процесс приложения вместе с деревом (в живом режиме ядро
   *  — его потомок) и добить всё, чего не было до старта стенда. */
  async function stopApp(): Promise<void> {
    const electronPid = appProcess(stand.app)?.pid
    try {
      await Promise.race([
        stand.app.close(),
        new Promise((_resolve, reject) =>
          setTimeout(() => reject(new Error('app.close() timed out')), closeGraceMs)
        )
      ])
    } catch (error) {
      console.warn(`[e2e] ${(error as Error).message} — force-killing Electron`)
    } finally {
      killProcessTree(electronPid)
      for (const pid of listElectronPids()) {
        if (!preExisting.has(pid)) killProcessTree(pid)
      }
    }
  }

  if (options.providerKeyInStore && profileDir) {
    const keys = profileProviderKeys(profileDir)
    if (keys.length === 0) throw new Error('providerKeyInStore: в .env профиля нет ключей провайдера')
    const first = await mainWindow(stand)
    await first.waitForFunction(() => Boolean(window.aecpilot?.saveProviderKey), undefined, { timeout: 60000 })
    for (const entry of keys) {
      const saved = (await first.evaluate((e) => window.aecpilot.saveProviderKey(e), entry)) as { ok?: boolean }
      if (saved?.ok === false) throw new Error(`providerKeyInStore: ${entry.envVar} не сохранён`)
    }
  }

  return stand
}

/** Окна ПРИЛОЖЕНИЯ — без гостей предпросмотра (D-70): наш рендерер грузится
 *  файлом, любая чужая страница в панели — по сети. */
export function appWindows(stand: Stand): Page[] {
  return stand.app.windows().filter((candidate) => candidate.url().startsWith('file://'))
}

/** Главное окно, ДОЖДАВШЕЕСЯ своего рендерера (обе беды `firstWindow()` — D-70).
 *  Живой режим гейтит окно за проверкой здоровья шлюза (до 240 с на холодном
 *  старте ядра), поэтому ждём окно дольше умолчательных 30 с — иначе медленный
 *  первый старт роняет тест, хотя окно ещё появится. */
export async function mainWindow(stand: Stand): Promise<Page> {
  const firstWindowTimeout = stand.mode === 'live' ? 240000 : 60000
  const page = await stand.app.firstWindow({ timeout: firstWindowTimeout })
  const main = appWindows(stand).find((candidate) => !candidate.url().includes('win=')) ?? page
  await main.waitForFunction(
    () => (window as unknown as { hermesDesktop?: unknown }).hermesDesktop !== undefined,
    undefined,
    { timeout: 60000 }
  )
  return main
}

const consentHandlerInstalled = new WeakSet<Page>()

/** Открыть панель терминала справа — как человек: пункт «Терминал» в строке
 *  состояния по умолчанию скрыт и включается правым кликом по ней, а сама
 *  кнопка — одна иконка с подсказкой, доступного имени у неё нет. */
export async function openTerminalPane(page: Page): Promise<void> {
  const bar = page.locator('[data-slot="statusbar"]')
  await bar.click({ button: 'right' })
  const toggle = page.getByRole('menuitemcheckbox', { name: 'Терминал' })
  await expect(toggle).toBeVisible()
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click()
  await page.keyboard.press('Escape')
  // Кнопка переключает панель; открытую выдаёт подсветка (`terminalShowing`).
  const button = bar.locator('button:has(svg.tabler-icon-terminal-2)')
  if (!((await button.getAttribute('class')) ?? '').includes('bg-accent/55')) await button.click()
}

/** Убрать поверхности первого запуска: их оверлей загрузки, нашу карточку
 *  «С чего начать» и диалог согласия на настоящий профиль браузера. */
export async function hideFirstRunSurfaces(page: Page): Promise<void> {
  const style = {
    content: `
      .z-\\(--z-onboarding\\) { display: none !important }
      [role='region'][aria-label='Getting started'],
      [role='region'][aria-label='С чего начать'] { display: none !important }
    `
  }
  // Сразу после перезагрузки окна вызов изредка ловит чужое сообщение —
  // отчёт CSP о заблокированной рамке их каталога плагинов (блокировка верная,
  // замер 24.09.2026) — и падает. Повтор через секунду.
  await page.addStyleTag(style).catch(async () => {
    await page.waitForTimeout(1000)
    await page.addStyleTag(style)
  })
  if (!consentHandlerInstalled.has(page)) {
    consentHandlerInstalled.add(page)
    await page.addLocatorHandler(
      page.getByRole('button', { name: /^(Not now|Не сейчас)$/ }),
      async (notNow) => {
        await notNow.click().catch(() => undefined)
      }
    )
  }
}

/** Панель сессии сдалась — нажать «Повторить», как нажал бы человек (D-82). */
export async function reviveStrandedSession(page: Page): Promise<Locator> {
  const composer = page.getByRole('textbox', { name: /Message|Сообщение/ })
  const stranded = page.getByRole('heading', {
    name: /Couldn't load this session|Не удалось (открыть эту сессию|загрузить этот сеанс)/
  })
  await expect(composer.or(stranded).first()).toBeVisible({ timeout: 60000 })
  if (await stranded.isVisible()) {
    console.warn('[e2e] панель сессии сдалась — нажимаю «Повторить», как нажал бы человек')
    await page
      .getByRole('button', { name: /^(Retry|Повторить)$/ })
      .first()
      .click()
    await expect(stranded).toBeHidden({ timeout: 60000 })
  }
  return composer
}

/** Напечатать в их композер и отправить их же кнопкой (Enter после первого
 *  хода попадает в «Queue message»). */
export async function send(page: Page, text: string): Promise<void> {
  const composer = await reviveStrandedSession(page)
  await composer.click()
  await page.keyboard.type(text)
  await page.getByRole('button', { name: /^(Send|Отправить)$/ }).click()
}

/** Убрать тосты — best-effort: снять то, что перекрывает. Поиск по CSS, а не
 *  по роли: пока открыто модальное окно, их область уведомлений помечена
 *  `aria-hidden`, но лежит ВЫШЕ окна и принимает щелчки (замер 25.09.2026). */
export async function clearNotifications(page: Page): Promise<void> {
  const dismiss = page.locator(
    'button[aria-label="Закрыть уведомление"], button[aria-label="Dismiss notification"]'
  )
  for (let guard = 0; guard < 10 && (await dismiss.count()) > 0; guard += 1) {
    await dismiss
      .first()
      .click({ timeout: 2000 })
      .catch(() => undefined)
  }
}

/** Жив ли рендерер — не заменил ли его их аварийный экран (D-42). */
export async function assertRendererAlive(page: Page, label: string): Promise<void> {
  const broken = await page
    .getByRole('heading', { name: /Something broke|Что-то сломалось/ })
    .count()
  if (broken > 0) throw new Error(`RENDERER DIED at ${label}`)
}

/** Открыть проект тем же путём, что экран создания: человек «выбрал» папку в
 *  нативном диалоге (подменён), затем два IPC. Возвращает страницу с живым
 *  композером. */
export async function openProject(stand: Stand, page: Page): Promise<void> {
  await stand.app.evaluate(({ dialog }, dir) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [dir] })) as never
  }, stand.projectDir)
  const picked = await page.evaluate(() => window.aecpilot.pickProjectDirectory())
  expect(picked, 'pickProjectDirectory должен вернуть подменённую папку').toBe(stand.projectDir)
  const created = await page.evaluate(
    (dir) => window.aecpilot.createProject(dir, 'e2e', true),
    stand.projectDir
  )
  expect(created, `createProject failed: ${JSON.stringify(created)}`).toMatchObject({ ok: true })
  const composer = page.getByRole('textbox', { name: /Message|Сообщение/ })
  await expect(composer).toBeVisible({ timeout: 120000 })
  await expect(composer).not.toHaveAttribute('data-placeholder', /Starting|Reconnecting|Запуск/, {
    timeout: 120000
  })
}

/** Последние `count` непустых строк журнала с отступом. */
function tail(text: string, count: number): string {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .slice(-count)
    .map((line) => `      | ${line}`)
    .join('\n')
}

/** Один стенд на файл спеки: `beforeAll` поднимает, `afterAll` гасит,
 *  `afterEach` печатает состояние стенда при падении (разбор D-82). */
/** Процесс приложения, или undefined, если приложение уже вышло само: у
 *  вышедшего `ElectronApplication.process()` бросает, а не возвращает пустое.
 *  Позиция 38.20.2 закрывает приложение внутри теста. */
function appProcess(app: ElectronApplication): ReturnType<ElectronApplication['process']> | undefined {
  try {
    return app.process()
  } catch {
    return undefined
  }
}

export function standFixture(options: LaunchOptions): { get(): Stand } {
  let stand: Stand | undefined

  test.beforeAll(async () => {
    stand = await launchStand(options)
  })

  test.afterAll(async () => {
    test.setTimeout(closeGraceMs + 30000)
    await stand?.close()
    stand = undefined
  })

  // eslint-disable-next-line no-empty-pattern
  test.afterEach(async ({}, testInfo) => {
    if (!stand) return
    // Свидетельство по каждому тесту с номером позиции — снимок главного окна
    // и вердикт; тест без номера (подготовка) в отчёт не попадает.
    if (appProcess(stand.app)?.exitCode === null && /^\d/.test(testInfo.title)) {
      const main = appWindows(stand).find((candidate) => !candidate.url().includes('win='))
      await record(testInfo, main)
    }
    if (testInfo.status === testInfo.expectedStatus) return
    const windows = stand.app.windows().map((candidate) => {
      const url = candidate.url()
      return url.length > 120 ? `…${url.slice(-120)}` : url
    })
    console.warn(
      [
        `[e2e] ПАДЕНИЕ «${testInfo.title}» — состояние стенда на этот момент:`,
        `      режим: ${stand.mode}; профиль прогона: ${stand.userDataDir}`,
        `      ЧУЖИЕ e2e-электроны: ${listE2eLeftovers(stand.userDataDir).join(', ') || 'нет'}`,
        `      своё приложение живо: ${appProcess(stand.app)?.exitCode === null ? 'да' : 'нет'}`,
        `      окон у приложения: ${windows.length}`,
        ...windows.map((line) => `        - ${line}`),
        `      --- последнее от главного процесса ---`,
        tail(stand.mainOutput(), 12),
        ...(stand.mode === 'mock'
          ? [`      --- последнее от мока ---`, tail(stand.mockOutput(), 12)]
          : [])
      ].join('\n')
    )
  })

  return {
    get() {
      if (!stand) throw new Error('стенд ещё не поднят — вызов до beforeAll')
      return stand
    }
  }
}

/** Подключить папку источником так, как это делает человек: главный процесс
 *  пускает только папку, выбранную в диалоге (D-47), поэтому диалог подменяется
 *  ответом `dir`, и выбор идёт настоящим `project:pick-directory`. */
export async function addSourceAsUser(stand: Stand, page: Page, dir: string): Promise<unknown> {
  await stand.app.evaluate(({ dialog }, target) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [target] })) as never
  }, dir)
  expect(await page.evaluate(() => window.aecpilot.pickProjectDirectory())).toBe(dir)
  return page.evaluate((root) => window.aecpilot.addSource(root, true), dir)
}

/** После перезапуска приложение открывает экран выбора проекта, а не проект
 *  (D-89, решает владелец). Человек щёлкает проект в «недавних» — так и здесь. */
export async function reopenRecentProject(page: Page): Promise<void> {
  // С задачи 3G.20 (D-89) приложение само открывает последний проект; экран
  // выбора остаётся запасным путём — если он всё же пришёл, проект открывается
  // щелчком по недавнему, как это сделал бы человек.
  const recent = page.getByRole('button', { name: /^e2e\s/ }).first()
  const composer = page.getByRole('textbox', { name: /Message|Сообщение/ })
  await expect(recent.or(composer).first()).toBeVisible({ timeout: 120000 })
  if (await recent.isVisible()) await recent.click()
  await expect(composer).toBeVisible({ timeout: 120000 })
  await expect(composer).not.toHaveAttribute('data-placeholder', /Starting|Reconnecting|Запуск/, {
    timeout: 120000
  })
}
