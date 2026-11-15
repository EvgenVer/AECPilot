// Задачи T67/T68 (UR51): настоящий MCP-сервер Autodesk для Revit 2027 — путь человека в окне.
//
// Человек добавляет сервер сам: «Возможности» → «Коннекторы» → «Добавить своё», вставляет путь
// к `Autodesk.RevitMcpServer.Stdio.exe`, подтверждает в нашем окне согласия. Позиция проверяет,
// что сервер записан, что запись идёт БЕЗ `trust` (ядро читает это как `full` — запись в модель
// без вопроса, находка T62) и что видит кнопка проверки окна: она подключается, просит список и
// отключается, а инструменты Revit сервер присылает позже уведомлением `tools/list_changed`.
//
// Только на машине с установленным сервером и запущенным Revit с открытой моделью; иначе
// позиция снимается с причиной. Модель не вызывается, Revit не меняется.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import { hideFirstRunSurfaces, mainWindow, openProject, standFixture } from '../lib/app'

test.describe.configure({ mode: 'serial' })

const EXE =
  'C:\\Program Files\\Autodesk\\Revit 2027 MCP Server Experimental-Tools Technical Preview\\Autodesk.RevitMcpServer.Stdio.exe'

/** Надстройка внутри Revit открывает канал `revit-mcp-2027-<id>`; без него инструментов нет. */
function revitRunning(): boolean {
  try {
    return readdirSync('\\\\.\\pipe\\').some((name) => name.startsWith('revit-mcp-2027-'))
  } catch {
    return false
  }
}

const READY = existsSync(EXE) && revitRunning()
const NOT_READY = 'нет сервера Autodesk для Revit 2027 или не запущен Revit с открытой моделью'

const stand = standFixture({ mode: 'live', label: 'live-revit-mcp' })

let projectOpened = false

/** Главное окно с открытым проектом: «Возможности» живут в оболочке проекта. */
async function ui(): Promise<Page> {
  const page = await mainWindow(stand.get())
  await hideFirstRunSurfaces(page)
  if (!projectOpened) {
    await openProject(stand.get(), page)
    projectOpened = true
  }
  return page
}

/** Блок сервера `revit` в `config.yaml` копии профиля. */
function revitEntry(): string {
  const lines = readFileSync(join(String(stand.get().profileDir), 'config.yaml'), 'utf8').split(
    /\r?\n/
  )
  const at = lines.findIndex((line) => /^\s{2}revit:\s*$/.test(line))
  if (at === -1) return ''
  const end = lines.findIndex((line, index) => index > at && /^\s{0,2}\S/.test(line))
  return lines.slice(at, end === -1 ? undefined : end).join('\n')
}

interface ProbeResult {
  ok: boolean
  error?: string
  tools: { name: string }[]
}

test('T68.1 сервер Revit добавляется в окне MCP и записывается без поля доверия', async () => {
  test.skip(!READY, NOT_READY)
  const page = await ui()
  await page.evaluate(() => {
    location.hash = '#/capabilities?tab=connectors'
  })
  await page.waitForTimeout(2500)

  await page
    .getByRole('button', { name: /^(Add your own|Добавить сво[йё])$/ })
    .first()
    .click()
  const form = page.getByRole('dialog').last()
  // Путь к .exe разборщик вставки за сервер не принимает (замер 2026-11-15: «Это не похоже
  // на сервер. Заполните поля ниже.») — человек заполняет поля сам.
  await form.getByPlaceholder(/server-filesystem/).fill(`"${EXE}"`)
  const hint = await form.getByText(/не похоже на сервер|doesn.t look like a server/i).count()
  console.log('T68.1 PASTE_RECOGNIZED ' + String(hint === 0))
  await form.getByLabel(/^(Name|Имя|Название)$/).fill('revit')
  const command = form.getByLabel(/^(Command|Команда запуска)$/)
  if ((await command.inputValue()) === '') await command.fill(EXE)
  await form
    .getByRole('button', { name: /^(Save|Сохранить)$/ })
    .first()
    .click()

  const consent = page.getByRole('dialog').filter({ hasText: /Добавить MCP-сервер/ })
  await expect(consent).toBeVisible({ timeout: 30000 })
  await expect(consent, 'в согласии виден путь к серверу Autodesk').toContainText(
    'Autodesk.RevitMcpServer.Stdio.exe'
  )
  await consent.getByRole('button', { name: /^Установить$/ }).click()
  await expect(consent).toBeHidden({ timeout: 30000 })

  await expect.poll(revitEntry, { timeout: 30000 }).toContain('Autodesk.RevitMcpServer.Stdio.exe')
  const entry = revitEntry()
  console.log('T68.1 ENTRY ' + entry.replace(/\n/g, ' ⏎ '))
  // Находка T62, не требование: окно не пишет `trust`, ядро читает пропуск как `full`.
  expect(entry, 'окно пишет сервер без trust (известно, ждёт решения UR51)').not.toMatch(/trust:/)
})

test('T68.2 кнопка проверки окна видит у Revit только инструменты, пришедшие сразу', async () => {
  test.skip(!READY, NOT_READY)
  const page = await ui()
  // Тот же запрос, что шлёт панель инструментов коннектора (`testMcpServer` донора).
  const probe = (await page.evaluate(() =>
    (
      window as unknown as { hermesDesktop: { api: (r: unknown) => Promise<unknown> } }
    ).hermesDesktop.api({
      path: '/api/mcp/servers/revit/test',
      method: 'POST',
      timeoutMs: 60000
    })
  )) as ProbeResult
  console.log(
    'T68.2 PROBE ' + JSON.stringify({ ok: probe.ok, tools: probe.tools.map((t) => t.name) })
  )
  expect(probe.ok, probe.error ?? '').toBe(true)
  // Замер, а не требование: до `tools/list_changed` у сервера есть только его собственный
  // инструмент. Если Autodesk это изменит, позиция покажет число — тогда переписать находку.
  expect(probe.tools.map((t) => t.name)).toContain('get_running_revit_instances')
})
