// Задача T83 (UR53) на ЖИВОМ ядре: локальная модель эмбеддингов.
//
// Человек выбирает в «Индекс и память» «Локальную модель», видит оценку времени,
// жмёт «Скачать»: движок llama.cpp ставит задание ядра (в общее хранилище пакетов
// ядра — второй прогон его не качает), модель bge-m3 ложится в `aec/embedding-models`
// временного профиля. Затем индексация источника: векторы строит локальный сервер
// (ширина 1024 — у bge-m3; у облачных моделей пресетов 1536–3072), граф не строится —
// платных вызовов нет. После выхода приложения процесса `llama-server` не остаётся.
//
// `AEC_E2E_GGUF_CACHE` — папка, где лежит (или куда кладётся) `bge-m3-Q8_0.gguf`, чтобы
// повторный прогон не качал 635 МБ заново. Без неё модель качается каждый раз.

import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import {
  addSourceAsUser,
  hideFirstRunSurfaces,
  mainWindow,
  openProject,
  standFixture
} from '../lib/app'
import { record } from '../lib/evidence'

test.describe.configure({ mode: 'serial' })

const stand = standFixture({ mode: 'live', label: 'live-83', providerKeyInStore: true })

const GGUF = 'bge-m3-Q8_0.gguf'
const cache = process.env.AEC_E2E_GGUF_CACHE

const source = mkdtempSync(join(tmpdir(), 'aecpilot-e2e-83-'))
writeFileSync(
  join(source, 'нагрузки.csv'),
  'Щит;Расчётная нагрузка, кВт\nЩС-1;42\nЩС-2;17\nЩО-1;6\n',
  'utf8'
)
writeFileSync(
  join(source, 'пояснение.md'),
  '# Пояснительная записка\n\nЩит ЩС-1 питает насосную станцию. Расчётная нагрузка — 42 кВт.\n',
  'utf8'
)

function llamaServers(): number {
  if (process.platform !== 'win32') return 0
  const out = execFileSync(
    'tasklist',
    ['/FI', 'IMAGENAME eq llama-server.exe', '/FO', 'CSV', '/NH'],
    {
      encoding: 'utf8'
    }
  )
  return out.split(/\r?\n/).filter((line) => line.startsWith('"llama-server')).length
}

async function openProviders(page: Page): Promise<void> {
  await page.evaluate(() => {
    location.hash = '#/settings?tab=about'
  })
  await page.locator('[data-tour="nav-aec-data-providers"]').click()
  await expect(page.getByRole('dialog', { name: 'Индекс и память' })).toBeVisible()
}

test('T83 «Скачать» локальную модель, индекс на ней, процесс уходит вместе с приложением', async () => {
  test.setTimeout(45 * 60_000)
  expect(llamaServers(), 'до прогона чужих llama-server нет').toBe(0)
  const profileDir = stand.get().profileDir as string
  const modelsDir = join(profileDir, 'aec', 'embedding-models')
  if (cache && existsSync(join(cache, GGUF))) {
    mkdirSync(modelsDir, { recursive: true })
    copyFileSync(join(cache, GGUF), join(modelsDir, GGUF))
  }

  const page = await mainWindow(stand.get())
  await hideFirstRunSurfaces(page)
  await openProject(stand.get(), page)
  expect(await addSourceAsUser(stand.get(), page, source)).toMatchObject({ ok: true })

  await openProviders(page)
  const dialog = page.getByRole('dialog', { name: 'Индекс и память' })
  await dialog.locator('#data-rag').selectOption('local')
  // Оценка — до выбора, по замеренной скорости.
  await expect(dialog.getByTestId('local-embeddings-estimate')).toContainText('фрагментов в минуту')
  await record(test.info(), page, { transcript: await dialog.innerText() })

  await dialog.getByRole('button', { name: /^Скачать bge-m3/ }).click()
  await expect
    .poll(
      async () => {
        const status = (await page.evaluate(() => window.aecpilot.getLocalEmbeddings())) as {
          busy: boolean
          error: string | null
          model: unknown
        }
        if (status.error) throw new Error(status.error)
        return !status.busy && status.model !== null
      },
      { timeout: 40 * 60_000, intervals: [5000], message: 'движок и модель скачаны' }
    )
    .toBe(true)
  await expect(dialog.getByTestId('local-embeddings-model')).toContainText('bge-m3')
  await expect(dialog.getByTestId('local-embeddings-engine')).toContainText('установлен')
  const ready = (await page.evaluate(() => window.aecpilot.getLocalEmbeddings())) as {
    engine: unknown
    model: unknown
    baseUrl: unknown
  }
  console.log(
    `T83 готово: ${JSON.stringify({ engine: ready.engine, model: ready.model, baseUrl: ready.baseUrl })}`
  )

  await dialog.getByRole('button', { name: /^Сохранить/ }).click()
  const confirm = dialog.getByRole('button', { name: 'Сохранить всё равно' })
  if (await confirm.isVisible().catch(() => false)) await confirm.click()
  await expect(dialog.getByText(/^Сохранено. Индекс и память/)).toBeVisible({ timeout: 60_000 })
  // Сервер поднимается после сохранённого выбора (ревью T84: не держать видеопамять
  // за выбор, который человек может отменить).
  await expect
    .poll(
      async () =>
        ((await page.evaluate(() => window.aecpilot.getLocalEmbeddings())) as { running: boolean })
          .running,
      { timeout: 180_000, intervals: [2000], message: 'модель запущена' }
    )
    .toBe(true)
  await record(test.info(), page, { transcript: await dialog.innerText() })

  if (cache && !existsSync(join(cache, GGUF))) {
    mkdirSync(cache, { recursive: true })
    copyFileSync(join(modelsDir, GGUF), join(cache, GGUF))
  }

  // Индексация: только векторы (граф — отдельный, платный шаг, здесь не нужен).
  const started = await page.evaluate(() => window.aecpilot.startIngest(true))
  console.log(`T83 startIngest: ${JSON.stringify(started)}`)
  await expect
    .poll(
      async () => {
        const state = (await page.evaluate(() => window.aecpilot.getIngestState())) as {
          running: boolean
          failure?: unknown
          error?: unknown
          lastReport?: { files_total: number; files_failed: number } | null
        }
        if (!state.running && (state.failure || state.error)) {
          throw new Error(`индексация отказала: ${JSON.stringify(state)}`)
        }
        return !state.running && state.lastReport ? state.lastReport : null
      },
      { timeout: 600_000, intervals: [2000], message: 'индексация закончилась' }
    )
    .toMatchObject({ files_failed: 0 })

  const fingerprint = JSON.parse(
    readFileSync(join(stand.get().projectDir, '.aecpilot', 'lightrag', 'aec-index.json'), 'utf8')
  ) as { embedding_model?: string; embedding_dim?: number }
  expect(fingerprint).toMatchObject({ embedding_model: 'bge-m3', embedding_dim: 1024 })
  const config = readFileSync(join(profileDir, 'config.yaml'), 'utf8')
  expect(config).toMatch(/AEC_RAG_BASE_URL: "?http:\/\/127\.0\.0\.1:\d+\/v1/)
  console.log(`T83 индекс: ${JSON.stringify(fingerprint)}; llama-server: ${llamaServers()}`)
  expect(llamaServers()).toBe(1)

  // Выход приложения гасит процесс модели (will-quit), сирот нет.
  await stand.get().app.close()
  await expect.poll(() => llamaServers(), { timeout: 30_000 }).toBe(0)
})
