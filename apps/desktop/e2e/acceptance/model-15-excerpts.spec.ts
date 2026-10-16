// Блок 15 чек-листа (задача 3F.9) на ЖИВОМ ядре: выдержки рядом со ссылками и
// их сверка с источником. Нужна индексация — ключ провайдера в хранилище
// приложения кладёт стенд (D-117). Образец — `lib/vault.ts`, источник
// `source-a` с отчётом PDF на 17 страниц.

import { cpSync } from 'node:fs'

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
import { recordChatEvents, turn, type TurnResult } from '../lib/turn'
import { addPdf, makeSampleVault, SAMPLE, type SampleVault } from '../lib/vault'

test.describe.configure({ mode: 'serial' })

const stand = standFixture({ mode: 'live', label: 'model-15', providerKeyInStore: true })

let sample: SampleVault
let projectOpened = false

test.beforeAll(async () => {
  sample = await makeSampleVault()
  cpSync(sample.vault, stand.get().projectDir, { recursive: true })
  await addPdf(stand.get().app, sample.sourceA)
})

interface IngestState {
  running: boolean
  lastReport?: { files_total: number; files_ok?: number } | null
}

async function ui(): Promise<Page> {
  const page = await mainWindow(stand.get())
  await hideFirstRunSurfaces(page)
  if (!projectOpened) {
    await openProject(stand.get(), page)
    projectOpened = true
    const added = await addSourceAsUser(stand.get(), page, sample.sourceA)
    expect(added, JSON.stringify(added)).toMatchObject({ ok: true })
    await page.evaluate(() => window.aecpilot.startIngest(true))
    await expect
      .poll(
        async () => {
          const state = (await page.evaluate(() => window.aecpilot.getIngestState())) as IngestState
          return !state.running && (state.lastReport?.files_total ?? 0) > 0
        },
        { timeout: 600000, intervals: [5000], message: 'индексация источника закончилась' }
      )
      .toBe(true)
  }
  await recordChatEvents(page)
  return page
}

function lastAnswer(page: Page): Locator {
  return page.locator('[data-slot="aui_assistant-message-root"]').last()
}

function chips(page: Page): Locator {
  return lastAnswer(page).locator('button[title^="[src:"]')
}

// Навык и инструмент названы явно: блок проверяет фишки и сверку выдержек, а
// то, что агент сам берёт `aec-qa`, мерят evals (`eval/`). Замер 24.09.2026:
// без названия модель то шла в `mem0_search` (D-111), то отвечала после
// `rag_query` ссылкой простым текстом («отчёт.pdf, страница 7»).
let answer: TurnResult

