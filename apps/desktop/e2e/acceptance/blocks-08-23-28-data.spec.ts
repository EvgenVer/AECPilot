// Блоки 8, 23, 24, 25, 26, 28 чек-листа (задача 3F.6): откат и история
// изменений, список сессий, композер, сохранение наружу, журнал — 33 позиции.
// Всё решается в окне, в главном процессе и на диске: правка агента здесь —
// ход заглушки ядра (`edit: <путь>` пишет файл под проектом через `write_file`
// и заводит снимок), нативные диалоги подменены В ГЛАВНОМ ПРОЦЕССЕ (путь,
// который человек не выбрал в доверенном диалоге, окну иметь не положено —
// значит и подмена там же), проводник и внешний браузер — заглушками со
// счётчиком. Настоящие окна Windows и настоящую правку живого ядра смотрят
// блоки уровня 3 (задача 3F.8) и ручной остаток.
//
// Имя теста начинается с номера позиции — по нему сходятся чек-лист, отчёт
// и счётчик покрытия. Файл идёт последовательно: правка агента в первом
// тесте — то, что откатывают следующие; перезапусков два (позиции «пережило
// перезапуск» и пустой список снимков).

import { expect, test, type Locator, type Page } from '@playwright/test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  clearNotifications,
  hideFirstRunSurfaces,
  mainWindow,
  openProject,
  reviveStrandedSession,
  send,
  standFixture
} from '../lib/app'

test.describe.configure({ mode: 'serial' })

const stand = standFixture({ mode: 'mock', label: 'blocks-08-23-28' })

/** Папка вне проекта, куда «сохраняют наружу»: картинку из лупы и архив
 *  профиля. */
const outsideDir = mkdtempSync(join(tmpdir(), 'aecpilot-e2e-outside-'))

/** Красный квадрат 64×64 — картинка «из буфера обмена» (позиция 26.1.1). */
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAT0lEQVR42u3PQQkAAAgEsItz/VMYywi+hcEKLNO+FgEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQGBywLvDoEAVSaz4wAAAABJRU5ErkJggg=='

/** Файл, который правит агент, и его текст до правки. */
const EDITED_FILE = 'wiki/zapiska.md'
const ORIGINAL_TEXT = 'исходная строка\nвторая строка\n'
const EDITED_LINE = 'строка после правки агента'

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
  // ОБХОД ДЕФЕКТА D-147, а не свойство продукта: после перезапуска список
  // сеансов проекта может встать на «Не удалось загрузить сеансы» и сам не
  // повторить. Нажимаем «Повторить», как сделал бы человек, и помечаем прогон.
  const failed = page.getByText(/Не удалось загрузить сеансы|Could not load sessions/)
  if (await failed.isVisible()) {
    test.info().annotations.push({ type: 'D-147', description: 'список сеансов после старта' })
    await page
      .getByRole('button', { name: /Повторить|Retry/ })
      .first()
      .click()
    await expect(failed).toBeHidden({ timeout: 15000 })
  }
  return page
}

