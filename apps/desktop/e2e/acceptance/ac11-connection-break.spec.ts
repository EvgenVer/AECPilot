// Задача T35 (SPEC AC11, обрыв связи): клиент показывает обрыв связи с сервером
// СОСТОЯНИЕМ, а не пустыми панелями, и возвращается сам, когда сервер снова поднят.
//
// Отдельно от `ac11-server-client.spec.ts` и бесплатно (правило владельца 2026-10-21):
// ни индексации, ни ходов модели. Профиль — копия без `.env`, у сервера и клиента —
// временные userData, так что ключа модели нет нигде и обратиться к ней нечем.
// Сервер останавливается целиком — так выглядят и обрыв туннеля, и выключенная машина.
//
// Переменные: `AEC_E2E_SERVER_EXE`, `AEC_E2E_CLIENT_EXE` — exe установок «только сервер»
// и «только приложение».

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { _electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

import { getFreePort, hideFirstRunSurfaces, killProcessTree } from '../lib/app'
import { prepareProfile, removeProfile, SHIPPED_SKILLS_COPY } from '../lib/core'
import { record } from '../lib/evidence'

test.describe.configure({ mode: 'serial' })

const serverExe = process.env.AEC_E2E_SERVER_EXE ?? ''
const clientExe = process.env.AEC_E2E_CLIENT_EXE ?? ''

test.skip(!serverExe || !clientExe, 'нужны AEC_E2E_SERVER_EXE и AEC_E2E_CLIENT_EXE')

let profile = ''
let port = 0
let serverUserData = ''
let clientUserData = ''
let projectDir = ''
let server: ElectronApplication | undefined
let client: ElectronApplication | undefined
let page: Page

function portOpen(target: number): Promise<boolean> {
  return new Promise((resolveOpen) => {
    const socket = connect({ host: '127.0.0.1', port: target })
    socket.once('connect', () => {
      socket.destroy()
      resolveOpen(true)
    })
    socket.once('error', () => resolveOpen(false))
  })
}

async function startServer(): Promise<ElectronApplication> {
  const app = await _electron.launch({
    executablePath: serverExe,
    args: ['--server', `--user-data-dir=${serverUserData}`],
    cwd: dirname(serverExe),
    env: {
      ...(process.env as Record<string, string>),
      AEC_HERMES_HOME: profile,
      AEC_SERVE_PORT: String(port),
      AEC_SKILLS_DIR: join(profile, SHIPPED_SKILLS_COPY)
    },
    timeout: 120000
  })
  await expect
    .poll(() => portOpen(port), {
      timeout: 240000,
      intervals: [2000],
      message: 'шлюз сервера поднят'
    })
    .toBe(true)
  return app
}

async function stopApp(app: ElectronApplication | undefined): Promise<void> {
  if (!app) return
  const pid = (() => {
    try {
      return app.process().pid
    } catch {
      return undefined
    }
  })()
  await app.close().catch(() => undefined)
  killProcessTree(pid)
}

function gatewayState(): Promise<string> {
  return page.evaluate(() => window.aecpilot.getGatewayState())
}

test.beforeAll(async () => {
  profile = prepareProfile({ withoutProviderKey: true })
  port = await getFreePort()
  serverUserData = mkdtempSync(join(tmpdir(), 'aecpilot-break-server-'))
  clientUserData = mkdtempSync(join(tmpdir(), 'aecpilot-break-client-'))
  // Пустой проект на «диске сервера»: без источников индексировать нечего.
  projectDir = join(mkdtempSync(join(tmpdir(), 'aecpilot-break-docs-')), 'project')
  mkdirSync(projectDir, { recursive: true })
})

test.afterAll(async () => {
  await stopApp(client)
  await stopApp(server)
  if (profile) removeProfile(profile)
  for (const dir of [serverUserData, clientUserData, projectDir ? dirname(projectDir) : '']) {
    if (dir) rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 1000 })
  }
})

test('AC11.8 обрыв: сервер остановлен — клиент показывает состояние и возвращается сам', async () => {
  server = await startServer()
  const token = await server.evaluate(({ app, safeStorage }) => {
    const fs = process.getBuiltinModule('node:fs')
    const path = process.getBuiltinModule('node:path')
    const stored = JSON.parse(
      fs.readFileSync(path.join(app.getPath('userData'), 'server-token.json'), 'utf8')
    ) as { encoding: string; token: string }
    return stored.encoding === 'safe'
      ? safeStorage.decryptString(Buffer.from(stored.token, 'base64'))
      : ''
  })
  expect(token, 'токен сервера сохранён зашифрованным').toMatch(/^[0-9a-f]{32,}$/)

  client = await _electron.launch({
    executablePath: clientExe,
    args: [`--user-data-dir=${clientUserData}`],
    cwd: dirname(clientExe),
    timeout: 120000
  })
  const first = await client.firstWindow({ timeout: 240000 })
  page =
    client
      .windows()
      .find(
        (candidate) => candidate.url().startsWith('file://') && !candidate.url().includes('win=')
      ) ?? first
  await page.waitForFunction(
    () => (window as unknown as { hermesDesktop?: unknown }).hermesDesktop !== undefined,
    undefined,
    { timeout: 60000 }
  )
  await hideFirstRunSurfaces(page)
  const applied = await page.evaluate(
    ({ url, secret }) =>
      window.aecpilot.applyConnection({ mode: 'remote', remoteUrl: url, remoteToken: secret }),
    { url: `http://127.0.0.1:${port}`, secret: token }
  )
  expect(applied, 'подключение сохранено').toMatchObject({ ok: true })
  await expect
    .poll(gatewayState, { timeout: 120000, intervals: [2000], message: 'клиент на связи' })
    .toBe('ready')
  // Обрыв показывают строка состояния и поле ввода оболочки проекта — стартовый экран
  // без проекта о связи не говорит, поэтому проект открыт (пустой, на диске сервера).
  const created = await page.evaluate(
    (dir) => window.aecpilot.createProject(dir, 'AC11-break', true),
    projectDir
  )
  expect(created, JSON.stringify(created)).toMatchObject({ ok: true })
  const composer = page.getByRole('textbox', { name: /Message|Сообщение/ })
  await expect(composer).toBeVisible({ timeout: 120000 })
  await record(test.info(), page, { note: 'на связи' })

  await stopApp(server)
  server = undefined
  await expect
    .poll(() => portOpen(port), { timeout: 60000, intervals: [2000], message: 'шлюз сервера снят' })
    .toBe(false)
  await expect
    .poll(gatewayState, { timeout: 120000, intervals: [2000], message: 'клиент заметил обрыв' })
    .not.toBe('ready')
  const broken = await gatewayState()
  console.log(`AC11.8 состояние клиента при обрыве: ${broken}`)
  // Человек видит обрыв словами в поле ввода, а не пустую панель.
  await expect(composer).toHaveAttribute('data-placeholder', /Переподключение|Reconnecting/, {
    timeout: 60000
  })
  console.log(`AC11.8 поле ввода: ${await composer.getAttribute('data-placeholder')}`)
  // Снимок — для глаз: что видит человек при обрыве.
  await record(test.info(), page, { note: `обрыв: ${broken}` })

  server = await startServer()
  await expect
    .poll(gatewayState, {
      timeout: 240000,
      intervals: [3000],
      message: 'клиент вернулся сам, без нового подключения'
    })
    .toBe('ready')
  await expect(composer).not.toHaveAttribute('data-placeholder', /Переподключение|Reconnecting/, {
    timeout: 60000
  })
  await record(test.info(), page, { note: 'связь восстановлена' })
})
