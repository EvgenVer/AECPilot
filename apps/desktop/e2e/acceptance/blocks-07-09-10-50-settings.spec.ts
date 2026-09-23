// Блоки 7, 9, 10, 50 чек-листа (задача 3F.5): настройки без ввода ключа
// наружу, язык и тема, оболочка, правый клик — 18 позиций. Всё решается в
// окне и в главном процессе: их экраны настроек за нашим мостом, наши экраны
// проекта, их оболочка панелей, наш мост правого клика (UR37). Ходов модели
// нет, стенд на моке. Уровни языка 9.2.2/9.2.3 (строка в SOUL) — на живом
// ядре, задача 3F.8.
//
// Имя теста начинается с номера позиции — по нему сходятся чек-лист, отчёт
// и счётчик покрытия. Файл идёт последовательно: язык переключается в одном
// тесте и проверяется после перезапуска в следующем.
//
// Домашняя папка ядра — временная (`AEC_HERMES_HOME`): позиция 7.2.1 читает
// её `.env`, и он не должен быть ни настоящим, ни общим с другими прогонами.

import { expect, test, type Locator, type Page } from '@playwright/test'
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  clearNotifications,
  desktopDir,
  hideFirstRunSurfaces,
  mainWindow,
  openProject,
  reviveStrandedSession,
  send,
  standFixture
} from '../lib/app'

test.describe.configure({ mode: 'serial' })

const hermesHome = mkdtempSync(join(tmpdir(), 'aecpilot-e2e-home-'))
const stand = standFixture({
  mode: 'mock',
  label: 'blocks-07-09-10-50',
  env: { AEC_HERMES_HOME: hermesHome }
})

/** Красный квадрат 64×64 — картинка для ответа агента (позиция 50.2.1). */
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAT0lEQVR42u3PQQkAAAgEsItz/VMYywi+hcEKLNO+FgEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQGBywLvDoEAVSaz4wAAAABJRU5ErkJggg=='

/** Проект создан первым тестом; после перезапуска приложение его не помнит
 *  (D-89) и он открывается заново тем же IPC, что и недавние. */
let projectCreated = false

/** Главное окно с открытым проектом и живым композером. */
async function ui(): Promise<Page> {
  const page = await mainWindow(stand.get())
  await hideFirstRunSurfaces(page)
  if (!(await page.evaluate(() => window.aecpilot.getCurrentProject()))) {
    if (projectCreated) {
      const result = await page.evaluate(
        (dir) => window.aecpilot.openProject(dir),
        stand.get().projectDir
      )
      expect(result, `openProject: ${JSON.stringify(result)}`).toMatchObject({ ok: true })
    } else {
      await openProject(stand.get(), page)
      projectCreated = true
    }
  }
  await reviveStrandedSession(page)
  return page
}

/** Экран настроек по адресу их маршрута: `tab` — раздел, остальное — подвид. */
async function openSettings(page: Page, query: string): Promise<void> {
  await page.evaluate((hash) => {
    location.hash = hash
  }, `#/settings?${query}`)
  await expect(page.getByRole('button', { name: /Закрыть настройки|Close settings/ }))
    .toBeVisible({ timeout: 15000 })
    .catch(() => undefined)
}

/** Закрыть настройки — вернуться к чату. */
async function closeSettings(page: Page): Promise<void> {
  await page.evaluate(() => {
    location.hash = '#/'
  })
  await expect(page.getByRole('textbox', { name: /Message|Сообщение/ })).toBeVisible({
    timeout: 30000
  })
}

/** Все файлы под папкой, рекурсивно. */
function filesUnder(root: string): string[] {
  if (!existsSync(root)) return []
  const out: string[] = []
  for (const name of readdirSync(root)) {
    const full = join(root, name)
    if (statSync(full).isDirectory()) out.push(...filesUnder(full))
    else out.push(full)
  }
  return out
}

/** Файлы, в которых встречается строка. */
function filesContaining(root: string, needle: string): string[] {
  return filesUnder(root).filter((file) => {
    try {
      return (
        readFileSync(file, 'latin1').includes(needle) || readFileSync(file, 'utf8').includes(needle)
      )
    } catch {
      return false
    }
  })
}

