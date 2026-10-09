// D-195 (задача 3I.4) на ЖИВОМ ядре: при специалисте агент ищет по индексу, а
// страница «Память» показывает факты.
//
// Как у владельца 2026-10-09: ключ провайдера — только в хранилище приложения (из
// `.env` профиля стенда он убран), заведён специалист, приложение перезапущено.
// С двумя профилями ядро включает мультиплекс при старте и читает ключи только из
// секретов профиля; до 3I.2–3I.3 MCP `aec-rag` получал строку `${env:KEY}` вместо
// ключа, а команда памяти — `UnscopedSecretError`.
//
// Контроль «как до правки» (3I.2): `D195_CONTROL=1` выключает наш источник ключей
// в конфигах (`secrets.aecpilot.enabled: false` — установщик такую запись не
// трогает). Тогда проверка поиска обязана упасть; страница «Память» от источника
// не зависит (её чинит 3I.3 в коде команды) и в контроле проходит.
//
// Главный признак — журнал ядра: строка `${env:KEY}` конфига MCP, оставленная
// как есть, и есть дефект. Ход модели один; модель может прочитать маленький
// файл напрямую, минуя поиск (первый контрольный прогон так и прошёл), поэтому
// вызов `rag_query` проверяется по журналу.

import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import {
  addSourceAsUser,
  hideFirstRunSurfaces,
  mainWindow,
  openProject,
  reopenRecentProject,
  standFixture
} from '../lib/app'
import { record } from '../lib/evidence'
import { turn } from '../lib/turn'

test.describe.configure({ mode: 'serial' })

const stand = standFixture({
  mode: 'live',
  label: 'live-specialist-keys',
  providerKeyInStore: true
})

const CONTROL = process.env.D195_CONTROL === '1'
const SPECIALIST = 'keys-check'
/** Строка, которую агент может узнать только из документа. */
const CIPHER = 'КРАСНЫЙ-ЛИС-4417'

const source = mkdtempSync(join(tmpdir(), 'aecpilot-e2e-keys-'))
// CSV, а не TXT: `.txt` индексатор пропускает молча (D-199), и первые прогоны
// находили шифр чтением файла, а не поиском.
writeFileSync(
  join(source, 'паспорт объекта.csv'),
  `Поле;Значение\nОбъект;Паспорт объекта\nШифр проекта;${CIPHER}\nЗаказчик;ООО «Пример»\n`,
  'utf8'
)

interface IngestState {
  running: boolean
  lastReport?: { files_total: number } | null
}

let prepared = false

/** Ключи — только в хранилище приложения: строки `*_API_KEY` из `.env` профиля
 *  убираются (стенд уже сохранил их в хранилище, `providerKeyInStore`). */
function keysOnlyInStore(profileDir: string): void {
  const file = join(profileDir, '.env')
  if (!existsSync(file)) return
  const kept = readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter((line) => !/^\s*[A-Z][A-Z0-9_]*_API_KEY\s*=/.test(line))
  writeFileSync(file, kept.join('\n'), 'utf8')
}

/** Контроль: источник ключей выключен там, где установщик его не включит. */
function disableKeySource(home: string): void {
  const config = join(home, 'config.yaml')
  const text = readFileSync(config, 'utf8')
  writeFileSync(
    config,
    text.replace(/^ {2}aecpilot:\n {4}enabled: true$/m, '  aecpilot:\n    enabled: false'),
    'utf8'
  )
}

async function rpc(page: Page, method: string, params: Record<string, unknown>): Promise<unknown> {
  const answer = (await page.evaluate(
    ([m, p]) => window.aecpilot.gatewayRpc(m as string, p as Record<string, unknown>),
    [method, params] as const
  )) as { ok?: boolean; value?: unknown; error?: unknown }
  if (answer?.ok === false) throw new Error(`${method}: ${JSON.stringify(answer.error)}`)
  return answer?.value ?? answer
}

