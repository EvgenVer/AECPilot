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
import { recordChatEvents, turn } from '../lib/turn'

test.describe.configure({ mode: 'serial' })

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
  await page.getByRole('button', { name: /^(Новый сеанс|New session)/ }).first().click()
  await expect(page.getByRole('textbox', { name: /Message|Сообщение/ })).toBeVisible({ timeout: 30000 })
  const result = await turn(page, QUESTION)
  console.log('31 ' + result.transcript.replace(/\n/g, ' ⏎ '))
  return result.text
}

test('31.5.1 после «Доверять» агент правило выполняет (а до — нет)', async () => {
  const page = await ui()
  writeProjectSkill(stand.get().projectDir)
  await reopenProject(page, stand.get().projectDir)

  // Шаг 4: «Не сейчас» — правило не действует.
  await notice(page, /Проект несёт инструкции для агента/).getByRole('button', { name: 'Посмотреть' }).click()
  await expect(trustDialog(page)).toBeVisible({ timeout: 15000 })
  await trustDialog(page).getByRole('button', { name: 'Не сейчас' }).click()
  expect(await askFresh(page), 'без доверия правило не действует').not.toContain(RULE_LINE)

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
  expect(await askFresh(page)).not.toContain(RULE_LINE)
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
  expect(await askFresh(page), 'в другом проекте — нет').not.toContain(RULE_LINE)
  await record(test.info(), page)
})