/** Данные, а не интерфейс: путь проекта в меню, имена файлов vault в
 *  проводнике, пример английского имени сущности в подсказке о языке графа. */
function withoutData(text: string): string {
  let out = text.replaceAll(stand.get().projectDir, '')
  for (const name of readdirSync(stand.get().projectDir)) out = out.replaceAll(name, '')
  return out.replaceAll('Severnaya Site', '')
}

/** Латинские слова текста, кроме тех, что законны в русском интерфейсе:
 *  имена продукта и форматов, клавиши, идентификаторы. */
function foreignLatinWords(text: string): string[] {
  const allowed =
    /^(Vault|AECPilot|e2e|SOUL|OneDrive|Ctrl|Shift|Alt|Enter|Esc|Del|Tab|Space|PDF|DOCX|XLSX|CSV|TXT|MD|JSON|YAML|API|MCP|RAG|LightRAG|Mem0|URL|ID|HUD|F\d{1,2}|[A-Z])$/i
  const words = withoutData(text).match(/[A-Za-z][A-Za-z'-]+/g) ?? []
  return [...new Set(words.filter((word) => !allowed.test(word)))]
}

/** Кириллица в тексте — то, чего на переведённом на английский экране быть не
 *  должно. Данные проекта (имя, пути) в тексты экранов не попадают: проект
 *  называется `e2e`, папки образца не подключены. */
function cyrillicWords(text: string): string[] {
  // «Северная площадка» — пример русского имени сущности в английской подсказке
  // о языке графа; он там намеренно.
  const example = /^(Северная|площадка)$/
  return [...new Set((text.match(/[А-Яа-яЁё]{2,}/g) ?? []).filter((word) => !example.test(word)))]
}

/** Закрыть наш диалог его крестиком: на Escape он не реагирует (замечено
 *  20.09.2026, не в чек-листе). */
async function closeDialog(dialog: Locator): Promise<void> {
  await dialog.getByRole('button', { name: /^(Закрыть|Close)$/ }).click()
  await expect(dialog).toBeHidden()
}

/** Текст наших экранов: меню проекта, диалог настроек проекта, вкладка Vault
 *  (проводник и источники), панель изменений. Каждый открывается и снимается
 *  по очереди; меню и диалог закрываются. */
async function ourScreensText(page: Page): Promise<string> {
  const chunks: string[] = []
  const projectButton = page.getByRole('contentinfo').getByRole('button', { name: 'e2e' })
  await projectButton.click()
  const projectMenu = page.getByRole('menu').last()
  await expect(projectMenu).toBeVisible()
  chunks.push(await projectMenu.innerText())
  await page.getByRole('menuitem', { name: /Настройки проекта|Project settings/ }).click()
  const dialog = page.getByRole('dialog').last()
  await expect(dialog.locator('#aec-agent-lang')).toBeVisible()
  chunks.push(await dialog.innerText())
  await closeDialog(dialog)

  // Вкладка Vault левой колонки: проводник и под ним источники. Их общий
  // контейнер — ближайший предок кнопки «Новый файл», в котором есть и кнопка
  // подключения папки; вкладки колонки (их «sessions», «Bots») в него не входят.
  const vaultTab = page.getByRole('tab', { name: /Vault/ })
  await expect(vaultTab).toBeVisible({ timeout: 30000 })
  await vaultTab.click()
  const newFile = page.getByRole('button', { name: /^(Новый файл|New file)$/ })
  await expect(newFile).toBeVisible()
  const vaultPane = newFile.locator(
    'xpath=ancestor::*[.//button[@aria-label="Подключить папку" or @aria-label="Connect a folder"]][1]'
  )
  chunks.push(await vaultPane.innerText())
  await page.getByRole('tab', { name: /sessions/i }).click()

  // Панель изменений (Ctrl+G): список снимков мока.
  await page.keyboard.press('Control+g')
  const newest = page.getByText('06.08.2026, 10:00')
  await expect(newest).toBeVisible({ timeout: 30000 })
  await expect(page.getByRole('tab', { name: /^(Изменения|Changes)/ })).toBeVisible()
  chunks.push(
    await newest.locator('xpath=ancestor::*[.//*[contains(., "06.08.2026, 09:00")]][1]').innerText()
  )
  await page.keyboard.press('Control+g')
  return chunks.join('\n')
}

// ───────────────────────── Блок 7. Настройки и ключи ─────────────────────────

test('7.1.2 экран ключей: ни у одного ключа, даже заданного, нет «показать значение»', async () => {
  const page = await ui()
  // Заданные ключи мока (`OPENAI_API_KEY`, `FIRECRAWL_API_KEY`) — карточки с
  // замаскированным значением: именно у заданного ключа их экран предлагал
  // показать значение. Карточка раскрывается щелчком по маскированному полю —
  // так появляются все её кнопки.
  for (const [query, name, masked] of [
    ['tab=providers&pview=keys', /^OpenAI\b/, 'sk-...cd12'],
    ['tab=keys', /^FIRECRAWL\b/, 'fc-...9f1e']
  ] as const) {
    await openSettings(page, query)
    // Имя карточки меняется вместе с её содержимым (свёрнутая несёт маску,
    // раскрытая — кнопку «Удалить»), поэтому ищется по имени провайдера.
    const card = page.getByRole('button', { name })
    await expect(card).toBeVisible({ timeout: 20000 })
    await expect(card.getByRole('textbox')).toHaveValue(masked)
    await card.getByRole('textbox').click()
    await expect(card.getByRole('button', { name: /Удалить|Remove/ })).toBeVisible()
    const controls = await card.getByRole('button').allInnerTexts()
    const labels = await card
      .getByRole('button')
      .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''))
    expect([...controls, ...labels].join(' | ')).not.toMatch(/Показать|Reveal|Show/i)
    const text = await page.locator('body').innerText()
    expect(text, query).not.toMatch(/Показать (ключ|значение)|Reveal/i)
    await page.keyboard.press('Escape')
    await expect(card.getByRole('textbox')).toHaveValue(masked)
  }
  await closeSettings(page)
})