async function ui(): Promise<Page> {
  let page = await mainWindow(stand.get())
  await hideFirstRunSurfaces(page)
  if (prepared) return page
  prepared = true

  const profileDir = stand.get().profileDir as string
  await openProject(stand.get(), page)
  keysOnlyInStore(profileDir)
  await rpc(page, 'profiles.create', { name: SPECIALIST })
  const specialistHome = join(profileDir, 'profiles', SPECIALIST)
  if (CONTROL) {
    disableKeySource(profileDir)
    disableKeySource(specialistHome)
  }

  // Ядро решает про мультиплекс при старте: с двумя профилями — включает.
  await stand.get().relaunch()
  page = await mainWindow(stand.get())
  await hideFirstRunSurfaces(page)
  await reopenRecentProject(page)

  expect(await addSourceAsUser(stand.get(), page, source)).toMatchObject({ ok: true })
  await page.evaluate(() => window.aecpilot.startIngest(true))
  await expect
    .poll(
      async () => {
        const state = (await page.evaluate(() => window.aecpilot.getIngestState())) as IngestState
        return !state.running && (state.lastReport?.files_total ?? 0) > 0
      },
      { timeout: 300000, intervals: [3000], message: 'индексация закончилась' }
    )
    .toBe(true)
  // Иначе проверка поиска падает загадочно: агент ищет в пустом индексе.
  const report = ((await page.evaluate(() => window.aecpilot.getIngestState())) as IngestState)
    .lastReport as IngestState['lastReport'] & { files_ingested?: number; errors?: unknown }
  expect(report?.files_ingested, `индексация: ${JSON.stringify(report)}`).toBeGreaterThan(0)
  return page
}

test('D-196 у специалиста стоит наш плагин и включён источник ключей', async () => {
  await ui()
  const specialistHome = join(stand.get().profileDir as string, 'profiles', SPECIALIST)

  expect(existsSync(join(specialistHome, 'plugins', 'aec-secret-filter', 'key_source.py'))).toBe(
    true
  )
  expect(readFileSync(join(specialistHome, 'config.yaml'), 'utf8')).toMatch(
    /^secrets:\n {2}aecpilot:\n/m
  )
})

test('3J.4 SOUL специалиста начинается с SOUL главного агента', async () => {
  await ui()
  const profileDir = stand.get().profileDir as string
  const main = readFileSync(join(profileDir, 'SOUL.md'), 'utf8').trim()
  const own = readFileSync(join(profileDir, 'profiles', SPECIALIST, 'SOUL.md'), 'utf8')

  // SOUL главного на стенде — свой, короткий; важна связь, а не текст.
  expect(main.length).toBeGreaterThan(0)
  expect(own.startsWith(main)).toBe(true)
  expect(own).toContain('## Специалист')
})

/** Журнал ядра после последнего старта с мультиплексом. */
function coreLogSinceMultiplex(): string {
  const file = join(stand.get().profileDir as string, 'logs', 'agent.log')
  const log = readFileSync(file, 'utf8')
  const start = log.lastIndexOf('Multi-profile hosting activated')
  expect(start, 'ядро включило мультиплекс').toBeGreaterThan(-1)
  return log.slice(start)
}

test('D-195 при специалисте сервер поиска получает ключ, а не строку ${env:…}', async () => {
  await ui()
  expect(coreLogSinceMultiplex()).not.toMatch(
    /Config ref '\$\{env:[A-Z0-9_]+_API_KEY\}'.*keeping the literal placeholder/
  )
})

test('D-195 при специалисте агент находит в проиндексированном документе', async () => {
  const page = await ui()
  const result = await turn(
    page,
    'Найди шифр проекта поиском по индексу документов — инструментом rag_query. ' +
      'Файлы напрямую не читай. Ответь только шифром.',
    { declineForeign: true }
  )
  await record(test.info(), page, { transcript: result.transcript })

  expect(coreLogSinceMultiplex(), 'агент искал по индексу').toMatch(
    /tool mcp__aec_rag__rag_query completed/
  )
  const mcpLog = join(stand.get().profileDir as string, 'logs', 'mcp-stderr.log')
  const log = existsSync(mcpLog) ? readFileSync(mcpLog, 'utf8') : ''
  expect(log, 'сервер поиска получил ключ').not.toMatch(/valid API key/i)
  expect(result.text, result.transcript).toContain(CIPHER)
})

test('D-195 при специалисте страница «Память» показывает факты, а не отказ ядра', async () => {
  const page = await ui()
  await page.evaluate(() => {
    location.hash = '#/aec-memory'
  })
  const memory = page.getByRole('region', { name: 'Память агента', exact: true })
  await expect(memory).toBeVisible({ timeout: 15000 })
  await expect(memory).toContainText(/Фактов в этом проекте: \d+|UnscopedSecretError/, {
    timeout: 60000
  })
  await record(test.info(), page)
  await expect(memory).not.toContainText('UnscopedSecretError')
  await expect(memory).toContainText(/Фактов в этом проекте: \d+/)
})