/** Тестовая ручка заглушки (не поверхность ядра). */
async function mockControl(route: string, body: Record<string, unknown>): Promise<void> {
  const response = await fetch(`http://127.0.0.1:${stand.get().restPort}${route}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  expect(response.ok, `${route}: ${response.status}`).toBe(true)
}

/** Текст файла проекта. */
function projectFile(relPath: string): string {
  return readFileSync(join(stand.get().projectDir, relPath), 'utf8')
}

/** Метка времени снимка, как её печатает панель: `дд.мм.гггг, чч:мм`. */
function timeLabel(date: Date): string {
  const two = (n: number): string => String(n).padStart(2, '0')
  return `${two(date.getDate())}.${two(date.getMonth() + 1)}.${date.getFullYear()}, ${two(date.getHours())}:${two(date.getMinutes())}`
}

/** Метки «сейчас» и «минуту назад» — снимок сделан в пределах последней минуты. */
function recentLabels(): string[] {
  const now = new Date()
  return [timeLabel(now), timeLabel(new Date(now.getTime() - 60000))]
}

/** Список снимков панели «Изменения» (ul с подписью). */
function snapshotList(page: Page): Locator {
  return page.getByRole('list', { name: /^(Снимки|Snapshots)$/ })
}

/** Открыть панель «Изменения» (Ctrl+G — переключатель), если она не открыта.
 *  Сразу после перезапуска первое нажатие может уйти в пустоту (окно ещё без
 *  фокуса в документе) — поэтому щелчок в композер и до трёх попыток. */
async function openChanges(page: Page): Promise<void> {
  const tab = page.getByRole('tab', { name: /^(Изменения|Changes)/ })
  for (let attempt = 0; attempt < 3 && !(await tab.isVisible()); attempt += 1) {
    await page.getByRole('textbox', { name: /Message|Сообщение/ }).click()
    await page.keyboard.press('Control+g')
    await tab.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined)
  }
  await expect(tab).toBeVisible()
}

/** Закрыть панель «Изменения». */
async function closeChanges(page: Page): Promise<void> {
  const tab = page.getByRole('tab', { name: /^(Изменения|Changes)/ })
  // «На экране» — вкладка есть И выбрана. С 0.21.5 закрытая панель может
  // оставить невыбранную вкладку в ленте правой колонки рядом с соседями.
  const onScreen = async (): Promise<boolean> =>
    (await tab.isVisible()) && (await tab.getAttribute('aria-selected')) === 'true'
  // Та же осторожность, что у открытия: нажатие может уйти в пустоту, пока
  // панель перерисовывается после смены режима мока.
  for (let attempt = 0; attempt < 3 && (await onScreen()); attempt += 1) {
    await page.getByRole('textbox', { name: /Message|Сообщение/ }).click()
    await page.keyboard.press('Control+g')
    await expect
      .poll(onScreen, { timeout: 5000 })
      .toBe(false)
      .catch(() => undefined)
  }
  // Уборка, а не проверка: само переключение Ctrl+G утверждает свой тест
  // (блок 25, «панель закрывается тем же нажатием»). Здесь панель, оставшаяся
  // открытой, следующим тестам не мешает.
}

/** Корень панели — ближайший предок списка снимков, несущий и остальные части. */
function changesPanel(page: Page): Locator {
  return snapshotList(page).locator('xpath=..')
}

/** Строка снимка с меткой времени правки агента (первая в списке). */
function freshSnapshotRow(page: Page): Locator {
  const pattern = new RegExp(`^(${recentLabels().join('|')})$`)
  return snapshotList(page).getByRole('button', { name: pattern })
}

/** Подменить диалог сохранения в главном процессе: запомнить, о чём его
 *  попросили, и ответить путём (или отменой). */
async function stubSaveDialog(target: string | null): Promise<void> {
  await stand.get().app.evaluate(({ dialog }, canned) => {
    const bag = globalThis as unknown as { __saveCalls?: unknown[] }
    bag.__saveCalls = []
    dialog.showSaveDialog = (async (first: unknown, second?: unknown) => {
      bag.__saveCalls?.push(second === undefined ? first : second)
      return canned === null
        ? { canceled: true, filePath: undefined }
        : { canceled: false, filePath: canned }
    }) as never
  }, target)
}

async function saveDialogCalls(): Promise<Record<string, unknown>[]> {
  return stand
    .get()
    .app.evaluate(
      () => (globalThis as unknown as { __saveCalls?: Record<string, unknown>[] }).__saveCalls ?? []
    )
}

/** Лента текущей сессии — тексты ходов ищутся в ней, а не по всему окну: при
 *  плотности «Подробно» боковая панель повторяет последнее сообщение каждой
 *  сессии в строке-предпросмотре. */
function thread(page: Page): Locator {
  return page.locator('[data-slot="aui_thread-content"]:visible').first()
}

/** Число уведомлений на экране. */
function notificationCount(page: Page): Promise<number> {
  return page
    .getByRole('button', { name: /Dismiss notification|Закрыть уведомление/, includeHidden: true })
    .count()
}

// ───────────────── Блоки 8 и 25. Правка агента, снимки, откат ─────────────────

test('25.1.1 правка агента: под ответом карточка «N файлов изменено»', async () => {
  const page = await ui()
  mkdirSync(join(stand.get().projectDir, 'wiki'), { recursive: true })
  writeFileSync(join(stand.get().projectDir, EDITED_FILE), ORIGINAL_TEXT, 'utf8')

  await send(page, `edit: ${EDITED_FILE}`)
  await expect(thread(page).getByText(`Готово: файл ${EDITED_FILE} изменён.`)).toBeVisible({
    timeout: 30000
  })
  // Правка настоящая: первая строка файла на диске заменена.
  expect(projectFile(EDITED_FILE)).toBe(`${EDITED_LINE}\nвторая строка\n`)

  const card = page.locator('[data-slot="aui_changed-files"]')
  await expect(card).toBeVisible({ timeout: 15000 })
  await expect(card).toContainText(/1 файл изменён|1 file changed/)
  await expect(card).toContainText('zapiska.md')
  await expect(card.getByRole('button', { name: /^(Проверить|Review)/ })).toBeVisible()
})

test('25.2.1 «Проверить» в карточке открывает справа панель «Изменения»', async () => {
  const page = await ui()
  await expect(page.getByRole('tab', { name: /^(Изменения|Changes)/ })).toBeHidden()
  await page
    .locator('[data-slot="aui_changed-files"]')
    .getByRole('button', { name: /^(Проверить|Review)/ })
    .click()
  await expect(page.getByRole('tab', { name: /^(Изменения|Changes)/ })).toBeVisible({
    timeout: 30000
  })
  await expect(snapshotList(page)).toBeVisible({ timeout: 30000 })
  // Панель справа от ленты.
  const composer = (await page.getByRole('textbox', { name: /Message|Сообщение/ }).boundingBox())!
  const panel = (await snapshotList(page).boundingBox())!
  expect(panel.x).toBeGreaterThan(composer.x + composer.width - 1)
})

test('25.2.2 в списке есть строка со временем правки; ни хеша, ни git-кнопок', async () => {
  const page = await ui()
  await openChanges(page)
  await expect(freshSnapshotRow(page)).toBeVisible({ timeout: 15000 })
  // Свежий снимок — первым; старые (06.08.2026) — ниже.
  const rows = await snapshotList(page).getByRole('button').allInnerTexts()
  expect(recentLabels()).toContain(rows[0].trim())
  expect(rows.slice(1)).toContain('06.08.2026, 10:00')

  const text = await changesPanel(page).innerText()
  expect(text, 'хеш снимка на экране не показывается').not.toMatch(/\b[0-9a-f]{8,}\b/)
  for (const label of [/^Stage all$/, /^Commit$/, /^Push$/, /Create PR/, /Unstage/]) {
    await expect(page.getByRole('button', { name: label })).toHaveCount(0)
  }
})

test('8.1.1 снимок правки агента появился в списке', async () => {
  const page = await ui()
  await openChanges(page)
  await expect(freshSnapshotRow(page)).toBeVisible({ timeout: 15000 })
  test.info().annotations.push({
    type: 'evidence',
    description: `строка снимка: ${(await freshSnapshotRow(page).innerText()).trim()}`
  })
})

test('8.2.1 выбранный снимок: затронутый файл и построчная разница', async () => {
  const page = await ui()
  await openChanges(page)
  await freshSnapshotRow(page).click()
  const files = page.getByRole('list', { name: /^(Файлы снимка|Snapshot files)$/ })
  await expect(files).toBeVisible({ timeout: 30000 })
  await expect(files).toContainText(EDITED_FILE)
  await expect(page.getByText('-исходная строка')).toBeVisible()
  await expect(page.getByText(`+${EDITED_LINE}`)).toBeVisible()
})

test('25.3.1 убранное и добавленное показаны разным цветом', async () => {
  const page = await ui()
  await openChanges(page)
  const removed = page.getByText('-исходная строка')
  const added = page.getByText(`+${EDITED_LINE}`)
  await expect(removed).toBeVisible()
  const colorOf = (el: Locator): Promise<string> =>
    el.evaluate((node) => getComputedStyle(node).color)
  const [removedColor, addedColor, contextColor] = await Promise.all([
    colorOf(removed),
    colorOf(added),
    colorOf(page.getByText('@@ -1 +1 @@'))
  ])
  expect(removedColor).not.toBe(addedColor)
  expect(addedColor).not.toBe(contextColor)
  expect(removedColor).not.toBe(contextColor)
})

test('8.3.1 «Восстановить всё»: подтверждение называет, что перезапишется и что ход исчезнет', async () => {
  const page = await ui()
  await openChanges(page)
  await page.getByRole('button', { name: /^(Восстановить всё|Restore everything)$/ }).click()
  const confirm = page.getByRole('alertdialog')
  await expect(confirm).toBeVisible()
  const text = await confirm.innerText()
  expect(text).toMatch(/Все файлы будут перезаписаны состоянием на \d\d\.\d\d\.\d{4}, \d\d:\d\d/)
  expect(text).toContain('последний ход исчезнет из истории')
  expect(text).toContain('Текущее содержимое пропадёт')
})

test('8.3.2 подтверждение говорит, что файлы, созданные после снимка, не удаляются', async () => {
  const page = await ui()
  const text = await page.getByRole('alertdialog').innerText()
  expect(text).toMatch(/созданные ПОСЛЕ снимка.*не удаляются/s)
})

test('8.3.3 «Отмена» ничего не меняет', async () => {
  const page = await ui()
  const before = projectFile(EDITED_FILE)
  const restoresBefore = stand.get().mockOutput().split('MOCK_RESTORE').length
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: /^(Отмена|Cancel)$/ })
    .click()
  await expect(page.getByRole('alertdialog')).toBeHidden()
  await page.waitForTimeout(500)
  expect(projectFile(EDITED_FILE), 'файл на диске не тронут').toBe(before)
  expect(stand.get().mockOutput().split('MOCK_RESTORE').length, 'ядро не звали').toBe(
    restoresBefore
  )
  // Снимок и разница остались на экране.
  await expect(freshSnapshotRow(page)).toBeVisible()
  await expect(page.getByText(`+${EDITED_LINE}`)).toBeVisible()
})

test('25.4.1 «Восстановить файл»: подтверждение называет и файл, и время состояния', async () => {
  const page = await ui()
  await openChanges(page)
  await page
    .getByRole('list', { name: /^(Файлы снимка|Snapshot files)$/ })
    .getByRole('button', { name: /^(Восстановить файл|Restore file)$/ })
    .click()
  const confirm = page.getByRole('alertdialog')
  await expect(confirm).toBeVisible()
  const text = await confirm.innerText()
  expect(text).toContain(`Файл ${EDITED_FILE} будет перезаписан состоянием на `)
  const when = text.match(/состоянием на (\d\d\.\d\d\.\d{4}, \d\d:\d\d)/)?.[1]
  expect(recentLabels(), 'время в подтверждении — время снимка').toContain(when)
})

test('8.4.1 после подтверждения файл вернулся к состоянию из снимка', async () => {
  const page = await ui()
  expect(projectFile(EDITED_FILE)).not.toBe(ORIGINAL_TEXT)
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: /^(Восстановить|Restore)$/ })
    .click()
  await expect(page.getByText(`Файл ${EDITED_FILE} восстановлен.`)).toBeVisible({
    timeout: 30000
  })
  await stand.get().waitForMockLine(/MOCK_RESTORE .*"success": true/)
  expect(projectFile(EDITED_FILE)).toBe(ORIGINAL_TEXT)
})

test('25.4.2 файл на диске содержит прежний текст', async () => {
  await ui()
  expect(projectFile(EDITED_FILE)).toBe(ORIGINAL_TEXT)
  expect(projectFile(EDITED_FILE)).not.toContain(EDITED_LINE)
})

test('8.5.1 пустой список снимков: панель объясняет причину, а не показывает пустоту', async () => {
  // Ядро отвечает «снимки включены, снимков нет» — как бывает, когда оно
  // складывает их в другую папку. Список читается при открытии панели после
  // перезапуска (окно кэширует ответ).
  await mockControl('/api/_mock/rollback', { mode: 'empty' })
  await stand.get().relaunch()
  const page = await ui()
  await openChanges(page)
  await expect(snapshotList(page)).toHaveCount(0)

  // Либо объяснение охвата (папка, где ядро заводит снимки, — заголовок и
  // причина), либо честное «снимков нет — агент ничего не правил». Голого
  // пустого места нет: у панели есть текст, и он про снимки.
  const explanation = page.getByText(
    /Чекпойнты собираются не для этой папки|Снимки не создаются вообще|Снимки собираются на машине ядра|Охват снимков проверить не удалось|Снимков пока нет — агент ещё ничего не правил|Снимки собираются для корня проекта/
  )
  await expect(explanation.first()).toBeVisible({ timeout: 30000 })
  const text = await explanation.first().locator('xpath=..').innerText()
  expect(text.length).toBeGreaterThan(40)
  test.info().annotations.push({ type: 'evidence', description: `панель: ${text}` })
})

test('25.5.1 объяснение пустоты говорит ПОЧЕМУ: где ядро заводит снимки', async () => {
  const page = await ui()
  const explanation = page.getByText(
    /Чекпойнты собираются не для этой папки|Снимки не создаются вообще|Снимки собираются на машине ядра|Охват снимков проверить не удалось|Снимков пока нет — агент ещё ничего не правил|Снимки собираются для корня проекта/
  )
  const text = await explanation.first().locator('xpath=..').innerText()
  // Причина названа: папка-признак, домашняя директория, другая машина, или
  // «агент ничего не правил» — а не одно слово «пусто».
  expect(text).toMatch(
    /папк|домашняя директория|другой машине|не читается|агент ещё ничего не правил|полный/i
  )
  await mockControl('/api/_mock/rollback', { mode: 'normal' })
  await closeChanges(page)
})

// ───────────────── Блок 23. Список сессий ─────────────────

/** Ручка перетаскивания строки сессии — единственная её часть с точным
 *  именем `Reorder <заголовок>` (имена обёрток растут с плотностью: в них
 *  попадают модель, число сообщений и предпросмотр). */
function sessionHandle(page: Page, title: string): Locator {
  return page.getByRole('button', { name: `Reorder ${title}`, exact: true })
}

/** Обёртка строки сессии (её высота меняется с плотностью). */
function sessionRowShell(page: Page, title: string): Locator {
  return sessionHandle(page, title).locator('xpath=ancestor::*[contains(@class,"row-hover")][1]')
}

async function rowHeight(page: Page, title: string): Promise<number> {
  const shell = sessionRowShell(page, title)
  await expect(shell).toBeVisible({ timeout: 30000 })
  return (await shell.boundingBox())!.height
}

/** Экран настроек по адресу их маршрута. */
async function openSettings(page: Page, query: string): Promise<void> {
  await page.evaluate((hash) => {
    location.hash = hash
  }, `#/settings?${query}`)
  await expect(page.getByRole('button', { name: /Закрыть настройки|Close settings/ }))
    .toBeVisible({ timeout: 15000 })
    .catch(() => undefined)
}

async function closeSettings(page: Page): Promise<void> {
  await page.evaluate(() => {
    location.hash = '#/'
  })
  await expect(page.getByRole('textbox', { name: /Message|Сообщение/ })).toBeVisible({
    timeout: 30000
  })
}

async function pickDensity(page: Page, label: string): Promise<void> {
  await openSettings(page, 'tab=config:appearance&page=window-layout')
  const button = page.getByRole('button', { name: label, exact: true })
  await expect(button).toBeVisible({ timeout: 15000 })
  await button.click()
  await expect(button).toHaveAttribute('aria-pressed', 'true')
  await closeSettings(page)
}

let compactHeight = 0
let detailedHeight = 0

test('23.2.1 плотность списка сессий: строки стали компактнее/просторнее', async () => {
  const page = await ui()
  // Сессия «e2e» — строка, которая есть с самого начала.
  await pickDensity(page, 'Компактно')
  compactHeight = await rowHeight(page, 'e2e')
  await pickDensity(page, 'Подробно')
  detailedHeight = await rowHeight(page, 'e2e')
  expect(detailedHeight, `компактно ${compactHeight}, подробно ${detailedHeight}`).toBeGreaterThan(
    compactHeight + 8
  )
})

/** Открыть меню фильтра списка сессий и его подменю сортировки. */
async function openOrderingMenu(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: /^(Filters|Фильтры)$/ }).click()
  const ordering = page.getByRole('menuitem', { name: /^(Ordering|Сортировка)/ })
  await expect(ordering).toBeVisible()
  await ordering.click()
  const created = page.getByRole('menuitemradio', { name: /^(Created|Создано)/ })
  await expect(created).toBeVisible()
  return created
}