test('7.2.1 ключ, введённый на их экране, в .env профиля не появляется и открытым текстом не хранится', async () => {
  const page = await ui()
  const key = `sk-ant-e2e-${Date.now().toString(36)}-secret`
  await openSettings(page, 'tab=providers&pview=keys')
  const field = page.getByPlaceholder(/Вставить ключ Anthropic|Paste Anthropic key/).first()
  await expect(field).toBeVisible({ timeout: 20000 })
  await field.click()
  await field.fill(key)
  await page.keyboard.press('Enter')
  // Запись перехватывает главный процесс: хранилище появляется в userData.
  const store = join(stand.get().userDataDir, 'llm-settings.json')
  await expect
    .poll(() => existsSync(store) && readFileSync(store, 'utf8').includes('ANTHROPIC_API_KEY'), {
      timeout: 15000
    })
    .toBe(true)
  await closeSettings(page)

  const env = join(hermesHome, '.env')
  if (existsSync(env)) expect(readFileSync(env, 'utf8')).not.toContain(key)
  expect(filesContaining(hermesHome, key), 'ключ в домашней папке ядра').toEqual([])
  expect(filesContaining(stand.get().userDataDir, key), 'ключ открытым текстом в userData').toEqual(
    []
  )
})

test('7.3.1 раздела биллинга и кредитов нет', async () => {
  const page = await ui()
  await openSettings(page, 'tab=about')
  const text = await page.locator('body').innerText()
  expect(text).not.toMatch(/биллинг|billing|кредит|credits/i)
  await closeSettings(page)
})

test('7.3.2 разделов расписаний, каналов, вебхуков, агентов и Command Center в настройках нет', async () => {
  const page = await ui()
  await openSettings(page, 'tab=about')
  // Навигация настроек — их боковая колонка; берём все кнопки разделов.
  const nav = page.getByRole('complementary').first()
  const labels = (await nav.count())
    ? await nav.innerText()
    : await page.locator('body').innerText()
  expect(labels).not.toMatch(
    /расписани|schedul|cron|внешн\S* канал|channels?\b|вебхук|webhook|агент|agents?\b|command center/i
  )
  await closeSettings(page)
})

// ───────────────────────── Блок 9. Язык и тема ─────────────────────────

/** Выбрать язык в открытом списке: их список — cmdk, щелчок по строке
 *  перехватывает корень списка, а клавиатура — путь человека: набрать и
 *  нажать Enter. */
