// Блок 31 чек-листа (задача 3F.9) на ЖИВОМ ядре — позиции с ходом модели:
// агент СЛУШАЕТСЯ инструкций проекта только после доверия, перестаёт после их
// правки и не несёт их в другой проект. Окно доверия и уведомления без хода —
// в `live-29-31-skills-cron-instructions`.

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import { hideFirstRunSurfaces, mainWindow, openProject, standFixture } from '../lib/app'
import { record } from '../lib/evidence'
import { eventCount, eventsSince, recordChatEvents, turn, type ChatEvent } from '../lib/turn'

// В каждой позиции по два хода модели, и каждому дано до 240 с (D-170: ход без
// доверия останавливается «Стопом» только по пределу) — 300 с на позицию Gemini
// не хватало (31.5.1, 30.09.2026).
test.describe.configure({ mode: 'serial', timeout: 600000 })

const stand = standFixture({ mode: 'live', label: 'model-31' })

const RULE_LINE = 'СОГЛАСОВАНО ПО НОРМОКОНТРОЛЮ'
const SKILL_REL = '.agents/skills/nash-normokontrol/SKILL.md'
const SKILL_MD = [
  '---',
  'name: nash-normokontrol',
  'description: Правила оформления нашей организации',
  '---',
  `Всегда добавляй в конец ответа строку: ${RULE_LINE}.`,
  ''
].join('\n')
// Скил проекта модель открывает по требованию (`skill_view`), когда вопрос ему
// соответствует, — поэтому вопрос о том, что скил описывает. «Правило на любой
// вопрос» — это контекстный файл проекта, а не скил (D-130, вопрос владельцу).
const QUESTION =
  'Оформи по правилам оформления нашей организации однострочную справку: столица Франции — Париж. Кроме правил организации, инструментов не вызывай.'

let projectOpened = false

async function ui(): Promise<Page> {
  const page = await mainWindow(stand.get())
  await hideFirstRunSurfaces(page)
  if (!projectOpened) {
    // Окно доверия и есть предмет проверки, а общий перехватчик жмёт любую
    // «Не сейчас» — снимаем его, как в `live-29-31`.
    await page.removeLocatorHandler(page.getByRole('button', { name: /^(Not now|Не сейчас)$/ }))
    await openProject(stand.get(), page)
    projectOpened = true
  }
  await recordChatEvents(page)
  return page
}

function writeProjectSkill(dir: string, extra = ''): void {
  const file = join(dir, SKILL_REL)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, SKILL_MD + extra, 'utf-8')
}

function notice(page: Page, text: RegExp) {
  return page.locator('[role="status"], [role="alert"]').filter({ hasText: text })
}

function trustDialog(page: Page) {
  return page.getByRole('dialog').filter({ hasText: /Доверять инструкциям этого проекта|Инструкции проекта изменились/ })
}

async function openScratchProject(page: Page): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'aecpilot-e2e-other-'))
  await stand.get().app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [path] })) as never
  }, dir)
  expect(await page.evaluate(() => window.aecpilot.pickProjectDirectory())).toBe(dir)
  const created = await page.evaluate((path) => window.aecpilot.createProject(path, 'e2e-другой', true), dir)
  expect(created).toMatchObject({ ok: true })
  await page.waitForTimeout(2000)
  return dir
}

/** «Закрыть и снова открыть проект»: уход в пустой проект и возврат. */
async function reopenProject(page: Page, dir: string): Promise<void> {
  await openScratchProject(page)
  expect(await page.evaluate((path) => window.aecpilot.openProject(path), dir)).toMatchObject({ ok: true })
  await page.waitForTimeout(2000)
}

/** Вопрос в НОВОМ сеансе: инструкции проекта ядро кладёт в сеанс при создании. */
async function askFresh(page: Page): Promise<string> {
  return (await askFreshTurn(page)).text
}

async function askFreshTurn(page: Page): Promise<{ text: string; transcript: string }> {
  await page.getByRole('button', { name: /^(Новый сеанс|New session)/ }).first().click()
  await expect(page.getByRole('textbox', { name: /Message|Сообщение/ })).toBeVisible({ timeout: 30000 })
  const result = await turn(page, QUESTION)
  console.log('31 ' + result.transcript.replace(/\n/g, ' ⏎ '))
  return result
}

/** D-166 (решение владельца 2026-09-30): без доверия скил проекта ядро агенту НЕ
 * предлагает — открыть его через `skill_view` агент не может. Прочесть файл сам
 * инструментами по явной просьбе человека ему можно; тогда строка правила в ответе
 * допустима. Замер 30.09.2026 на Gemini: `search_files` → `read_file` → правило. */
async function expectUntrusted(page: Page, why: string): Promise<void> {
  const { events, text, transcript } = await askUntrustedTurn(page)
  // D-170: попытку открыть скил агент делает — имя он знает из памяти первого
  // проекта. Граница в том, что ядро скил НЕ отдаёт: текста правила в ответе
  // `skill_view` нет.
  const viewIds = new Set(
    events
      .filter((event) => /^tool\.start/.test(event.type) && event.payload?.name === 'skill_view')
      .map((event) => event.payload?.tool_id)
  )
  const views = events.filter(
    (event) =>
      event.type === 'tool.complete' && (viewIds.has(event.payload?.tool_id) || event.payload?.name === 'skill_view')
  )
  expect(JSON.stringify(views), `${why}: скил не отдан ядром`).not.toContain(RULE_LINE)
  if (text.includes(RULE_LINE)) {
    expect(transcript, `${why}: правило — только если агент сам прочёл файл`).toMatch(
      /read_file|search_files/
    )
  }
}

