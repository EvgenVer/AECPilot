// Задача T24 (SPEC AC1, решение владельца 2026-10-16): сквозной сценарий на имитации
// чистой машины — установка уже стоит, дальше создание проекта → два источника →
// индексация → вопрос → ответ со ссылкой → щелчок открывает PDF на нужной странице.
//
// Гоняется на exe установки: `AEC_E2E_EXECUTABLE=<install>\AECPilot.exe` и
// `AEC_E2E_CLEAN_HOME=<пустой каталог>` (пустые USERPROFILE/APPDATA/LOCALAPPDATA/TEMP,
// PATH только Windows). Без них — тот же сценарий на Electron рабочей копии.
// Образец — `lib/vault.ts`: PDF на 17 страниц в `source-a`, протокол в `source-b`;
// строка про ЩС-1 стоит в PDF на странице 7 (как блок 15).

import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { expect, test, type Locator, type Page } from '@playwright/test'

import {
  addSourceAsUser,
  clearNotifications,
  hideFirstRunSurfaces,
  mainWindow,
  openProject,
  standFixture
} from '../lib/app'
import { record } from '../lib/evidence'
import { recordChatEvents, turn } from '../lib/turn'
import { addPdf, makeSampleVault, SAMPLE, type SampleVault } from '../lib/vault'

test.describe.configure({ mode: 'serial' })

const stand = standFixture({ mode: 'live', label: 'ac1', providerKeyInStore: true })

let sample: SampleVault
let page: Page

interface IngestState {
  running: boolean
  lastReport?: { files_total: number; files_ok?: number } | null
}

test.beforeAll(async () => {
  sample = await makeSampleVault()
  cpSync(sample.vault, stand.get().projectDir, { recursive: true })
  await addPdf(stand.get().app, sample.sourceA)
})

function lastAnswer(): Locator {
  return page.locator('[data-slot="aui_assistant-message-root"]').last()
}

test('AC1.1 создание проекта', async () => {
  page = await mainWindow(stand.get())
  await hideFirstRunSurfaces(page)
  await openProject(stand.get(), page)
  await record(test.info(), page)
})

test('AC1.2 подключены два источника', async () => {
  for (const dir of [sample.sourceA, sample.sourceB]) {
    const added = await addSourceAsUser(stand.get(), page, dir)
    expect(added, JSON.stringify(added)).toMatchObject({ ok: true })
  }
  const sources = (await page.evaluate(() => window.aecpilot.listSources())) as unknown[]
  expect(sources.length).toBeGreaterThanOrEqual(2)
})

test('AC1.3 индексация обоих источников закончилась', async () => {
  await page.evaluate(() => window.aecpilot.startIngest(true))
  await expect
    .poll(
      async () => {
        const state = (await page.evaluate(() => window.aecpilot.getIngestState())) as IngestState
        return !state.running && (state.lastReport?.files_total ?? 0) > 0
      },
      { timeout: 900000, intervals: [5000], message: 'индексация закончилась' }
    )
    .toBe(true)
})