/** Порядок заголовков строк сессий сверху вниз — по кнопкам строк. Не по
 *  ручкам перетаскивания: с 0.21.5 при сортировке «Создано» строки не
 *  перетаскиваются, и ручек нет. Заголовок — первая строка текста кнопки
 *  (ниже в «Подробно» идут модель и превью). */
async function sessionOrder(page: Page): Promise<string[]> {
  // Только видимые: такие же кнопки строк есть и в скрытой панели «Боты».
  const rows = page.locator('button[data-slot="row-button"]:visible')
  await expect(rows.first()).toBeVisible({ timeout: 30000 })
  return rows.evaluateAll((els) =>
    els.map((el) => ((el as HTMLElement).innerText ?? '').split('\n')[0].trim())
  )
}

function indexOfRow(order: string[], title: string): number {
  return order.indexOf(title)
}

/** Сессия правки агента (первый тест файла) — ядро называет сессию первым
 *  ходом — и вторая сессия сегодняшнего дня. Строки-образцы заглушки
 *  («e2e», «Вчерашний разговор»…) в переключениях не участвуют: у них нет
 *  истории, и окно их не открывает. */
const FIRST_TITLE = `edit: ${EDITED_FILE}`
const SECOND_TITLE = 'say: сортировка'

/** Идентификатор сессии, в которую ушёл ход с таким текстом, — из журнала
 *  заглушки (`MOCK_RPC prompt.submit session_id='…' text='…'`). */
