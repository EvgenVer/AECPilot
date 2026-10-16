// Позиция 4.6.4 чек-листа (задача 3F.9) на ЖИВОМ ядре: файл из папки OneDrive,
// подключённой обычной папкой (D-83), находится поиском по индексу. Индексации
// нужен ключ провайдера в хранилище приложения — его кладёт стенд (D-117).
// Подключение, скан и вьюер той же папки — `blocks-01-05-project` (4.6.1–4.6.3).

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

import {
  addSourceAsUser,
  hideFirstRunSurfaces,
  mainWindow,
  openProject,
  standFixture
} from '../lib/app'
import { record } from '../lib/evidence'
import { eventCount, eventsSince, recordChatEvents, turn } from '../lib/turn'

test.describe.configure({ mode: 'serial' })

const stand = standFixture({ mode: 'live', label: 'model-04', providerKeyInStore: true })

const oneDrive = join(
  mkdtempSync(join(tmpdir(), 'aecpilot-e2e-od-')),
  'OneDrive - Проектная организация'
)
mkdirSync(oneDrive, { recursive: true })
// CSV, а не TXT: индексатор берёт только pdf/docx/xlsx/csv (`aec_rag/parse.py`).
writeFileSync(
  join(oneDrive, 'ведомость-облако.csv'),
  'Щит;Расчётная нагрузка, кВт\nЩО-7;42\n',
  'utf-8'
)

interface IngestState {
  running: boolean
  lastReport?: { files_total: number } | null
}

test('4.6.4 файл из папки OneDrive находится поиском по индексу', async () => {
  const page = await mainWindow(stand.get())
  await hideFirstRunSurfaces(page)
  await openProject(stand.get(), page)
  const added = await addSourceAsUser(stand.get(), page, oneDrive)
  expect(added, JSON.stringify(added)).toMatchObject({ ok: true })
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

  console.log(
    '4.6.4 индексация: ' +
      JSON.stringify(await page.evaluate(() => window.aecpilot.getIngestState()))
  )
  await recordChatEvents(page)
  const mark = await eventCount(page)
  const result = await turn(
    page,
    'Найди по индексу документов проекта: какая расчётная нагрузка щита ЩО-7? Ответь со ссылкой на документ.',
    { timeoutMs: 300000 }
  )
  console.log('4.6.4 ' + result.transcript)
  const rag = (await eventsSince(page, mark)).filter(
    (e) => e.type === 'tool.complete' && /rag_/.test(JSON.stringify(e.payload ?? {}))
  )
  console.log('4.6.4 RAW ' + JSON.stringify(rag).slice(0, 3000))
  expect(result.tools.join(','), 'искал по индексу').toMatch(/rag_query|rag_/)
  expect(result.text).toMatch(/42/)
  expect(result.text, 'ссылка на файл из папки OneDrive').toMatch(/ведомость-облако/)
  await record(test.info(), page, { transcript: result.transcript })
})