function toolNames(events: ChatEvent[]): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const event of events) {
    if (!/^tool\.start/.test(event.type)) continue
    const id = event.payload?.tool_id ?? `${names.length}`
    if (seen.has(id)) continue
    seen.add(id)
    names.push(event.payload?.name ?? '?')
  }
  return names
}

/** D-170 (решение владельца 2026-09-30): получив отказ ядра в скиле, Gemini в
 * чужом проекте ищет «правила организации» по файлам и командам дольше 4 минут
 * (3 прогона из 4). Это приемлемо — граница держится отказом ядра, а не скоростью.
 * Ход дольше предела останавливается «Стопом», как остановил бы человек, и
 * проверяется то, что агент успел сделать. */
async function askUntrustedTurn(
  page: Page
): Promise<{ events: ChatEvent[]; text: string; transcript: string }> {
  await page.getByRole('button', { name: /^(Новый сеанс|New session)/ }).first().click()
  await expect(page.getByRole('textbox', { name: /Message|Сообщение/ })).toBeVisible({ timeout: 30000 })
  const mark = await eventCount(page)
  try {
    // В поиске агент просит и команды — 30.09.2026 это был скрипт, читающий базу
    // mem0 профиля. Подтверждение ядро спрашивает; осторожный человек отклоняет.
    const result = await turn(page, QUESTION, { declineForeign: true })
    console.log('31 ' + result.transcript.replace(/\n/g, ' ⏎ '))
    return { events: await eventsSince(page, mark), text: result.text, transcript: result.transcript }
  } catch (error) {
    if (!String(error).includes('ход закончился (message.complete)')) throw error
  }
  await page.getByRole('button', { name: /^(Стоп|Stop)$/ }).first().click()
  await expect
    .poll(async () => (await eventsSince(page, mark)).some((event) => event.type === 'message.complete'), {
      timeout: 60000,
      message: 'ход остановлен «Стопом»'
    })
    .toBe(true)
  const events = await eventsSince(page, mark)
  const text = events.find((event) => event.type === 'message.complete')?.payload?.text ?? ''
  const transcript = [
    `> ${QUESTION}`,
    ...toolNames(events).map((name) => `[инструмент] ${name}`),
    '[ответ, остановлен «Стопом» после 240 с]',
    text
  ].join('\n')
  console.log('31 ' + transcript.replace(/\n/g, ' ⏎ '))
  return { events, text, transcript }
}

test('31.5.1 после «Доверять» агент правило выполняет (а до — нет)', async () => {
  const page = await ui()
  writeProjectSkill(stand.get().projectDir)
  await reopenProject(page, stand.get().projectDir)

  // Шаг 4: «Не сейчас» — правило не действует.
  await notice(page, /Проект несёт инструкции для агента/).getByRole('button', { name: 'Посмотреть' }).click()
  await expect(trustDialog(page)).toBeVisible({ timeout: 15000 })
  await trustDialog(page).getByRole('button', { name: 'Не сейчас' }).click()
  await expectUntrusted(page, 'без доверия')

  // Шаг 5: окно из строки состояния — «Доверять».
  await page.getByRole('button', { name: 'Инструкции проекта: 1, без доверия' }).click()
  await expect(trustDialog(page)).toBeVisible({ timeout: 15000 })
  await trustDialog(page).getByRole('button', { name: 'Доверять', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Инструкции проекта: 1', exact: true })).toBeVisible({ timeout: 30000 })
  expect(await askFresh(page), 'после доверия правило выполняется').toContain(RULE_LINE)
  await record(test.info(), page)
})

test('31.6.2 после правки файла до нового подтверждения агент правило не выполняет', async () => {
  const page = await ui()
  writeProjectSkill(stand.get().projectDir, 'И ещё: нумеруй разделы.\n')
  await reopenProject(page, stand.get().projectDir)
  await expect(notice(page, /Инструкции проекта изменились/)).toBeVisible({ timeout: 30000 })
  await expectUntrusted(page, 'после правки файла')
  await record(test.info(), page)
})

test('31.7.2 в другом проекте агент правило первого не выполняет', async () => {
  const page = await ui()
  // Сначала правило снова действует здесь — иначе проверка другого проекта
  // ничего бы не доказала.
  // Уведомление к этому времени скрылось — окно открывается строкой состояния.
  await page.getByRole('button', { name: /^Инструкции проекта/ }).click()
  await expect(trustDialog(page)).toBeVisible({ timeout: 15000 })
  await trustDialog(page).getByRole('button', { name: 'Доверять', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Инструкции проекта: 1', exact: true })).toBeVisible({ timeout: 30000 })
  expect(await askFresh(page), 'в своём проекте правило снова действует').toContain(RULE_LINE)

  await openScratchProject(page)
  await expect(page.getByRole('button', { name: /^Инструкции проекта/ })).toHaveCount(0)
  await expectUntrusted(page, 'в другом проекте')
  await record(test.info(), page)
})