async function pickLanguage(page: Page, name: string): Promise<void> {
  const option = page.getByRole('option', { name })
  await expect(option).toBeVisible()
  await page.keyboard.type(name)
  await expect(option).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Enter')
}

test('9.1.1 язык: English применяется сразу, без перезапуска', async () => {
  const page = await ui()
  await page.evaluate(() => {
    ;(window as unknown as { __noReload?: number }).__noReload = 1
  })
  await openSettings(page, 'tab=config:appearance')
  await page.getByRole('button', { name: 'Сменить язык' }).click()
  await pickLanguage(page, 'English')
  await expect(page.getByRole('button', { name: 'Switch language' })).toBeVisible()
  await expect(page.getByText('Appearance', { exact: true }).first()).toBeVisible()
  expect(
    await page.evaluate(() => (window as unknown as { __noReload?: number }).__noReload),
    'окно не перезагружалось'
  ).toBe(1)
  await closeSettings(page)
  await expect(page.getByRole('button', { name: /New session/ }).first()).toBeVisible()
})

test('9.1.2 наши экраны по-английски — без кириллицы', async () => {
  const page = await ui()
  const text = await ourScreensText(page)
  expect(cyrillicWords(text)).toEqual([])
})

test('9.1.1 выбор языка переживает перезапуск, обратный выбор — тоже', async () => {
  await stand.get().relaunch()
  let page = await ui()
  await expect(page.getByRole('button', { name: /New session/ }).first()).toBeVisible()
  await openSettings(page, 'tab=config:appearance')
  await page.getByRole('button', { name: 'Switch language' }).click()
  await pickLanguage(page, 'Русский')
  await expect(page.getByRole('button', { name: 'Сменить язык' })).toBeVisible()
  await closeSettings(page)

  await stand.get().relaunch()
  page = await ui()
  await expect(page.getByRole('button', { name: /Новый сеанс/ }).first()).toBeVisible()
})

test('9.1.2 наши экраны по-русски — без английских слов', async () => {
  const page = await ui()
  const text = await ourScreensText(page)
  expect(foreignLatinWords(text)).toEqual([])
})