test('AC1.4 вопрос — ответ со ссылкой; щелчок открывает PDF на нужной странице', async () => {
  await recordChatEvents(page)
  const answer = await turn(
    page,
    'По навыку aec-qa найди по индексу документов проекта инструментом rag_query (не памятью mem0, не кодом и не чтением файлов): какая расчётная нагрузка щита ЩС-1? Ответь со ссылкой на документ и дословной выдержкой из него в «ёлочках».',
    { timeoutMs: 300000 }
  )
  console.log('AC1 ' + answer.transcript)
  expect(answer.text, 'ссылка в машинном виде').toMatch(/\[src:/)

  const chip = lastAnswer().locator('button[title^="[src:"]').first()
  await expect(chip).toBeVisible({ timeout: 30000 })
  const raw = (await chip.getAttribute('title')) ?? ''
  const file = raw.match(/\/([^/#\]]+?)(?:#|\])/)?.[1] ?? ''
  expect(file).toBe(SAMPLE.pdf)

  await clearNotifications(page)
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

// SPEC AC14: «полный сценарий» — это AC1 плюс память, расписание и браузер: каждое
// из них заводит свои процессы и кэши (Mem0, запускатель расписаний, Chromium из
// поставки). Снимок каталогов пользователя до и после делает обвязка прогона
// (`AEC_E2E_CLEAN_HOME`); здесь — только сами действия, по одному на каждое.
test('AC1.5 (AC14) память, расписание и браузер на той же установке', async () => {
  const memory = await turn(page, 'Запомни: ГИП проекта — Петров. Ответь одним словом.', {
    declineForeign: true
  })
  console.log('AC14 память ' + memory.transcript)
  expect(memory.status, memory.transcript).toBe('complete')

  const browser = await turn(
    page,
    'Открой https://example.com инструментом browser_navigate (локальный браузер) и ответь только заголовком страницы.',
    { timeoutMs: 300000, declineForeign: true }
  )
  console.log('AC14 браузер ' + browser.transcript)
  expect(browser.text, 'заголовок страницы из браузера').toMatch(/Example Domain/i)

  const scripts = join(stand.get().profileDir as string, 'scripts')
  mkdirSync(scripts, { recursive: true })
  writeFileSync(join(scripts, 'ac14-tick.py'), 'print("tick")\n', 'utf-8')
  await clearNotifications(page)
  const jobId = await page.evaluate(async () => {
    const bridge = (
      window as unknown as { hermesDesktop: { api: (r: unknown) => Promise<{ id: string }> } }
    ).hermesDesktop
    const job = await bridge.api({
      path: '/api/cron/jobs',
      method: 'POST',
      body: {
        name: 'ac14-тик',
        schedule: '* * * * *',
        no_agent: true,
        script: 'ac14-tick.py',
        deliver: 'local'
      }
    })
    return job.id
  })
  expect(jobId, 'ядро завело задачу').not.toBe('')
  await page
    .locator('[role="status"], [role="alert"]')
    .filter({ hasText: /никто не запускает|nobody is running/i })
    .getByRole('button', { name: /Запускать по расписанию|Run on schedule/ })
    .click()
  await expect
    .poll(
      async () => {
        const jobs = (await page.evaluate(() => window.aecpilot.gatewayRest('/api/cron/jobs'))) as {
          id: string
          last_run_at?: string | null
        }[]
        return jobs.find((job) => job.id === jobId)?.last_run_at ?? null
      },
      { timeout: 240000, intervals: [5000], message: 'задача по расписанию сработала сама' }
    )
    .not.toBe(null)
})

// SPEC AC1 (уточнение 2026-10-16): «проверка путей загруженных DLL». Все процессы
// дерева приложения (окно, ядро, наши MCP) грузят модули только из каталога установки
// и из Windows — ни одной библиотеки из Python/Node/Git разработчика. Только на exe
// установки: в рабочей копии Electron и Python лежат вне её по определению.
test('AC1.6 загруженные DLL — только из установки и Windows', async () => {
  const exe = process.env.AEC_E2E_EXECUTABLE
  test.skip(!exe, 'только на exe установки (AEC_E2E_EXECUTABLE)')
  const root = dirname(exe as string).toLowerCase() + '\\'
  const windows = (process.env.SystemRoot ?? 'C:\\Windows').toLowerCase() + '\\'
  const pid = stand.get().app.process().pid
  const script = [
    '$all = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name',
    `$tree = @(${pid}); $grew = $true`,
    'while ($grew) { $grew = $false; foreach ($p in $all) { if ($tree -contains $p.ParentProcessId -and -not ($tree -contains $p.ProcessId)) { $tree += $p.ProcessId; $grew = $true } } }',
    'foreach ($id in $tree) { $name = ($all | Where-Object ProcessId -eq $id).Name; try { foreach ($m in (Get-Process -Id $id -ErrorAction Stop).Modules) { "$id`t$name`t$($m.FileName)" } } catch { "$id`t$name`t?" } }'
  ].join('\n')
  const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', script], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  })
  const rows = out
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.split('\t'))
  const names = new Set(rows.map((row) => row[1]))
  const foreign = rows.filter(([, , file]) => {
    const path = (file ?? '').toLowerCase()
    return path !== '?' && !path.startsWith(root) && !path.startsWith(windows)
  })
  console.log(
    `AC1.6 процессов ${new Set(rows.map((row) => row[0])).size}: ${[...names].join(', ')}; модулей ${rows.length}`
  )
  expect(names.has('python.exe') || names.has('pythonw.exe'), 'ядро и MCP в дереве').toBe(true)
  expect(foreign.map((row) => `${row[1]} ${row[2]}`)).toEqual([])
})
