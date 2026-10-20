// Задача T36 (SPEC AC11, решение владельца 2026-10-16): серверный профиль двумя
// установками на одной машине. Сервер — `AECPilot.exe --server` из каталога «только
// сервер», клиент — из каталога «только приложение» (своего ядра нет); клиент ходит
// к шлюзу сервера по петлевому порту, как к концу SSH-туннеля.
//
// Сценарий: сервер без окна и только на 127.0.0.1 → клиент подключается токеном
// сервера → открывает проект на диске сервера → подключает там два источника и
// запускает индексацию (её делает сервер, T35.1) → вопрос с цитатой → щелчок открывает
// PDF на нужной странице → разделение: `.aecpilot/`, ядро и наши MCP есть только у
// сервера → клиент закрыт, а сервер сам замечает новый файл в источнике (T34).
//
// Переменные: `AEC_E2E_SERVER_EXE`, `AEC_E2E_CLIENT_EXE` (exe двух установок),
// `AEC_E2E_SERVER_DOCS` (папка «диска сервера» для проекта и источников). Токен
// сервера читается внутри его же процесса (safeStorage) и нигде не печатается:
// буфер обмена процессам агента недоступен (замер 2026-09-19).

import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { _electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

import { getFreePort, hideFirstRunSurfaces, killProcessTree } from '../lib/app'
import { prepareProfile, removeProfile, SHIPPED_SKILLS_COPY } from '../lib/core'
import { record } from '../lib/evidence'
import { recordChatEvents, turn } from '../lib/turn'
import { addPdf, makeSampleVault, SAMPLE, type SampleVault } from '../lib/vault'

test.describe.configure({ mode: 'serial' })

const serverExe = process.env.AEC_E2E_SERVER_EXE ?? ''
const clientExe = process.env.AEC_E2E_CLIENT_EXE ?? ''
const serverDocs = process.env.AEC_E2E_SERVER_DOCS ?? ''

test.skip(
  !serverExe || !clientExe || !serverDocs,
  'нужны AEC_E2E_SERVER_EXE, AEC_E2E_CLIENT_EXE, AEC_E2E_SERVER_DOCS'
)

let profile = ''
let port = 0
let token = ''
let server: ElectronApplication | undefined
let client: ElectronApplication | undefined
let clientUserData = ''
let page: Page
let sample: SampleVault
let runDir = ''
let projectDir = ''
let sourceA = ''
let sourceB = ''
let serverOutput = ''

interface IngestState {
  running: boolean
  lastReport?: { files_total: number } | null
}

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

function listeningAddresses(target: number): string[] {
  const out = execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `Get-NetTCPConnection -State Listen -LocalPort ${target} -ErrorAction SilentlyContinue | ForEach-Object { $_.LocalAddress }`
    ],
    { encoding: 'utf8' }
  )
  return out.split(/\r?\n/).filter(Boolean)
}

/** Все папки `.aecpilot` и файлы индекса под `root` (без захода в ядро и модели). */
function findIndexTraces(root: string): string[] {
  const found: string[] = []
  const walk = (dir: string, depth: number): void => {
    if (depth > 6) return
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const name of entries) {
      const full = join(dir, name)
      let isDir = false
      try {
        isDir = statSync(full).isDirectory()
      } catch {
        continue
      }
      if (name === '.aecpilot' || name === 'index.db') found.push(full)
      else if (isDir) walk(full, depth + 1)
    }
  }
  walk(root, 0)
  return found
}

/** Рекурсивная копия. Не `cpSync`: в Node 22.23 раннера на Windows он пишет кириллическое
 *  имя назначения в кодировке ANSI («проект» → «РїСЂРѕРµРєС‚», замер 2026-10-20), а
 *  кириллические папки на «диске сервера» здесь нарочно — их путь идёт через ядро. */
function copyTree(from: string, to: string): void {
  mkdirSync(to, { recursive: true })
  for (const name of readdirSync(from)) {
    const source = join(from, name)
    const target = join(to, name)
    if (statSync(source).isDirectory()) copyTree(source, target)
    else copyFileSync(source, target)
  }
}

test.beforeAll(async () => {
  profile = prepareProfile()
  port = await getFreePort()
  runDir = join(serverDocs, `ac11-${Date.now()}`)
  mkdirSync(runDir, { recursive: true })
  sample = await makeSampleVault()
  projectDir = join(runDir, 'проект')
  sourceA = join(runDir, 'задания')
  sourceB = join(runDir, 'протоколы')
  copyTree(sample.vault, projectDir)
  copyTree(sample.sourceA, sourceA)
  copyTree(sample.sourceB, sourceB)
  clientUserData = mkdtempSync(join(tmpdir(), 'aecpilot-ac11-client-'))
})