test('9.1.3 их непереведённые строки — английские слова, а не ключи каталога', async () => {
  const page = await ui()
  await openSettings(page, 'tab=config:appearance')
  const text = await page.locator('body').innerText()
  expect(text).not.toMatch(/\bundefined\b|\[object |\b[a-z]+\.[a-zA-Z]+\.[a-zA-Z]+\b/)
  await closeSettings(page)
})

test('9.2.1 поля трёх языков на месте; язык ответов подписан «ваш, а не проекта»', async () => {
  const page = await ui()
  await page.getByRole('contentinfo').getByRole('button', { name: 'e2e' }).click()
  await page.getByRole('menuitem', { name: 'Настройки проекта' }).click()
  const dialog = page.getByRole('dialog').last()
  await expect(dialog.getByLabel('Язык ответов агента')).toBeVisible()
  await expect(dialog.getByLabel('Язык вики')).toBeVisible()
  await expect(dialog.getByLabel('Язык имён в графе знаний')).toBeVisible()
  await expect(dialog.getByText(/Ваш, а не проекта/)).toBeVisible()
  // Первое поле стоит выше проектных.
  const agent = (await dialog.locator('#aec-agent-lang').boundingBox())!
  const wiki = (await dialog.locator('#aec-wiki-lang').boundingBox())!
  expect(agent.y).toBeLessThan(wiki.y)
  await closeDialog(dialog)
})

/** Выбрать язык ответов агента в «Настройках проекта» и сохранить — путь
 *  человека к настройке G7. */
async function chooseAgentLanguage(page: Page, label: string, stored: string): Promise<void> {
  await page.getByRole('contentinfo').getByRole('button', { name: 'e2e' }).click()
  await page.getByRole('menuitem', { name: 'Настройки проекта' }).click()
  const dialog = page.getByRole('dialog').last()
  await dialog.locator('#aec-agent-lang').selectOption({ label })
  await dialog.getByRole('button', { name: 'Сохранить' }).click()
  await expect
    .poll(() => page.evaluate(async () => (await window.aecpilot.getAgentLanguage()).language))
    .toBe(stored)
  if (await dialog.isVisible()) await closeDialog(dialog)
}

/** SOUL, который ДОЕХАЛ до ядра: мок печатает полученный `profiles.create`.
 *  Проверять надо то, что ушло на другую сторону, а не то, что мы собирались
 *  дописать (тот же довод, что в smoke). */
function soulReceived(marker: string): string {
  const line = stand
    .get()
    .mockOutput()
    .split(/\r?\n/)
    .filter((one) => one.startsWith('MOCK_PROFILE_SOUL '))
    .map((one) => JSON.parse(one.slice('MOCK_PROFILE_SOUL '.length)) as string)
    .find((soul) => soul.includes(marker))
  return line ?? ''
}

const SOUL_BASE = '# Probe\n\n**Role:** e2e'

// Специалист создаётся тем же вызовом моста, что и их диалог создания: строку
// про язык дописывает мост, а не диалог, и UI-диалог на моке упирается в
// приветственный ход модели, которого у мока нет.
test('9.2.2 «Русский» в языке ответов — в SOUL нового специалиста строка про язык', async () => {
  const page = await ui()
  await chooseAgentLanguage(page, 'Русский', 'ru')
  await page.evaluate(
    (soul) => window.aecpilot.gatewayRpc('profiles.create', { name: 'aec-e2e-g7-ru', soul }),
    `${SOUL_BASE} g7-ru`
  )
  await expect.poll(() => soulReceived('g7-ru'), { timeout: 15000 }).toMatch(/по-русски/)
})

test('9.2.3 «Не задан» — в SOUL следующего специалиста строки про язык НЕТ', async () => {
  const page = await ui()
  await chooseAgentLanguage(page, 'Не задан', '')
  await page.evaluate(
    (soul) => window.aecpilot.gatewayRpc('profiles.create', { name: 'aec-e2e-g7-unset', soul }),
    `${SOUL_BASE} g7-unset`
  )
  await expect
    .poll(() => soulReceived('g7-unset'), { timeout: 15000 })
    .toBe(`${SOUL_BASE} g7-unset`)
})

test('9.2.4 смена языка имён в графе спрашивает второй раз и называет цену; «Отмена» ничего не пишет', async () => {
  const page = await ui()
  const projectJson = join(stand.get().projectDir, '.aecpilot', 'project.json')
  const before = readFileSync(projectJson, 'utf8')
  await page.getByRole('contentinfo').getByRole('button', { name: 'e2e' }).click()
  await page.getByRole('menuitem', { name: 'Настройки проекта' }).click()
  const dialog = page.getByRole('dialog').last()
  await dialog.locator('#aec-graph-lang').selectOption('English')
  await expect(dialog.getByRole('alert')).toContainText(/полную переиндексацию/)
  await dialog.getByRole('button', { name: 'Сохранить' }).click()
  const confirm = dialog.getByRole('button', { name: 'Сменить и переиндексировать' })
  await expect(confirm).toBeVisible()
  await dialog.getByRole('button', { name: 'Отмена' }).click()
  await expect(confirm).toBeHidden()
  await expect(dialog.getByRole('button', { name: 'Сохранить' })).toBeVisible()
  await closeDialog(dialog)
  expect(readFileSync(projectJson, 'utf8')).toBe(before)
})

test('9.3.1 тема: светлая и тёмная меняют всё окно, включая полосы прокрутки', async () => {
  const page = await ui()
  await openSettings(page, 'tab=config:appearance')
  // Схема цвета корня — она красит и системные элементы, и полосы прокрутки;
  // фон — первый непрозрачный под серединой окна (у `body` он прозрачный).
  const look = () =>
    page.evaluate(() => {
      const clear = /^rgba\(\d+, \d+, \d+, 0\)$|^transparent$/
      const stack = document.elementsFromPoint(innerWidth / 2, innerHeight / 2)
      const painted = stack
        .map((el) => getComputedStyle(el).backgroundColor)
        .find((color) => !clear.test(color))
      return {
        scheme: getComputedStyle(document.documentElement).colorScheme,
        background: painted ?? 'rgb(0, 0, 0)'
      }
    })
  const luminance = (rgb: string): number => {
    const [r, g, b] = (rgb.match(/\d+/g) ?? ['0', '0', '0']).map(Number)
    return (r + g + b) / 3
  }

  await page.getByRole('button', { name: 'Тёмная' }).click()
  await expect.poll(async () => (await look()).scheme).toBe('dark')
  const dark = await look()
  expect(luminance(dark.background)).toBeLessThan(96)
  await test.info().attach('9.3.1-dark.png', {
    body: await page.screenshot(),
    contentType: 'image/png'
  })

  await page.getByRole('button', { name: 'Светлая' }).click()
  await expect.poll(async () => (await look()).scheme).toBe('light')
  const light = await look()
  expect(luminance(light.background)).toBeGreaterThan(160)
  await test.info().attach('9.3.1-light.png', {
    body: await page.screenshot(),
    contentType: 'image/png'
  })

  await page.getByRole('button', { name: 'Системная' }).click()
  await closeSettings(page)
})

// ───────────────────────── Блок 10. Оболочка ─────────────────────────

test('10.1.1 границы панелей тянутся, боковая панель сворачивается, размеры переживают перезапуск', async () => {
  let page = await ui()
  const sash = page.getByRole('separator').first()
  await expect(sash).toBeVisible()
  const before = (await sash.boundingBox())!
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2)
  await page.mouse.down()
  await page.mouse.move(before.x + 60, before.y + before.height / 2, { steps: 6 })
  await page.mouse.move(before.x + 120, before.y + before.height / 2, { steps: 6 })
  await page.mouse.up()
  const after = (await sash.boundingBox())!
  expect(after.x - before.x).toBeGreaterThan(80)

  const hide = page.getByRole('button', { name: /Скрыть боковую панель/ })
  await hide.click()
  const show = page.getByRole('button', { name: /Показать боковую панель/ })
  await expect(show).toBeVisible()
  await expect(page.getByRole('button', { name: 'Новый сеанс Ctrl N' })).toBeHidden()
  await show.click()
  await expect(page.getByRole('button', { name: 'Новый сеанс Ctrl N' })).toBeVisible()
  expect(Math.abs((await sash.boundingBox())!.x - after.x)).toBeLessThan(3)

  await stand.get().relaunch()
  page = await ui()
  const restored = (await page.getByRole('separator').first().boundingBox())!
  expect(Math.abs(restored.x - after.x)).toBeLessThan(3)
})