function sessionIdOfPrompt(text: string): string {
  const line = stand
    .get()
    .mockOutput()
    .split(/\r?\n/)
    .find(
      (candidate) => candidate.includes(`text='${text}'`) && candidate.includes('prompt.submit')
    )
  const id = line?.match(/session_id='([^']+)'/)?.[1]
  expect(id, `ход «${text}» в журнале заглушки`).toBeTruthy()
  return id!
}

test('23.1.1 сортировка Created меняет порядок, и он переживает перезапуск', async () => {
  let page = await ui()
  // Вторая сессия сегодняшнего дня: создана ПОЗЖЕ сессии правки, но
  // обновлена РАНЬШЕ (после неё в сессию правки уходит ещё один ход) — так
  // «Updated» и «Created» дают разный порядок внутри дня.
  await page
    .getByRole('button', { name: /^Новый сеанс/ })
    .first()
    .click()
  await send(page, SECOND_TITLE)
  await expect(thread(page).getByText('сортировка', { exact: true }).last()).toBeVisible({
    timeout: 30000
  })
  await sessionRowShell(page, FIRST_TITLE).click()
  await expect(thread(page).getByText(`Готово: файл ${EDITED_FILE} изменён.`)).toBeVisible({
    timeout: 30000
  })
  await send(page, 'say: ещё ход')
  await expect(thread(page).getByText('ещё ход', { exact: true }).last()).toBeVisible({
    timeout: 30000
  })

  let order = await sessionOrder(page)
  expect(indexOfRow(order, FIRST_TITLE), `порядок: ${order.join(' | ')}`).toBeGreaterThanOrEqual(0)
  expect(indexOfRow(order, SECOND_TITLE)).toBeGreaterThanOrEqual(0)
  expect(
    indexOfRow(order, FIRST_TITLE),
    'по умолчанию — по обновлению: сессия правки выше'
  ).toBeLessThan(indexOfRow(order, SECOND_TITLE))

  const created = await openOrderingMenu(page)
  await created.click()
  await page.keyboard.press('Escape')
  await expect
    .poll(
      async () => {
        order = await sessionOrder(page)
        return indexOfRow(order, SECOND_TITLE) < indexOfRow(order, FIRST_TITLE)
      },
      { message: `по созданию: «${SECOND_TITLE}» выше; порядок: ${order.join(' | ')}` }
    )
    .toBe(true)

  await stand.get().relaunch()
  page = await ui()
  await expect
    .poll(
      async () => {
        order = await sessionOrder(page)
        return indexOfRow(order, SECOND_TITLE) < indexOfRow(order, FIRST_TITLE)
      },
      { message: `после перезапуска: ${order.join(' | ')}`, timeout: 30000 }
    )
    .toBe(true)
  const createdAfter = await openOrderingMenu(page)
  await expect(createdAfter).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Escape')
})

