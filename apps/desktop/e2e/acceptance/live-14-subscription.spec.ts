// Блок 14, шаг 10 чек-листа (задача 3G.50, D-172) на ЖИВОМ ядре: агент работает по
// подписке (`model.provider: openai-codex`), а у подписки нет ключа для индекса и
// памяти. Человек выбирает им провайдера в окне «Индекс и память».
//
// Входа в Codex на стенде нет и не нужно: ходов модели здесь нет — проверяется
// только то, чем пользуются индекс и память. Ключ Gemini стенд кладёт в хранилище
// приложения (D-117) — туда же, куда его сохранил бы человек в этом окне.

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import {
  addSourceAsUser,
  hideFirstRunSurfaces,
  mainWindow,
  openProject,
  standFixture,
  type LaunchOptions
} from '../lib/app'
import { prepareProfile, removeProfile } from '../lib/core'

test.describe.configure({ mode: 'serial' })

const GEMINI = 'https://generativelanguage.googleapis.com/'

// Профиль готовится ДО стенда (хуки идут в порядке объявления, а стенд читает
// опции в своём `beforeAll`): у агента — подписка вместо Gemini.
const options: LaunchOptions = { mode: 'live', label: 'live-14-sub', providerKeyInStore: true }
let profile: string | undefined
test.beforeAll(() => {
  profile = prepareProfile()
  const config = join(profile, 'config.yaml')
  const text = readFileSync(config, 'utf8')
  const next = text.replace(
    /^(model:\r?\n(?:[ \t]+.*\r?\n)*?[ \t]+provider:)[ \t]*\S+/m,
    '$1 openai-codex'
  )
  expect(next, 'model.provider в конфиге профиля').not.toBe(text)
  writeFileSync(config, next, 'utf8')
  options.profileDir = profile
})
const stand = standFixture(options)
test.afterAll(() => {
  if (profile) removeProfile(profile)
})

/** Три таблицы по два десятка строк: индексация — секунды, денег — копейки. */
const docs = mkdtempSync(join(tmpdir(), 'aecpilot-e2e-sub-docs-'))
for (let i = 1; i <= 3; i += 1) {
  const rows = ['Этаж;Щит;Нагрузка, кВт']
  for (let r = 1; r <= 20; r += 1) rows.push(`${r};ЩР-${i}.${r};${(r * 1.5).toFixed(1)}`)
  writeFileSync(join(docs, `нагрузки-${i}.csv`), rows.join('\n') + '\n', 'utf8')
}

interface IngestState {
  error: string | null
  running: boolean
  lastReport?: {
    chunks: number
    files_failed: number
    files_ingested: number
    files_total: number
  } | null
}

/** Ровно те поля `mem0.json`, что проверяются: модели и адреса. */
function mem0(): {
  embedder: string
  embedderUrl: string
  keyEnv: string
  llm: string
  llmUrl: string
} {
  const json = JSON.parse(readFileSync(join(profile ?? '', 'mem0.json'), 'utf8')) as {
    oss?: {
      llm?: { config?: { api_key_env?: string; model?: string; openai_base_url?: string } }
      embedder?: { config?: { model?: string; openai_base_url?: string } }
    }
  }
  return {
    llm: json.oss?.llm?.config?.model ?? '',
    llmUrl: json.oss?.llm?.config?.openai_base_url ?? '',
    keyEnv: json.oss?.llm?.config?.api_key_env ?? '',
    embedder: json.oss?.embedder?.config?.model ?? '',
    embedderUrl: json.oss?.embedder?.config?.openai_base_url ?? ''
  }
}

async function ingest(page: Page): Promise<IngestState> {
  await page.evaluate(() => window.aecpilot.startIngest(true))
  let state: IngestState = { error: null, running: true }
  await expect
    .poll(
      async () => {
        state = (await page.evaluate(() => window.aecpilot.getIngestState())) as IngestState
        return state.running
      },
      { timeout: 300000, intervals: [2000], message: 'индексация закончилась' }
    )
    .toBe(false)
  return state
}