test('10.2.1 палитра команд открывается; команд про питомца в ней нет', async () => {
  const page = await ui()
  await page.keyboard.press('Control+k')
  const palette = page.getByRole('dialog').last()
  await expect(palette).toBeVisible()
  for (const query of ['pet', 'hatch', 'питом']) {
    await page.keyboard.press('Control+a')
    await page.keyboard.type(query)
    await page.waitForTimeout(300)
    const text = await palette.innerText()
    expect(text, `палитра по запросу «${query}»`).not.toMatch(/\/pet\b|\/hatch\b|питом/i)
  }
  await page.keyboard.press('Escape')
  await expect(palette).toBeHidden()
})

test('10.3.1 две сессии: переключение, история каждой на месте', async () => {
  const page = await ui()
  await send(page, 'say: один')
  await expect(page.getByText('один', { exact: true }).last()).toBeVisible({ timeout: 30000 })
  await page
    .getByRole('button', { name: /^Новый сеанс/ })
    .first()
    .click()
  await expect(page.getByText('один', { exact: true })).toHaveCount(0)
  await send(page, 'say: два')
  await expect(page.getByText('два', { exact: true }).last()).toBeVisible({ timeout: 30000 })

  const rowOne = page.getByRole('button', { name: /^Reorder say: один say: один$/ })
  const rowTwo = page.getByRole('button', { name: /^Reorder say: два say: два$/ })
  await expect(rowOne).toBeVisible()
  await expect(rowTwo).toBeVisible()
  await rowOne.click()
  await expect(page.getByText('один', { exact: true }).last()).toBeVisible({ timeout: 30000 })
  await expect(page.getByText('два', { exact: true })).toHaveCount(0)
  await rowTwo.click()
  await expect(page.getByText('два', { exact: true }).last()).toBeVisible({ timeout: 30000 })
  await expect(page.getByText('один', { exact: true })).toHaveCount(0)
})