test('23.2.1 плотность списка сессий пережила перезапуск', async () => {
  const page = await ui()
  const height = await rowHeight(page, 'e2e')
  expect(Math.abs(height - detailedHeight), `было ${detailedHeight}, стало ${height}`).toBeLessThan(
    3
  )
  await openSettings(page, 'tab=config:appearance&page=window-layout')
  await expect(page.getByRole('button', { name: 'Подробно', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await closeSettings(page)
})

test('23.3.1 ссылка на другую сессию в переписке открывает ту сессию', async () => {
  const page = await ui()
  // Внешний браузер закрыт заглушкой со счётчиком: ссылка на сессию — не
  // адрес в интернете.
  await stand.get().app.evaluate(({ shell }) => {
    const bag = globalThis as unknown as { __externalOpens?: number }
    bag.__externalOpens = 0
    shell.openExternal = (async () => {
      bag.__externalOpens = (bag.__externalOpens ?? 0) + 1
    }) as never
  })
  await sessionRowShell(page, SECOND_TITLE).click()
  await expect(thread(page).getByText('сортировка', { exact: true }).last()).toBeVisible({
    timeout: 30000
  })
  await expect(thread(page).getByText('ещё ход', { exact: true })).toHaveCount(0)

  const target = sessionIdOfPrompt(`edit: ${EDITED_FILE}`)
  await send(page, `say: см. @session:${target}`)
  const link = page.locator('a.ref[data-ref="session"]').last()
  await expect(link).toBeVisible({ timeout: 30000 })
  await link.click()

  // Открылась именно та сессия: её ход на экране, а не пустой экран.
  await expect(thread(page).getByText('ещё ход', { exact: true }).last()).toBeVisible({
    timeout: 30000
  })
  const opens = await stand
    .get()
    .app.evaluate(() => (globalThis as unknown as { __externalOpens?: number }).__externalOpens)
  expect(opens, 'внешний браузер не открывался').toBe(0)
})

// ───────────────── Блок 24. Композер: диалог папки ─────────────────

/** Подменить диалог выбора В ГЛАВНОМ ПРОЦЕССЕ и запомнить, о чём его просили. */
async function stubPicker(result: { canceled: boolean; filePaths: string[] }): Promise<void> {
  await stand.get().app.evaluate(({ dialog }, canned) => {
    const bag = globalThis as unknown as { __pickCalls?: unknown[] }
    bag.__pickCalls = []
    dialog.showOpenDialog = (async (first: unknown, second?: unknown) => {
      bag.__pickCalls?.push(second === undefined ? first : second)
      return canned
    }) as never
  }, result)
}

async function lastPickCall(): Promise<Record<string, unknown> | null> {
  return stand.get().app.evaluate(() => {
    const bag = globalThis as unknown as { __pickCalls?: Record<string, unknown>[] }
    return bag.__pickCalls?.[bag.__pickCalls.length - 1] ?? null
  })
}

async function pickFolder(page: Page): Promise<void> {
  await clearNotifications(page)
  await page.getByRole('button', { name: /Add context|Добавить контекст/i }).click()
  await page.getByRole('menuitem', { name: /^(Folder|Папка)/ }).click()
}

test('24.1.1 «+» → Папка: у диалога спрошена ПАПКА, а не файлы', async () => {
  const page = await ui()
  await stubPicker({ canceled: false, filePaths: [stand.get().projectDir] })
  await pickFolder(page)
  await expect
    .poll(async () => (await lastPickCall())?.properties, { timeout: 15000 })
    .toEqual(expect.arrayContaining(['openDirectory']))
  expect((await lastPickCall())?.properties).not.toContain('openFile')
  await expect(page.locator('[data-slot="composer-attachments"]')).toContainText(/aecpilot-e2e/, {
    timeout: 15000
  })
})

test('24.1.2 список папок не отфильтрован по расширениям', async () => {
  await ui()
  const call = await lastPickCall()
  expect(call, 'диалог был вызван').not.toBeNull()
  expect(call?.filters ?? [], 'к выбору папки фильтры не применяются').toEqual([])
})

test('24.1.3 «Отмена» закрывает окно, в композере ничего не появилось', async () => {
  const page = await ui()
  const attachments = page.locator('[data-slot="composer-attachments"]')
  const before = await attachments.innerText()
  await stubPicker({ canceled: true, filePaths: [] })
  await pickFolder(page)
  await page.waitForTimeout(1000)
  expect(await attachments.innerText()).toBe(before)
  expect(await notificationCount(page), 'отказ — не ошибка').toBe(0)
  // Убрать папку из контекста, чтобы следующие ходы шли без неё.
  await attachments
    .getByRole('button', { name: /^(Удалить|Remove)/ })
    .first()
    .click()
    .catch(() => undefined)
})

// ───────────────── Блок 26. Сохранение наружу ─────────────────

/** Кнопка-вложение картинки в композере. */
function imageAttachment(page: Page): Locator {
  return page
    .locator('[data-slot="composer-attachments"]')
    .getByRole('button', { name: /^(Предпросмотр|Preview) .*\.png$/ })
}

test('26.1.1 картинка из буфера обмена по Ctrl+V становится вложением', async () => {
  const page = await ui()
  await clearNotifications(page)
  const composer = await reviveStrandedSession(page)
  await composer.click()

  // Буфер обмена Windows у процессов, запущенных из-под агента, бывает
  // недоступен (OpenClipboard → ERROR_ACCESS_DENIED, замер 20.09.2026). Тогда
  // вставка проигрывается событием `paste` с теми же байтами — их обработчик
  // один и тот же; о пути сказано в аннотации.
  const clipboardWorks = await stand.get().app.evaluate(({ clipboard, nativeImage }, png) => {
    try {
      clipboard.writeImage(nativeImage.createFromDataURL(`data:image/png;base64,${png}`))
      return !clipboard.readImage().isEmpty()
    } catch {
      return false
    }
  }, PNG)
  if (clipboardWorks) {
    await page.keyboard.press('Control+v')
  } else {
    await composer.evaluate((el, png) => {
      const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0))
      const file = new File([bytes], 'clip.png', { type: 'image/png' })
      const data = new DataTransfer()
      data.items.add(file)
      el.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
      )
    }, PNG)
  }
  test.info().annotations.push({
    type: 'note',
    description: clipboardWorks
      ? 'вставка настоящим Ctrl+V из буфера обмена'
      : 'буфер обмена недоступен процессу — вставка проиграна событием paste с теми же байтами'
  })

  await expect(imageAttachment(page)).toBeVisible({ timeout: 30000 })
  await expect(
    page.locator('[data-slot="composer-attachments"] img'),
    'у вложения есть миниатюра'
  ).toBeVisible({ timeout: 15000 })
  expect(
    await page.getByText(/нет картинки|no image/i).count(),
    'уведомления «в буфере нет картинки» нет'
  ).toBe(0)
})