test.afterAll(async () => {
  for (const running of [client, server]) {
    if (!running) continue
    const pid = (() => {
      try {
        return running.process().pid
      } catch {
        return undefined
      }
    })()
    await running.close().catch(() => undefined)
    killProcessTree(pid)
  }
  if (profile) removeProfile(profile)
  if (clientUserData) rmSync(clientUserData, { recursive: true, force: true })
  if (runDir) rmSync(runDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 1000 })
})

test('AC11.1 сервер: без окна, шлюз только на 127.0.0.1, токен постоянный', async () => {
  server = await _electron.launch({
    executablePath: serverExe,
    args: ['--server'],
    cwd: dirname(serverExe),
    env: {
      ...(process.env as Record<string, string>),
      AEC_HERMES_HOME: profile,
      AEC_SERVE_PORT: String(port),
      AEC_SKILLS_DIR: join(profile, SHIPPED_SKILLS_COPY)
    },
    timeout: 120000
  })
  // Журнал сервера — для разбора: окна у него нет, а `console.log` главного процесса
  // идёт сюда.
  const output = (chunk: Buffer): void => {
    serverOutput = (serverOutput + chunk.toString('utf8')).slice(-200000)
  }
  server.process().stdout?.on('data', output)
  server.process().stderr?.on('data', output)
  await expect
    .poll(() => portOpen(port), {
      timeout: 240000,
      intervals: [2000],
      message: 'шлюз сервера поднят'
    })
    .toBe(true)
  const addresses = listeningAddresses(port)
  console.log(`AC11.1 слушает: ${addresses.join(', ')}`)
  expect(addresses.length).toBeGreaterThan(0)
  expect(addresses.every((address) => address === '127.0.0.1')).toBe(true)
  expect(await server.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(0)

  token = await server.evaluate(({ app, safeStorage }) => {
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
})

test('AC11.2 клиент без своего ядра подключается к серверу', async () => {
  expect(existsSync(join(dirname(clientExe), 'runtime', 'core')), 'у клиента нет ядра').toBe(false)
  expect(existsSync(join(dirname(clientExe), 'runtime', 'mcp')), 'у клиента нет наших MCP').toBe(
    false
  )
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
    .poll(() => page.evaluate(() => window.aecpilot.getGatewayState()), {
      timeout: 120000,
      intervals: [2000],
      message: 'клиент связан со шлюзом сервера'
    })
    .toBe('ready')
  // Токен — в safeStorage клиента, открытым текстом его нет ни в одном файле настроек.
  const plain = readdirSync(clientUserData)
    .filter((name) => name.endsWith('.json'))
    .filter((name) => readFileSync(join(clientUserData, name), 'utf8').includes(token))
  expect(plain, 'токен открытым текстом').toEqual([])
  await record(test.info(), page)
})

test('AC11.3 проект открывается с клиента на диске сервера', async () => {
  await addPdf(client as ElectronApplication, sourceA)
  const created = await page.evaluate(
    (dir) => window.aecpilot.createProject(dir, 'AC11', true),
    projectDir
  )
  expect(created, JSON.stringify(created)).toMatchObject({ ok: true })
  const state = JSON.parse(
    readFileSync(join(projectDir, '.aecpilot', 'server-state.json'), 'utf8')
  ) as { project: string }
  expect(state.project.toLowerCase()).toBe(projectDir.toLowerCase())
  const composer = page.getByRole('textbox', { name: /Message|Сообщение/ })
  await expect(composer).toBeVisible({ timeout: 120000 })
})

test('AC11.4 источники подключены с клиента и проиндексированы сервером', async () => {
  for (const dir of [sourceA, sourceB]) {
    const added = await page.evaluate((path) => window.aecpilot.addSource(path, true), dir)
    expect(added, JSON.stringify(added)).toMatchObject({ ok: true })
  }
  const sources = (await page.evaluate(() => window.aecpilot.listSources())) as unknown[]
  expect(sources).toHaveLength(2)
  const started = await page.evaluate(() => window.aecpilot.startIngest(true))
  expect(started, JSON.stringify(started)).toMatchObject({ started: true })
  let last: unknown = null
  try {
    await expect
      .poll(
        async () => {
          const ingest = (await page.evaluate(() =>
            window.aecpilot.getIngestState()
          )) as IngestState
          last = ingest
          return !ingest.running && (ingest.lastReport?.files_total ?? 0) > 0
        },
        { timeout: 480000, intervals: [5000], message: 'индексация на сервере закончилась' }
      )
      .toBe(true)
  } catch (error) {
    const statePath = join(projectDir, '.aecpilot', 'server-state.json')
    console.log('AC11.4 состояние у клиента: ' + JSON.stringify(last).slice(0, 3000))
    console.log(
      'AC11.4 server-state: ' +
        (existsSync(statePath) ? readFileSync(statePath, 'utf8').slice(0, 3000) : 'нет файла')
    )
    console.log('AC11.4 журнал сервера (хвост):\n' + serverOutput.slice(-6000))
    throw error
  }
})

test('AC11.5 вопрос — ответ со ссылкой; щелчок открывает PDF сервера на нужной странице', async () => {
  await recordChatEvents(page)
  const answer = await turn(
    page,
    'По навыку aec-qa найди по индексу документов проекта инструментом rag_query (не памятью mem0, не кодом и не чтением файлов): какая расчётная нагрузка щита ЩС-1? Ответь со ссылкой на документ и дословной выдержкой из него в «ёлочках».',
    { timeoutMs: 300000 }
  )
  console.log('AC11 ' + answer.transcript)
  expect(answer.text, 'ссылка в машинном виде').toMatch(/\[src:/)
  const chip = page
    .locator('[data-slot="aui_assistant-message-root"]')
    .last()
    .locator('button[title^="[src:"]')
    .first()
  await expect(chip).toBeVisible({ timeout: 30000 })
  const vaultTab = page.getByRole('tab', { name: /Vault/ })
  if ((await vaultTab.count()) > 0 && (await vaultTab.getAttribute('aria-selected')) !== 'true')
    await vaultTab.click()
  const showRight = page.getByRole('button', { name: /Показать правую панель|Show right sidebar/ })
  if ((await showRight.count()) > 0) await showRight.click()
  await chip.click()
  const counter = page
    .getByRole('button', { name: /Предыдущая страница|Previous page/ })
    .locator('xpath=following-sibling::span[1]')
  await expect(counter).toHaveText(`7 / ${SAMPLE.pdfPages}`, { timeout: 60000 })
  await record(test.info(), page, { transcript: answer.transcript })
})

test('AC11.6 разделение: индекс, ядро и наши MCP — только у сервера', async () => {
  const serverRoot = dirname(serverExe)
  const clientRoot = dirname(clientExe)
  const aecpilot = readdirSync(join(projectDir, '.aecpilot'))
  console.log(`AC11.6 .aecpilot сервера: ${aecpilot.join(', ')}`)
  expect(aecpilot).toEqual(expect.arrayContaining(['project.json', 'server-state.json']))
  expect(existsSync(join(serverRoot, 'runtime', 'core'))).toBe(true)
  expect(existsSync(join(serverRoot, 'runtime', 'mcp'))).toBe(true)
  expect(findIndexTraces(clientRoot), 'следы индекса в каталоге клиента').toEqual([])
  expect(findIndexTraces(clientUserData), 'следы индекса в данных клиента').toEqual([])
})

test('AC11.7 клиент закрыт — сервер сам замечает новый файл в источнике', async () => {
  const statePath = join(projectDir, '.aecpilot', 'server-state.json')
  const before = (JSON.parse(readFileSync(statePath, 'utf8')) as { lastScan?: { at?: string } })
    .lastScan?.at
  const clientPid = client?.process().pid
  await client?.close()
  killProcessTree(clientPid)
  client = undefined
  writeFileSync(
    join(sourceB, 'новый-протокол.txt'),
    'Протокол совещания: перенос щита ЩС-2.\n',
    'utf-8'
  )
  await expect
    .poll(
      () => {
        const state = JSON.parse(readFileSync(statePath, 'utf8')) as {
          host?: string
          lastScan?: { at?: string; envelope?: unknown } | null
        }
        return (
          state.lastScan?.at !== before &&
          JSON.stringify(state.lastScan?.envelope ?? null).includes('новый-протокол.txt')
        )
      },
      { timeout: 420000, intervals: [10000], message: 'сервер просканировал источник сам' }
    )
    .toBe(true)
})