// ───────────────────────── Блок 50. Правый клик, орфография, окно ─────────────────────────

/** Правый клик в точке; возвращает открытое меню. */
async function rightClick(page: Page, x: number, y: number): Promise<Locator> {
  await page.mouse.click(x, y, { button: 'right' })
  const menu = page.locator('[role=menu]').last()
  await expect(menu).toBeVisible({ timeout: 5000 })
  return menu
}

/** Середина первых пяти букв текста композера — слово «привт». */
async function wordCentre(composer: Locator): Promise<{ x: number; y: number }> {
  return composer.evaluate((el) => {
    const node = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode()!
    const range = document.createRange()
    range.setStart(node, 0)
    range.setEnd(node, 5)
    const r = range.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })
}

test('50.1.1 правый клик в поле ввода: вырезать, копировать, вставить, выделить всё', async () => {
  const page = await ui()
  const composer = await reviveStrandedSession(page)
  await composer.click()
  await page.keyboard.type('текст для меню')
  const box = (await composer.boundingBox())!
  let menu = await rightClick(page, box.x + 24, box.y + box.height / 2)
  for (const name of [/^Вырезать/, /^Копировать/, /^Вставить/, /^Выделить всё/]) {
    await expect(menu.getByRole('menuitem', { name })).toBeVisible()
  }
  await menu.getByRole('menuitem', { name: /^Выделить всё/ }).click()
  await expect
    .poll(() => page.evaluate(() => getSelection()?.toString() ?? ''))
    .toBe('текст для меню')
  // С выделением «вырезать» и «копировать» доступны.
  menu = await rightClick(page, box.x + 24, box.y + box.height / 2)
  await expect(menu.getByRole('menuitem', { name: /^Вырезать/ })).toBeEnabled()
  await expect(menu.getByRole('menuitem', { name: /^Копировать/ })).toBeEnabled()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await composer.click()
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Delete')
})

test('50.2.1 правый клик по картинке в ленте: «копировать изображение»', async () => {
  const page = await ui()
  await clearNotifications(page)
  // Картинка в ленте — из сообщения человека: их композер выносит `data:`-адрес
  // из текста во вложение и рисует его в ленте. В ответе агента их разметка
  // `data:`-картинку глушит («Image blocked») — ответ здесь только для того,
  // чтобы ход завершился.
  await send(page, `say: ![схема](data:image/png;base64,${PNG})`)
  await expect(page.getByText('[Image blocked: схема]')).toBeVisible({ timeout: 30000 })
  const img = page.locator('img[src^="data:image/png"]').last()
  await expect(img).toBeVisible({ timeout: 30000 })
  await page.waitForTimeout(1000)
  await img.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  const box = (await img.boundingBox())!
  // Угол картинки: в центре её накрывает кнопка предпросмотра.
  const menu = await rightClick(page, box.x + 8, box.y + box.height - 8)
  const copy = menu.getByRole('menuitem', { name: 'Копировать изображение' })
  await expect(copy).toBeVisible()

  const app = stand.get().app
  const clipboardWorks = await app.evaluate(({ clipboard }) => {
    clipboard.writeText('aecpilot-e2e-clipboard-probe')
    return clipboard.readText() === 'aecpilot-e2e-clipboard-probe'
  })
  await app.evaluate(({ clipboard }) => clipboard.clear())
  await copy.click()
  await expect(menu).toBeHidden()
  if (clipboardWorks) {
    await expect
      .poll(() => app.evaluate(({ clipboard }) => clipboard.readImage().getSize()), {
        timeout: 5000
      })
      .toEqual({ width: 64, height: 64 })
  } else {
    // Буфер обмена недоступен процессам этого запуска (OpenClipboard →
    // ERROR_ACCESS_DENIED, замер 20.09.2026 из-под агента): байты не сверить,
    // проверен пункт меню и вызов. Из обычного терминала сверяются и байты.
    test.info().annotations.push({
      type: 'note',
      description: 'буфер обмена недоступен в этом окружении — байты картинки не сверялись'
    })
  }
})