test('26.2.1 лупа вложения: кнопка сохранения открывает диалог сохранения', async () => {
  const page = await ui()
  await clearNotifications(page)
  await stubSaveDialog(join(outsideDir, 'saved-image.png'))
  await imageAttachment(page).click()
  const lightbox = page.getByRole('dialog').last()
  await expect(lightbox.locator('img')).toBeVisible({ timeout: 15000 })
  await lightbox.getByRole('button', { name: /Скачать изображение|Download image/ }).click()
  await expect.poll(async () => (await saveDialogCalls()).length, { timeout: 15000 }).toBe(1)
})

test('26.2.2 в поле имени уже стоит `image.png`', async () => {
  await mainWindow(stand.get())
  const [call] = await saveDialogCalls()
  expect(call.defaultPath).toBe('image.png')
})

test('26.3.1 сохранённый файл — та самая картинка', async () => {
  const page = await mainWindow(stand.get())
  await expect(page.getByText(/Изображение сохранено|Image saved/)).toBeVisible({
    timeout: 15000
  })
  const saved = join(outsideDir, 'saved-image.png')
  await expect.poll(() => existsSync(saved)).toBe(true)
  const bytes = readFileSync(saved)
  expect(bytes.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  )
  expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], 'IHDR: 64×64').toEqual([64, 64])
  // «Показывает то, что копировали»: картинка по пути к лупе перекодируется
  // (миниатюра вложения), байты не те же — сверяется содержимое: оба файла
  // декодируются, и пиксели сохранённого совпадают с пикселями вставленного.
  const pixels = await stand.get().app.evaluate(
    ({ nativeImage }, { path, png }) => {
      const decode = (image: Electron.NativeImage): { size: Electron.Size; px: number[] } => {
        const bitmap = image.toBitmap()
        const size = image.getSize()
        const px: number[] = []
        for (const [x, y] of [
          [0, 0],
          [size.width >> 1, size.height >> 1],
          [size.width - 1, size.height - 1]
        ]) {
          const at = (y * size.width + x) * 4
          px.push(bitmap[at], bitmap[at + 1], bitmap[at + 2], bitmap[at + 3])
        }
        return { size, px }
      }
      return {
        saved: decode(nativeImage.createFromPath(path)),
        pasted: decode(nativeImage.createFromDataURL(`data:image/png;base64,${png}`))
      }
    },
    { path: saved, png: PNG }
  )
  expect(pixels.saved.size).toEqual(pixels.pasted.size)
  expect(pixels.saved.px).toEqual(pixels.pasted.px)
})

