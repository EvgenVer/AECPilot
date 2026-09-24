// Блок 29 чек-листа (задача 3F.9) на ЖИВОМ ядре — позиции с ходом модели:
// агент предлагает поставить MCP-сервер, и в ленте появляется их карточка
// согласия (`setup_mcp`). Ничего не ставится, пока человек не ответил; в конце
// тест отвечает «Не сейчас» — сеть и пакеты не трогаются.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import { hideFirstRunSurfaces, mainWindow, openProject, send, standFixture } from '../lib/app'
import { record } from '../lib/evidence'
import { eventCount, eventsSince, recordChatEvents } from '../lib/turn'

test.describe.configure({ mode: 'serial' })

const stand = standFixture({ mode: 'live', label: 'model-29' })

let projectOpened = false

async function ui(): Promise<Page> {
  const page = await mainWindow(stand.get())
  await hideFirstRunSurfaces(page)
  if (!projectOpened) {
    // «Не сейчас» у карточки — предмет проверки, общий перехватчик снимаем.
    await page.removeLocatorHandler(page.getByRole('button', { name: /^(Not now|Не сейчас)$/ }))
    await openProject(stand.get(), page)
    projectOpened = true
  }
  await recordChatEvents(page)
  return page
}

/** Раздел `mcp_servers` профиля — что реально установлено. */
function mcpServersSection(): string {
  const lines = readFileSync(join(String(stand.get().profileDir), 'config.yaml'), 'utf8').split('\n')
  const at = lines.findIndex((line) => line.startsWith('mcp_servers:'))
  if (at === -1) return ''
  const end = lines.findIndex((line, index) => index > at && /^\S/.test(line))
  return lines.slice(at, end === -1 ? undefined : end).join('\n')
}

function card(page: Page) {
  return page.locator('[data-slot="aui_assistant-message-root"]').filter({ hasText: /Добавить MCP-сервер/ }).last()
}

let before = ''

test('29.5.1 в ленте карточка согласия с названием сервера и причиной', async () => {
  const page = await ui()
  before = mcpServersSection()
  expect(before, 'сервера filesystem до хода нет').not.toMatch(/^\s{2}filesystem:/m)
  const mark = await eventCount(page)
  await send(
    page,
    'Поставь MCP-сервер filesystem — инструментом setup_mcp (action install, server filesystem; если он отложен, вызови через tool_call) и в причине напиши, зачем он нужен.'
  )
  await expect(card(page)).toBeVisible({ timeout: 180000 })
  const text = await card(page).innerText()
  console.log('29.5 CARD ' + text.replace(/\n/g, ' ⏎ ').slice(0, 800))
  expect(text).toMatch(/filesystem/i)
  // Причина — то, что агент передал инструменту; вызов бывает и через
  // `tool_call`, где аргументы лежат строкой, поэтому ищем по сырому JSON.
  const calls = JSON.stringify((await eventsSince(page, mark)).filter((e) => e.type === 'tool.start'))
  expect(calls, 'агент передал причину').toMatch(/reason/)
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean)
  // Причина — строка сразу под заголовком карточки.
  const reasonLine = lines[lines.findIndex((line) => /Добавить MCP-сервер/.test(line)) + 1] ?? ''
  expect(reasonLine, 'причина видна в карточке').not.toMatch(/^(Из каталога|Установить|Не сейчас)/)
  expect(reasonLine.length, 'причина видна в карточке').toBeGreaterThanOrEqual(10)
  await record(test.info(), page)
})

test('29.5.2 пока человек не ответил, ничего не устанавливается', async () => {
  const page = await ui()
  await page.waitForTimeout(10000)
  expect(mcpServersSection(), 'конфиг серверов не изменился').toBe(before)
  await expect(card(page).getByRole('button', { name: 'Установить' })).toBeVisible()
  // Ответ «Не сейчас» — сеть и пакеты не трогаем.
  await card(page).getByRole('button', { name: 'Не сейчас' }).click()
  // Отвеченная карточка перестраивается — заголовка «Добавить…» в ней уже нет.
  const answered = page.locator('[data-slot="aui_assistant-message-root"]').last()
  await expect(answered.getByText('Отклонено').first()).toBeVisible({ timeout: 30000 })
  expect(mcpServersSection()).toBe(before)
})

// 29.5.3 (формулировка исправлена 24.09.2026, D-131): после «Установить»
// второго вопроса нет — ответ в карточке и есть согласие (решение 2026-08-21).
// Не проверяется автоматически: «Установить» скачивает пакет сервера из сети,
// а загрузка стороннего кода стендом без отдельного разрешения не делается.
test.fixme('29.5.3 после «Установить» второго вопроса нет', async () => {})