test('50.3.1 опечатка по-русски: подчёркнута, правый клик предлагает замену, «добавить в словарь» работает', async () => {
  const page = await ui()
  const app = stand.get().app
  const composer = await reviveStrandedSession(page)
  await expect(composer).toHaveAttribute('spellcheck', 'true')
  // Факты Chromium о жесте — «подчёркнуто» в терминах движка: слово с ошибкой
  // в точке клика.
  await app.evaluate(({ BrowserWindow }) => {
    const store = globalThis as { __ctx?: { misspelledWord: string; isEditable: boolean }[] }
    store.__ctx = []
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.on('context-menu', (_event, params) => {
        store.__ctx!.push({ misspelledWord: params.misspelledWord, isEditable: params.isEditable })
      })
    }
  })
  const lastFacts = () =>
    app.evaluate(() => {
      const store = globalThis as { __ctx?: { misspelledWord: string; isEditable: boolean }[] }
      return store.__ctx?.at(-1)
    })
  // Словарь на Windows общий с системой: слово, добавленное прошлым прогоном,
  // живёт в пользовательском словаре ОС, и «опечатка» перестаёт быть опечаткой.
  // Убирается до и после (замер 20.09.2026: второй прогон без этого красный).
  const forget = () =>
    app.evaluate(({ session }) =>
      session.defaultSession.removeWordFromSpellCheckerDictionary('привт')
    )
  await forget()

  await composer.click()
  await page.keyboard.type('привт друг', { delay: 30 })
  await page.keyboard.press('Space')
  await page.waitForTimeout(2000)
  let point = await wordCentre(composer)
  let menu = await rightClick(page, point.x, point.y)
  await expect.poll(lastFacts).toEqual({ misspelledWord: 'привт', isEditable: true })
  const suggestion = menu.getByRole('menuitem', { name: 'привет' })
  await expect(suggestion).toBeVisible({ timeout: 5000 })
  await suggestion.click()
  await expect(composer).toHaveText(/^привет друг\s*$/)

  await page.keyboard.press('Control+a')
  await page.keyboard.press('Delete')
  await page.keyboard.type('привт друг', { delay: 30 })
  await page.keyboard.press('Space')
  await page.waitForTimeout(2000)
  point = await wordCentre(composer)
  menu = await rightClick(page, point.x, point.y)
  await menu.getByRole('menuitem', { name: 'Добавить в словарь' }).click()
  await expect
    .poll(() =>
      app.evaluate(({ session }) => session.defaultSession.listWordsInSpellCheckerDictionary())
    )
    .toContain('привт')
  await forget()
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Delete')
})

test('50.4.1 F12 и Ctrl+Shift+I не открывают инструменты разработчика', async () => {
  const page = await ui()
  const app = stand.get().app
  const devtoolsOpen = () =>
    app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().some((win) => win.webContents.isDevToolsOpened())
    )
  expect(await devtoolsOpen()).toBe(false)
  await page.keyboard.press('F12')
  await page.waitForTimeout(800)
  expect(await devtoolsOpen()).toBe(false)
  await page.keyboard.press('Control+Shift+i')
  await page.waitForTimeout(800)
  expect(await devtoolsOpen()).toBe(false)

  // И с их выключателем «Отключить F12 DevTools» — то же самое.
  await openSettings(page, 'tab=config:model')
  await page.getByRole('complementary').getByRole('button', { name: 'Дополнительно' }).click()
  const toggle = page.getByRole('switch', { name: /Отключить F12/ })
  await expect(toggle).toBeVisible({ timeout: 15000 })
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await closeSettings(page)
  await page.keyboard.press('F12')
  await page.waitForTimeout(800)
  expect(await devtoolsOpen()).toBe(false)
})

test('50.5.1 «О программе»: наше имя и наша версия, без имени донора', async () => {
  const page = await ui()
  const version = (
    JSON.parse(readFileSync(join(desktopDir, 'package.json'), 'utf8')) as {
      version: string
    }
  ).version
  await openSettings(page, 'tab=about')
  const about = page.getByRole('main').first()
  const text = (await about.count())
    ? await about.innerText()
    : await page.locator('body').innerText()
  expect(text).toContain('AECPilot')
  expect(text).toContain(`Версия ${version}`)
  expect(text).not.toMatch(/hermes|nous/i)
  await closeSettings(page)
})