test('26.4.1 отмена диалога сохранения молчит: ни «сохранено», ни «ошибка»', async () => {
  const page = await mainWindow(stand.get())
  // Лупа закрывается, уведомления прошлого шага снимаются — чтобы «нет
  // уведомлений» ниже было про этот шаг, а не про предыдущий.
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await clearNotifications(page)
  await expect.poll(() => notificationCount(page)).toBe(0)

  await stubSaveDialog(null)
  await imageAttachment(page).click()
  const lightbox = page.getByRole('dialog').last()
  await expect(lightbox.locator('img')).toBeVisible({ timeout: 15000 })
  await lightbox.getByRole('button', { name: /Скачать изображение|Download image/ }).click()
  await expect.poll(async () => (await saveDialogCalls()).length).toBe(1)
  await page.waitForTimeout(1500)
  expect(await notificationCount(page), 'уведомлений нет').toBe(0)
  await page.keyboard.press('Escape')
  await expect(lightbox).toBeHidden()
  // Вложение больше не нужно.
  await page
    .locator('[data-slot="composer-attachments"]')
    .getByRole('button', { name: /^(Удалить|Remove)/ })
    .first()
    .click()
    .catch(() => undefined)
})

test('26.5.1 файл, созданный агентом, есть на диске в папке проекта', async () => {
  const page = await ui()
  const relPath = 'otchet.md'
  expect(existsSync(join(stand.get().projectDir, relPath))).toBe(false)
  await send(page, `edit: ${relPath}`)
  await expect(thread(page).getByText(`Готово: файл ${relPath} изменён.`)).toBeVisible({
    timeout: 30000
  })
  await expect.poll(() => existsSync(join(stand.get().projectDir, relPath))).toBe(true)
  expect(projectFile(relPath)).toContain(EDITED_LINE)
  await expect(page.locator('[data-slot="aui_changed-files"]').last()).toContainText(relPath)
})