test('15.1.1 в ответе есть ссылка и выдержка в «ёлочках» рядом с ней', async () => {
  const page = await ui()
  answer = await turn(
    page,
    'По навыку aec-qa найди по индексу документов проекта инструментом rag_query (не памятью mem0, не кодом и не чтением файлов): какая расчётная нагрузка щита ЩС-1? Ответь со ссылкой на документ и дословной выдержкой из него в «ёлочках».',
    { timeoutMs: 300000 }
  )
  console.log('15.1 ' + answer.transcript)
  expect(answer.text, 'ссылка в машинном виде').toMatch(/\[src:/)
  expect(answer.text, 'выдержка в «ёлочках»').toMatch(/«[^»]{8,}»/)
  await expect(chips(page).first()).toBeVisible({ timeout: 30000 })
  await record(test.info(), page, { transcript: answer.transcript })
})

test('15.1.2 фишка ссылки обычная — серая, со значком файла', async () => {
  const page = await ui()
  const chip = chips(page).first()
  await expect(chip.locator('.codicon-file')).toHaveCount(1)
  await expect(chip.locator('.codicon-warning')).toHaveCount(0)
})

test('15.1.3 в подсказке фишки только сама ссылка, ничего про выдержки', async () => {
  const page = await ui()
  const title = (await chips(page).first().getAttribute('title')) ?? ''
  expect(title).toMatch(/^\[src:[^\n]*\]$/)
})

test('15.2.1 щелчок по фишке открывает документ на нужном месте', async () => {
  const page = await ui()
  const chip = chips(page).first()
  const raw = (await chip.getAttribute('title')) ?? ''
  const file = raw.match(/\/([^/#\]]+?)(?:#|\])/)?.[1] ?? ''
  expect(file, 'в ссылке есть имя файла').not.toBe('')
  // Уведомление сверху перекрывало фишку (замер 24.09.2026: «Расширенная память
  // перестала отвечать» — D-111).
  await clearNotifications(page)
  // Вьюер живёт в правой панели на вкладке Vault — как в блоках 16–21.
  const vaultTab = page.getByRole('tab', { name: /Vault/ })
  if ((await vaultTab.count()) > 0 && (await vaultTab.getAttribute('aria-selected')) !== 'true')
    await vaultTab.click()
  const showRight = page.getByRole('button', { name: /Показать правую панель|Show right sidebar/ })
  if ((await showRight.count()) > 0) await showRight.click()
  await chip.click()
  // Нужное место: строка про ЩС-1 стоит в отчёте PDF на странице 7; счётчик
  // страниц — сосед кнопки «Предыдущая страница» (как 16.1.1). Полосы вкладок с
  // «Закрыть <файл>» у единственного документа нет — она со второго (16.2.1).
  expect(file).toBe(SAMPLE.pdf)
  const counter = page
    .getByRole('button', { name: /Предыдущая страница|Previous page/ })
    .locator('xpath=following-sibling::span[1]')
  await expect(counter).toHaveText(`7 / ${SAMPLE.pdfPages}`, { timeout: 60000 })
  await record(test.info(), page)
})

test('15.3.1 на вопрос, которого нет в документах, ответ НАЧИНАЕТСЯ с того, что этого нет', async () => {
  const page = await ui()
  const result = await turn(
    page,
    'Найди по индексу документов проекта инструментом rag_query (не памятью mem0, не кодом и не чтением файлов): какая марка стали принята для металлоконструкций навеса над входом?',
    { timeoutMs: 300000 }
  )
  console.log('15.3 ' + result.transcript)
  const opening = result.text.trim().split(/(?<=[.!?])\s/)[0] ?? ''
  expect(opening, 'первая фраза говорит, что в документах этого нет').toMatch(
    /нет|не наш|не найден|отсутству|не указ|не привод|не содерж/i
  )
  await record(test.info(), page, { transcript: result.transcript })
})

// Шаг 4 чек-листа: пометку «увидеть хоть раз». Добросовестный агент её не
// вызывает, поэтому выдержка, которой нет в источнике, задаётся вопросом явно.
const FAKE_QUOTE = 'Нагрузка щита ЩС-1 составляет 99 кВт'

let fake: TurnResult

test('15.4.1 выдержка, которой нет в источнике: жёлтая фишка, в подсказке — сама фраза', async () => {
  const page = await ui()
  // Просьбу «приведи такую выдержку» агент отклоняет как выдумку (замер
  // 24.09.2026) — и правильно. Поэтому строку составляет тест, а агент её
  // повторяет: проверяется пометка приложения, а не честность агента.
  const sourceId = (await page.evaluate(() => window.aecpilot.listSources())).find(
    (s) => s.root_path === sample.sourceA
  )!.id
  const line = `[src: ${sourceId}/${SAMPLE.pdf}#p7](#cite) «${FAKE_QUOTE}»`
  fake = await turn(
    page,
    `Проверяем, что приложение помечает неверные выдержки жёлтым. Для проверки нужна одна заведомо неверная строка — вот она. Повтори её дословно, одной строкой, без изменений, исправлений и комментариев, инструментов не вызывай:\n${line}`,
    { timeoutMs: 300000 }
  )
  // Агент иногда сам сверяет выдержку (`rag_check_quote`) и отказывается её
  // повторять (замер 24.09.2026) — объясняем один раз, как объяснил бы человек.
  if (!fake.text.includes(FAKE_QUOTE)) {
    console.log('15.4 (отказ) ' + fake.transcript)
    fake = await turn(
      page,
      `Да, я знаю, что фраза неверна, — именно это и проверяем: приложение должно пометить её жёлтым. Фактом она не станет. Повтори строку как есть, одной строкой, без комментариев:\n${line}`,
      { timeoutMs: 300000 }
    )
  }
  console.log('15.4 ' + fake.transcript)
  const flagged = lastAnswer(page)
    .locator('button[title^="[src:"]')
    .filter({ has: page.locator('.codicon-warning') })
  await expect(flagged.first(), 'фишка помечена').toBeVisible({ timeout: 60000 })
  expect(await flagged.first().getAttribute('title')).toContain(FAKE_QUOTE)
  await record(test.info(), page, { transcript: fake.transcript })
})

test('15.4.2 текст ответа при этом не изменён — фраза стоит как её написал агент', async () => {
  const page = await ui()
  expect(fake.text).toContain(FAKE_QUOTE)
  await expect(lastAnswer(page)).toContainText(FAKE_QUOTE)
})
