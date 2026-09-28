// Блок 29 чек-листа на ЖИВОМ ядре — позиции с ходом модели.
//
// Переписаны задачей 3G.24 (D-149, решение владельца 2026-09-28, вариант «а»):
// с ядра 0.21.5 у агента НЕТ инструмента установки MCP-сервера — `setup_mcp`
// удалён, `manage_catalog` (профиль их первого запуска, HX26) и
// `manage_connections` (коннекторы Nous, HX3) у нас не регистрируются. UR23
// выполняется строже: ставит человек сам — «Возможности» → MCP → «Add your own» и
// наше окно согласия (29.4). Агент на просьбу поставить сервер это и говорит.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import { hideFirstRunSurfaces, mainWindow, openProject, standFixture } from '../lib/app'
import { record } from '../lib/evidence'
import { turn, type TurnResult } from '../lib/turn'

test.describe.configure({ mode: 'serial' })

const stand = standFixture({ mode: 'live', label: 'model-29' })

let projectOpened = false

async function ui(): Promise<Page> {
  const page = await mainWindow(stand.get())
  await hideFirstRunSurfaces(page)
  if (!projectOpened) {
    await openProject(stand.get(), page)
    projectOpened = true
  }
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

let before = ''
let answer: TurnResult | undefined

test('29.5.1 агент не ставит сервер сам и говорит, что поставить его может только человек', async () => {
  const page = await ui()
  before = mcpServersSection()
  expect(before, 'сервера filesystem до хода нет').not.toMatch(/^\s{2}filesystem:/m)

  answer = await turn(page, 'Поставь MCP-сервер filesystem.')
  console.log('29.5 TRANSCRIPT ' + answer.transcript.replace(/\n/g, ' ⏎ ').slice(0, 1200))

  expect(answer.tools, 'инструмента установки у агента нет').not.toContainEqual(
    expect.stringMatching(/setup_mcp|manage_catalog|manage_connections/)
  )
  expect(answer.text, 'не говорит, что установил').not.toMatch(/(^|\s)(установил|поставил|installed)\b/i)
  await record(test.info(), page)
})

test('29.5.2 агент называет путь: «Возможности» → MCP → «Add your own»', async () => {
  expect(answer, 'ход 29.5.1 состоялся').toBeDefined()
  expect(answer!.text).toMatch(/Возможност|Add your own|настройк/i)
  expect(answer!.text).toMatch(/MCP/)
})

test('29.5.3 список серверов не изменился', async () => {
  expect(mcpServersSection(), 'конфиг серверов не изменился').toBe(before)
})