let page: Page

test('14.10.1 агент по подписке — индикатор индекса называет причину словами', async () => {
  page = await mainWindow(stand.get())
  await hideFirstRunSurfaces(page)
  await openProject(stand.get(), page)
  expect(await addSourceAsUser(stand.get(), page, docs)).toMatchObject({ ok: true })

  await page.getByTitle('Индекс', { exact: true }).click()
  await expect(
    page.getByRole('alert').filter({ hasText: 'У поиска по документам нет провайдера' })
  ).toContainText('«openai-codex»')
  // Пока выбора нет, память пишется умолчанием — не Gemini.
  expect(mem0().embedderUrl.startsWith(GEMINI)).toBe(false)
})

test('14.10.2 индексация без выбора — отказ с той же причиной, а не «не задан»', async () => {
  await page.keyboard.press('Escape')
  const state = await ingest(page)
  expect(state.error ?? '').toContain('«openai-codex»')
  expect(state.error ?? '').toContain('Индекс и память')
})

test('14.10.3 «Выбрать провайдера» → Gemini → «Сохранить выбор» — оба готовы', async () => {
  await page.getByTitle('Индекс', { exact: true }).click()
  await page.getByRole('button', { name: 'Выбрать провайдера' }).click()
  const dialog = page.getByRole('dialog', { name: 'Индекс и память' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Агент работает по подписке')

  await dialog.getByLabel('Поиск по документам (RAG)').selectOption('gemini')
  // Ключ уже в хранилище — поле показывает «сохранён», а не просит его.
  await expect(
    dialog.locator('section').filter({ hasText: 'GEMINI_API_KEY' }).first()
  ).toContainText('сохранён')
  await dialog.getByRole('button', { name: 'Сохранить выбор' }).click()
  await expect(dialog).toContainText('Сохранено', { timeout: 60000 })
  await expect(dialog).toContainText('Поиск по документам — готово')
  await expect(dialog).toContainText('Память — готово')
  await dialog.getByRole('button', { name: 'Закрыть' }).click()
})

test('14.10.4 выбор записан в профиль: `aec-providers.json`, память и `aec-rag` — на Gemini', async () => {
  const saved = JSON.parse(
    readFileSync(join(profile ?? '', 'aec-providers.json'), 'utf8')
  ) as unknown
  expect(saved).toEqual({ rag: { provider: 'gemini' }, memory: { provider: 'rag' } })

  const memory = mem0()
  expect(memory.llmUrl.startsWith(GEMINI), memory.llmUrl).toBe(true)
  expect(memory.embedderUrl.startsWith(GEMINI), memory.embedderUrl).toBe(true)
  expect(memory.embedder).toBe('gemini-embedding-2')
  expect(memory.keyEnv).toBe('GEMINI_API_KEY')

  const config = readFileSync(join(profile ?? '', 'config.yaml'), 'utf8')
  expect(config).toContain(`AEC_RAG_BASE_URL: "${GEMINI}`)
  expect(config).toContain('AEC_RAG_KEY_ENV: "GEMINI_API_KEY"')
  expect(config).not.toContain('AEC_RAG_UNAVAILABLE')
  // У агента по-прежнему подписка — выбор для индекса и памяти его не трогает.
  expect(config).toMatch(/^model:\r?\n(?:[ \t]+.*\r?\n)*?[ \t]+provider: openai-codex/m)
})

test('14.10.5 индексация образца проходит на выбранном провайдере', async () => {
  const state = await ingest(page)
  expect(state.error, state.error ?? '').toBeNull()
  expect(state.lastReport).toMatchObject({ files_total: 3, files_ingested: 3, files_failed: 0 })
  expect(state.lastReport?.chunks ?? 0).toBeGreaterThan(0)
})