test('26.6.1 экспорт профиля из палитры открывает диалог сохранения', async () => {
  const page = await ui()
  await clearNotifications(page)
  await stubSaveDialog(join(outsideDir, 'default.tar.gz'))
  await page.keyboard.press('Control+k')
  const palette = page.getByRole('dialog').last()
  await expect(palette).toBeVisible()
  await page.keyboard.type('Export profile')
  const option = palette.getByRole('option', { name: /Export profile|Экспортировать профиль/ })
  await expect(option).toBeVisible()
  // С 0.21.5 палитра ищет и по полям настроек, и первым может встать не этот
  // пункт — доводим выбор стрелкой, как с клавиатуры (мышь перехватывает
  // корень палитры).
  for (
    let step = 0;
    step < 15 && (await option.getAttribute('aria-selected')) !== 'true';
    step += 1
  ) {
    await page.keyboard.press('ArrowDown')
  }
  await expect(option).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Enter')
  await expect.poll(async () => (await saveDialogCalls()).length, { timeout: 15000 }).toBe(1)
})

test('26.6.2 имя по умолчанию — `<имя профиля>.tar.gz`', async () => {
  await ui()
  const [call] = await saveDialogCalls()
  expect(call.defaultPath).toBe('default.tar.gz')
  expect(JSON.stringify(call.filters ?? [])).toContain('tar.gz')
})

test('26.6.3 уведомление с путём, и архив лежит на диске', async () => {
  const page = await ui()
  const archive = join(outsideDir, 'default.tar.gz')
  await expect(page.getByText(/Профиль экспортирован|Profile exported/)).toBeVisible({
    timeout: 30000
  })
  await expect(page.getByText(archive)).toBeVisible()
  await expect.poll(() => existsSync(archive)).toBe(true)
  const head = readFileSync(archive).subarray(0, 2)
  expect([head[0], head[1]], 'gzip').toEqual([0x1f, 0x8b])
  await stand.get().waitForMockLine(/MOCK_REST_POST \/api\/profiles\/default\/export/)
})

// ───────────────── Блок 28. Журнал приложения ─────────────────

let logDir = ''

test('28.1.1 «Настройки → Шлюзы → Открыть логи» открывает папку журнала', async () => {
  const page = await ui()
  logDir = await stand.get().app.evaluate(({ app }) => app.getPath('logs'))
  // Проводник подменён (тест не оставляет окон на экране) и ВОЗВРАЩЁН ниже.
  await stand.get().app.evaluate(({ shell }) => {
    const slot = globalThis as unknown as { openedPath?: string; realOpenPath?: unknown }
    slot.openedPath = ''
    slot.realOpenPath = shell.openPath
    shell.openPath = (async (target: string) => {
      ;(globalThis as unknown as { openedPath?: string }).openedPath = target
      return ''
    }) as never
  })
  await openSettings(page, 'tab=gateway')
  await page.getByRole('button', { name: /^(Открыть логи|Open logs)$/ }).click()
  await expect
    .poll(
      () =>
        stand
          .get()
          .app.evaluate(() => (globalThis as unknown as { openedPath?: string }).openedPath),
      { timeout: 15000 }
    )
    .toBe(logDir)
  const restored = await stand.get().app.evaluate(({ shell }) => {
    const slot = globalThis as unknown as { realOpenPath?: unknown }
    if (typeof slot.realOpenPath !== 'function') return false
    shell.openPath = slot.realOpenPath as never
    return shell.openPath === slot.realOpenPath
  })
  expect(restored).toBe(true)
  await closeSettings(page)
})

test('28.1.2 в папке лежит `desktop.log`', async () => {
  await ui()
  expect(existsSync(join(logDir, 'desktop.log'))).toBe(true)
})

const LOG_LINE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z (LOG|WARN|ERROR)\s+\S/

test('28.2.1 в журнале строки за этот запуск — время, уровень, текст; настоящего token= нет', async () => {
  await ui()
  const lines = readFileSync(join(logDir, 'desktop.log'), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
  expect(lines.length).toBeGreaterThan(0)
  const recent = lines.filter((line) => {
    const at = Date.parse(line.slice(0, 24))
    return LOG_LINE.test(line) && Date.now() - at < 15 * 60 * 1000
  })
  expect(recent.length, 'строки за этот запуск').toBeGreaterThan(0)
  for (const line of lines) {
    const tokens = line.match(/token=[^\s&*]+/g) ?? []
    expect(tokens, `токен в журнале: ${line}`).toEqual([])
  }
})

test('28.3.1 журнал вырос, но читается: одна запись — одна строка', async () => {
  await ui()
  const lines = readFileSync(join(logDir, 'desktop.log'), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
  const stray = lines.filter((line) => !LOG_LINE.test(line))
  expect(stray, 'каждая строка начинается со времени и уровня').toEqual([])
})
