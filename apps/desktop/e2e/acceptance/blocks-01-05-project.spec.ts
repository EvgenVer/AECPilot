// Блоки 1–5 чек-листа (задача 3F.3): гейт проекта, меню проекта, проводник
// vault, источники, детект изменений — 32 позиции. Всё это НАШИ поверхности:
// главный процесс, `renderer/src/aec/**`, наш индексер (`aec-rag scan` ходит
// мимо шлюза), поэтому стенд на моке — живое ядро здесь ничего не решает.
//
// Имя теста начинается с номера позиции (`3.5.2 …`) — по нему сходятся
// чек-лист, отчёт приёмки и счётчик покрытия (`runtime/checklist-coverage.mjs`).
//
// Порядок тестов — зависимость, а не удобство: блок 1 проверяет приложение БЕЗ
// открытого проекта, и только он вправе его открыть. Файл идёт одним воркером
// сверху вниз (так же устроен smoke).

import { expect, test, type Page } from '@playwright/test'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import {
  appWindows,
  clearNotifications,
  hideFirstRunSurfaces,
  mainWindow,
  standFixture
} from '../lib/app'
import { makeSampleVault, SAMPLE, type SampleVault } from '../lib/vault'

// Последовательно и с остановкой на первом падении. Иначе Playwright после
// КАЖДОГО падения поднимает воркер заново (память e2e-failures-inflate), а с ним
// — новый стенд, новую временную папку проекта и пустой список источников: одно
// настоящее расхождение превращалось в тридцать ложных красных (замерено
// 17.09.2026, первый прогон этого файла).
test.describe.configure({ mode: 'serial' })

const stand = standFixture({ mode: 'mock', label: 'blocks-01-05' })

let sample: SampleVault
/** Текст уведомления о скане, снятый в 5.1.1: info-тост гаснет сам через 5 с,
 *  а позиция 5.1.2 спрашивает про ТО ЖЕ уведомление. */
let scanToast = ''

const PROJECT_NAME = 'Приёмка'
const SECOND_NAME = 'Второй'
const ONE_DRIVE = 'OneDrive - Проектная организация'

test.beforeAll(async () => {
  sample = await makeSampleVault()
  // Папка проекта — та, о которой стенд уже сказал моку (иначе их боковая
  // панель ищет сессии другого каталога). Кладём в неё содержимое образца:
  // позиция 1.2.1 требует НЕПУСТУЮ папку.
  cpSync(sample.vault, stand.get().projectDir, { recursive: true })
})

test.afterAll(() => {
  if (sample) rmSync(sample.root, { force: true, recursive: true })
})

/** Главное окно с убранными поверхностями первого запуска.
 *
 *  `needsProject` — открыть проект, если приложение его не помнит. Это не часть
 *  проверок, а восстановление после перезапуска: дефект D-89 (замер 17.09.2026)
 *  в том, что открытый проект не переживает закрытие приложения. Блок 1 проверяет
 *  сам гейт и зовёт это с `false`. */
async function ui(needsProject = true): Promise<Page> {
  const page = await mainWindow(stand.get())
  await hideFirstRunSurfaces(page)
  if (!needsProject) return page

  const open = await page.evaluate(() => window.aecpilot.getCurrentProject())
  if (!open) {
    const result = await page.evaluate(
      (dir) => window.aecpilot.openProject(dir),
      stand.get().projectDir
    )
    expect(result, `openProject: ${JSON.stringify(result)}`).toMatchObject({ ok: true })
  }
  await expect(page.getByRole('textbox', { name: /Message|Сообщение/ })).toBeVisible({
    timeout: 60000
  })
  // Проводник и источники живут во вкладке «Vault» левой колонки (их панель
  // `aec-explorer`), а по умолчанию выбрана вкладка сессий — как у человека.
  const vaultTab = page.getByRole('tab', { name: /Vault/ })
  await expect(vaultTab).toBeVisible({ timeout: 30000 })
  if ((await vaultTab.getAttribute('aria-selected')) !== 'true') await vaultTab.click()
  return page
}

/** Строка дерева (vault, источника или сам источник) по её `title` — это путь
 *  узла, и он уникален. Возвращается КОНТЕЙНЕР строки: кнопки действий спрятаны
 *  до наведения и живут в нём же. */
/** Значение атрибута в CSS-селекторе: в `title` источника стоит путь Windows с
 *  обратными косыми, и без экранирования селектор его не находит. */
function attr(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function row(page: Page, title: string) {
  return page.locator('div.group').filter({ has: page.locator(`[title=${attr(title)}]`) })
}

/** Клик по САМОЙ записи строки (кнопка с `title`), а не по её контейнеру: при
 *  наведении в контейнере проявляются кнопки действий, и клик «в центр строки»
 *  попадал в «Новый файл» (замер 18.09.2026, позиция 3.6.1). */
function clickEntry(page: Page, title: string) {
  return row(page, title)
    .locator(`[title=${attr(title)}]`)
    .click()
}

/** Снимок дерева папки: путь → размер. Чем доказывается «ни один файл не
 *  тронут» — не глазами на два-три файла, как в чек-листе, а целиком. */
function treeSnapshot(dir: string, prefix = ''): Map<string, number> {
  const out = new Map<string, number>()
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      for (const [key, value] of treeSnapshot(join(dir, entry.name), rel)) out.set(key, value)
    } else {
      out.set(rel, statSync(join(dir, entry.name)).size)
    }
  }
  return out
}

/** Человек «указал» эту папку в системном диалоге. Щёлкнуть в нём тест не может,
 *  поэтому встаёт ровно туда, где решение принимает человек (приём из smoke). */
async function pickFolder(dir: string): Promise<void> {
  await stand.get().app.evaluate(({ dialog }, target) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [target] })) as never
  }, dir)
}

/** Ответ на `window.confirm` / `window.prompt`: они платформенные, и Playwright
 *  видит их как `dialog`. Возвращает, о чём спросили. */
function nextDialog(page: Page, action: 'accept' | 'dismiss', answer = ''): Promise<string> {
  return new Promise((resolve) => {
    page.once('dialog', async (dialog) => {
      const message = dialog.message()
      if (action === 'accept') await dialog.accept(answer)
      else await dialog.dismiss()
      resolve(message)
    })
  })
}

/** Ответить окну «как назвать?» проводника (`NamePrompt`, дефект D-90: своё
 *  окно вместо `window.prompt`, которого в Electron нет). Возвращает вопрос. */
async function answerName(page: Page, name: string): Promise<string> {
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible({ timeout: 30000 })
  const asked = (await dialog.getAttribute('aria-label')) ?? ''
  await dialog.getByRole('textbox').fill(name)
  await dialog.getByRole('button', { name: /^(OK|ОК)$/ }).click()
  await expect(dialog).toHaveCount(0)
  return asked
}

/** Отключить источник той же кнопкой, что человек, с подтверждением. Мост
 *  (`removeSource`) для этого не годится: панель не узнала бы об удалении. */
async function disconnect(page: Page, rootPath: string): Promise<void> {
  const asked = nextDialog(page, 'accept')
  await row(page, rootPath).hover()
  await row(page, rootPath)
    .getByRole('button', { name: /^(Disconnect|Отключить)$/ })
    .click()
  expect(await asked).toMatch(/Отключить этот источник|Disconnect this source/)
  await expect(row(page, rootPath)).toHaveCount(0, { timeout: 30000 })
}

/** Перехватить «показать в проводнике»: настоящий проводник остался бы открытым
 *  окном на машине. Перехватывается ровно тот вызов Electron, которым это
 *  делается, — проверяем, что зовут и с чем. */
async function watchReveal(): Promise<void> {
  await stand.get().app.evaluate(({ shell }) => {
    const store = globalThis as unknown as { __revealed?: string[] }
    store.__revealed = []
    shell.showItemInFolder = ((item: string) => store.__revealed?.push(item)) as never
  })
}

function revealed(): Promise<string[]> {
  return stand
    .get()
    .app.evaluate(() => (globalThis as unknown as { __revealed?: string[] }).__revealed ?? [])
}

/** Запустить скан и дождаться его отчёта (или `null`, если не дождались). */
function scanOnce(page: Page): Promise<unknown> {
  return page.evaluate(async () => {
    const report = new Promise<unknown>((resolve) => {
      const off = window.aecpilot.onScanReport((envelope) => {
        off()
        resolve(envelope)
      })
      setTimeout(() => {
        off()
        resolve(null)
      }, 180000)
    })
    await window.aecpilot.triggerScan()
    return report
  })
}

// ── Блок 1. Гейт проекта ────────────────────────────────────────────────────

test('1.1.1 видно наш экран выбора проекта, а не их чат', async () => {
  const page = await ui(false)
  await expect(page.getByRole('button', { name: /New project|Создать проект/ })).toBeVisible({
    timeout: 60000
  })
  // Их композер за гейтом не поднят вовсе: приложение агента начинается с
  // открытого проекта, и это главное обещание блока.
  await expect(page.getByRole('textbox', { name: /Message|Сообщение/ })).toHaveCount(0)
})

test('1.1.2 заголовок «AECPilot» и строка про IDE для проектной документации', async () => {
  const page = await ui(false)
  await expect(page.getByText('AECPilot', { exact: true })).toBeVisible()
  await expect(
    page.getByText(/IDE для проектной документации|An IDE for project documentation/)
  ).toBeVisible()
})

test('1.2.1 проект создан в НЕПУСТОЙ папке, и ни один файл не тронут', async () => {
  const page = await ui(false)
  const projectDir = stand.get().projectDir
  const before = treeSnapshot(projectDir)
  expect(before.size, 'папка проекта должна быть непустой').toBeGreaterThan(0)

  await pickFolder(projectDir)
  await page.getByRole('button', { name: /New project|Создать проект/ }).click()
  const dialog = page.getByRole('dialog', { name: /New project|Создать проект/ })
  await expect(dialog).toBeVisible()
  await dialog.locator('input[type="text"]').fill(PROJECT_NAME)
  await dialog.getByRole('button', { name: /Choose folder|Выбрать папку/ }).click()
  await expect(dialog.getByText(projectDir, { exact: false })).toBeVisible()
  await dialog.getByRole('button', { name: /^(Create|Создать)$/ }).click()
  await expect(dialog).toHaveCount(0, { timeout: 60000 })

  const after = treeSnapshot(projectDir)
  for (const [path, size] of before) {
    expect(after.get(path), `файл ${path} пропал или изменился`).toBe(size)
  }
})

test('1.2.2 приложение переключилось на интерфейс агента', async () => {
  const page = await ui()
  await expect(page.getByRole('textbox', { name: /Message|Сообщение/ })).toBeVisible({
    timeout: 60000
  })
  await expect(page.getByRole('button', { name: /New project|Создать проект/ })).toHaveCount(0)
})

test('1.3.1 после перезапуска сразу интерфейс агента, без мелькания гейта', async () => {
  // D-89 (задача 3G.20): последний проект открывается при запуске сам, до первого
  // окна (`restore-project.ts`). До починки тест стоял ожидаемо красным.
  await stand.get().relaunch()
  const page = await mainWindow(stand.get())

  // «Без мелькания» — утверждение о том, чего НЕ было на экране, и проверить его
  // можно только наблюдением с самого начала: наблюдатель ставится сразу, как
  // окно отдало контекст (мост уже есть, React ещё не смонтирован), а спрашивают
  // его потом — появлялся ли экран выбора хоть на кадр.
  await page.evaluate(() => {
    const store = window as unknown as { __gateFlash?: boolean }
    store.__gateFlash = false
    const gate = /IDE для проектной документации|An IDE for project documentation/
    const look = (): void => {
      if (gate.test(document.body?.innerText ?? '')) store.__gateFlash = true
    }
    look()
    new MutationObserver(look).observe(document.documentElement, {
      childList: true,
      subtree: true
    })
  })

  await hideFirstRunSurfaces(page)
  await expect(page.getByRole('textbox', { name: /Message|Сообщение/ })).toBeVisible({
    timeout: 20000
  })
  const flashed = await page.evaluate(
    () => (window as unknown as { __gateFlash?: boolean }).__gateFlash === true
  )
  expect(flashed, 'экран выбора проекта мелькнул перед интерфейсом агента').toBe(false)
})

test('1.4.1 «Открыть проект» на папке без .aecpilot даёт диалог создания', async () => {
  const page = await ui()
  await pickFolder(sample.sourceB)
  await page
    .getByRole('button', { name: new RegExp(PROJECT_NAME) })
    .first()
    .click()
  await page.getByRole('menuitem', { name: /Open project|Открыть проект/ }).click()

  // Не ошибка, а предложение завести проект здесь же — с подставленными папкой
  // и именем (именем самой папки).
  const dialog = page.getByRole('dialog', { name: /Initialize project|Инициализировать проект/ })
  await expect(dialog).toBeVisible({ timeout: 30000 })
  await expect(dialog.locator('input[type="text"]')).toHaveValue('source-b')
  await expect(dialog.getByText(sample.sourceB, { exact: false })).toBeVisible()
  await dialog.getByRole('button', { name: /^(Close|Закрыть)$/ }).click()
  await expect(dialog).toHaveCount(0)
})

// ── Блок 2. Меню проекта ────────────────────────────────────────────────────

test('2.1.1 имя проекта видно в статус-баре без наведения и клика', async () => {
  const page = await ui()
  await expect(page.getByRole('button', { name: new RegExp(PROJECT_NAME) }).first()).toBeVisible({
    timeout: 30000
  })
})

test('2.2.1 меню несёт путь, «создать», «открыть» и недавние без текущего', async () => {
  const page = await ui()
  await page
    .getByRole('button', { name: new RegExp(PROJECT_NAME) })
    .first()
    .click()
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()
  await expect(menu.getByText(stand.get().projectDir, { exact: false })).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: /New project|Создать проект/ })).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: /Open project|Открыть проект/ })).toBeVisible()
  // Текущего проекта среди недавних нет — он и так открыт.
  await expect(menu.getByRole('menuitem', { name: new RegExp(`^${PROJECT_NAME}$`) })).toHaveCount(0)
  await page.keyboard.press('Escape')
})

test('2.3.1 переключение на другой проект перерисовывает имя и дерево', async () => {
  const page = await ui()
  // Подготовка: второй проект, чтобы было на что переключаться. Сам переход —
  // через меню недавних, как его делает человек.
  const second = join(sample.root, 'второй-проект')
  mkdirSync(second, { recursive: true })
  writeFileSync(join(second, 'метка-второго.md'), '# второй\n', 'utf-8')
  // Заводится он через тот же диалог, что у человека, а не вызовом моста:
  // главный процесс принимает ТОЛЬКО папку, выбранную в системном диалоге
  // (охранник задачи 4D-11), и правильно делает — окно не вправе назвать путь.
  await pickFolder(second)
  await page
    .getByRole('button', { name: new RegExp(PROJECT_NAME) })
    .first()
    .click()
  await page.getByRole('menuitem', { name: /New project|Создать проект/ }).click()
  const dialog = page.getByRole('dialog', { name: /New project|Создать проект/ })
  await expect(dialog).toBeVisible()
  await dialog.locator('input[type="text"]').fill(SECOND_NAME)
  await dialog.getByRole('button', { name: /Choose folder|Выбрать папку/ }).click()
  await dialog.getByRole('button', { name: /^(Create|Создать)$/ }).click()
  await expect(dialog).toHaveCount(0, { timeout: 60000 })

  await expect(page.getByRole('button', { name: new RegExp(SECOND_NAME) }).first()).toBeVisible({
    timeout: 30000
  })
  await expect(page.getByText('метка-второго.md')).toBeVisible({ timeout: 30000 })

  await page
    .getByRole('button', { name: new RegExp(SECOND_NAME) })
    .first()
    .click()
  await page.getByRole('menuitem', { name: new RegExp(`^${PROJECT_NAME}$`) }).click()

  await expect(page.getByRole('button', { name: new RegExp(PROJECT_NAME) }).first()).toBeVisible({
    timeout: 30000
  })
  // Дерево перерисовалось под открытый проект: файла второго больше нет, есть
  // папка первого. Список сессий на моке от проекта не зависит — он проверяется
  // на живом ядре (блок 6).
  await expect(page.getByText('метка-второго.md')).toHaveCount(0)
  await expect(row(page, 'notes')).toBeVisible({ timeout: 30000 })
})

// ── Блок 3. Проводник vault ─────────────────────────────────────────────────

test('3.1.1 при старте все папки дерева закрыты', async () => {
  await stand.get().relaunch()
  const page = await ui()
  // Папка `notes` есть, а файла внутри неё не видно — значит, закрыта.
  await expect(row(page, 'notes')).toBeVisible({ timeout: 60000 })
  await expect(row(page, `notes/${SAMPLE.notes}`)).toHaveCount(0)
})

test('3.1.2 `.aecpilot` в дереве не показывается', async () => {
  const page = await ui()
  expect(existsSync(join(stand.get().projectDir, '.aecpilot')), 'папка .aecpilot должна быть').toBe(
    true
  )
  await expect(page.getByText('.aecpilot', { exact: true })).toHaveCount(0)
})

test('3.2.1 перед удалением спрашивают подтверждение', async () => {
  const page = await ui()
  const victim = 'на-удаление.md'
  writeFileSync(join(stand.get().projectDir, victim), 'мусор\n', 'utf-8')
  await page
    .getByRole('button', { name: /^(Refresh|Обновить)$/ })
    .first()
    .click()
  await expect(row(page, victim)).toBeVisible({ timeout: 30000 })

  const asked = nextDialog(page, 'dismiss')
  await row(page, victim).hover()
  await row(page, victim)
    .getByRole('button', { name: /^(Delete|Удалить)$/ })
    .click()
  expect(await asked).toMatch(/Удалить эту запись|Delete this entry/)
  // Отказ — файл на месте.
  expect(existsSync(join(stand.get().projectDir, victim))).toBe(true)
})

test('3.2.2 после операции дерево обновилось само', async () => {
  const page = await ui()
  const name = 'создан-из-ui.md'
  await page
    .getByRole('button', { name: /^(New file|Новый файл)$/ })
    .first()
    .click()
  expect(await answerName(page, name)).toMatch(/Имя файла|File name/)
  // Ни одного «обновить» руками: строка появилась сама.
  await expect(row(page, name)).toBeVisible({ timeout: 30000 })
  expect(existsSync(join(stand.get().projectDir, name))).toBe(true)
})

test('3.2.3 неудавшаяся операция объясняет причину на панели', async () => {
  const page = await ui()
  // Имя, которого файловая система не примет: отказ обязан стать текстом, а не
  // тишиной. Двоеточие — запрещённый символ пути в Windows.
  await page
    .getByRole('button', { name: /^(New file|Новый файл)$/ })
    .first()
    .click()
  await answerName(page, 'нельзя:так.md')
  await expect(page.getByText(/Имя содержит запрещённые символы/)).toBeVisible({ timeout: 30000 })
})

test('3.3.1 правый клик даёт те же действия плюс «Показать в проводнике»', async () => {
  const page = await ui()
  await row(page, 'notes').click({ button: 'right' })
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()
  for (const name of [
    /^(New file|Новый файл)$/,
    /^(New folder|Новая папка)$/,
    /^(Rename|Переименовать)$/,
    /^(Delete|Удалить)$/,
    /^(Show in Explorer|Показать в проводнике)$/
  ]) {
    await expect(menu.getByRole('menuitem', { name })).toBeVisible()
  }
  await page.keyboard.press('Escape')
})

test('3.4.1 Del на выделенной строке тоже спрашивает подтверждение', async () => {
  const page = await ui()
  const victim = 'на-удаление.md'
  await expect(row(page, victim)).toBeVisible()
  const asked = nextDialog(page, 'accept')
  await clickEntry(page, victim)
  await page.keyboard.press('Delete')
  // Del — сокращение, а не обход: вопрос тот же самый.
  expect(await asked).toMatch(/Удалить эту запись|Delete this entry/)
  await expect(row(page, victim)).toHaveCount(0, { timeout: 30000 })
  expect(existsSync(join(stand.get().projectDir, victim))).toBe(false)
})

test('3.5.1 фильтр оставляет папку видимой и раскрывает её', async () => {
  const page = await ui()
  await page.getByRole('searchbox', { name: /Filter by name|Фильтр по имени/ }).fill('заметки')
  await expect(row(page, 'notes')).toBeVisible()
  await expect(row(page, `notes/${SAMPLE.notes}`)).toBeVisible({ timeout: 30000 })
})

test('3.5.2 совпадение подсвечено внутри имени', async () => {
  const page = await ui()
  await expect(page.locator('mark', { hasText: 'заметки' }).first()).toBeVisible()
})

test('3.5.3 пустой результат честно говорит «Ничего не найдено»', async () => {
  const page = await ui()
  const search = page.getByRole('searchbox', { name: /Filter by name|Фильтр по имени/ })
  await search.fill('такого-файла-нет-нигде')
  await expect(page.getByText(/Ничего не найдено|Nothing matches/)).toBeVisible({ timeout: 30000 })
  await search.fill('')
})

test('3.6.1 «Показать в проводнике» открывает системный проводник на файле', async () => {
  const page = await ui()
  await watchReveal()
  await clickEntry(page, 'notes')
  const file = row(page, `notes/${SAMPLE.notes}`)
  await expect(file).toBeVisible({ timeout: 30000 })
  await file.hover()
  await file.getByRole('button', { name: /^(Show in Explorer|Показать в проводнике)$/ }).click()

  await expect.poll(async () => (await revealed()).length, { timeout: 15000 }).toBeGreaterThan(0)
  // Зовут с путём К ФАЙЛУ, а не к его папке.
  expect((await revealed())[0]).toContain(SAMPLE.notes)
})

// ── Блок 4. Источники ───────────────────────────────────────────────────────

test('4.1.1 подключённая папка появилась в списке источников', async () => {
  const page = await ui()
  await pickFolder(sample.sourceA)
  await page.getByRole('button', { name: /Connect a folder|Подключить папку/ }).click()
  await expect(row(page, sample.sourceA)).toBeVisible({ timeout: 30000 })

  const sources = await page.evaluate(() => window.aecpilot.listSources())
  expect(sources.map((source) => source.root_path)).toContain(sample.sourceA)
})

test('4.2.1 вложенная папка предупреждает о пересечении и НЕ подключается', async () => {
  const page = await ui()
  const nested = join(sample.sourceA, SAMPLE.brokenDir)
  await pickFolder(nested)
  await page.getByRole('button', { name: /Connect a folder|Подключить папку/ }).click()

  await expect(
    page.getByRole('button', { name: /Connect anyway|Подключить всё равно/ })
  ).toBeVisible({ timeout: 30000 })
  const sources = await page.evaluate(() => window.aecpilot.listSources())
  expect(
    sources.map((source) => source.root_path),
    'источник не должен подключиться'
  ).not.toContain(nested)
})

test('4.2.2 «Отмена» не подключает, «Подключить всё равно» подключает', async () => {
  const page = await ui()
  const nested = join(sample.sourceA, SAMPLE.brokenDir)
  const anyway = page.getByRole('button', { name: /Connect anyway|Подключить всё равно/ })

  await page.getByRole('button', { name: /^(Cancel|Отмена)$/ }).click()
  await expect(anyway).toHaveCount(0)
  let sources = await page.evaluate(() => window.aecpilot.listSources())
  expect(sources.map((source) => source.root_path)).not.toContain(nested)

  await pickFolder(nested)
  await page.getByRole('button', { name: /Connect a folder|Подключить папку/ }).click()
  await expect(anyway).toBeVisible({ timeout: 30000 })
  await anyway.click()
  await expect(row(page, nested)).toBeVisible({ timeout: 30000 })
  sources = await page.evaluate(() => window.aecpilot.listSources())
  expect(sources.map((source) => source.root_path)).toContain(nested)

  // Убрать за собой: вложенный источник задваивал бы файлы в отчётах скана,
  // которые меряет блок 5.
  await disconnect(page, nested)
})

test('4.3.1 развёрнутый источник показывает дерево и «Показать в проводнике»', async () => {
  const page = await ui()
  await watchReveal()
  await clickEntry(page, sample.sourceA)
  const file = row(page, SAMPLE.docx)
  await expect(file).toBeVisible({ timeout: 30000 })

  await file.hover()
  await file.getByRole('button', { name: /^(Show in Explorer|Показать в проводнике)$/ }).click()
  await expect.poll(async () => (await revealed()).length, { timeout: 15000 }).toBeGreaterThan(0)
  expect((await revealed())[0]).toContain(SAMPLE.docx)

  await clickEntry(page, sample.sourceA)
  await expect(file).toHaveCount(0)
})

test('4.4.1 у пропавшего источника виден бейдж «недоступен» без разворачивания', async () => {
  const page = await ui()
  const ghost = join(sample.root, 'съёмный-диск')
  mkdirSync(ghost, { recursive: true })
  writeFileSync(join(ghost, 'файл.txt'), 'на съёмном\n', 'utf-8')
  // Подключается той же кнопкой: главный процесс принимает только папку,
  // выбранную в системном диалоге (охранник D-47 — источник уходит в индекс
  // целиком, ставка выше, чем у создания проекта).
  await pickFolder(ghost)
  await page.getByRole('button', { name: /Connect a folder|Подключить папку/ }).click()
  await expect(row(page, ghost)).toBeVisible({ timeout: 30000 })

  // «Отключили съёмный диск»: корень источника исчезает из-под ног. Чек-лист
  // разрешает дождаться скана ИЛИ переоткрыть проект — перезапуск и есть второе.
  renameSync(ghost, `${ghost}-отключён`)
  await stand.get().relaunch()
  const fresh = await ui()

  const ghostRow = row(fresh, ghost)
  await expect(ghostRow).toBeVisible({ timeout: 60000 })
  // Бейдж в свёрнутом списке: разворачивать источник не понадобилось.
  await expect(ghostRow.getByText(/^(недоступен|unavailable)$/)).toBeVisible({ timeout: 30000 })

  await disconnect(fresh, ghost)
  rmSync(`${ghost}-отключён`, { force: true, recursive: true })
})

test('4.5.1 отключение спрашивает подтверждение, файлы остаются на диске', async () => {
  const page = await ui()
  const before = treeSnapshot(sample.sourceA)

  const asked = nextDialog(page, 'dismiss')
  await row(page, sample.sourceA).hover()
  await row(page, sample.sourceA)
    .getByRole('button', { name: /^(Disconnect|Отключить)$/ })
    .click()
  expect(await asked).toMatch(/Отключить этот источник|Disconnect this source/)

  // Отказ — источник на месте, и файлы тоже.
  const sources = await page.evaluate(() => window.aecpilot.listSources())
  expect(sources.map((source) => source.root_path)).toContain(sample.sourceA)
  const after = treeSnapshot(sample.sourceA)
  expect([...after.entries()].sort()).toEqual([...before.entries()].sort())
})

test('4.6.1 папка OneDrive подключается как обычная — без Microsoft и ключей', async () => {
  const page = await ui()
  // Решение владельца 2026-09-10 (D-83): файлы OneDrive берутся ПАПКОЙ. Имя
  // папки здесь и есть весь «OneDrive»: продукт не должен отличать её от любой
  // другой, и это ровно то, что проверяется.
  const oneDrive = join(sample.root, ONE_DRIVE)
  mkdirSync(oneDrive, { recursive: true })
  writeFileSync(join(oneDrive, 'ведомость-облако.txt'), 'Нагрузка щита 42 кВт\n', 'utf-8')
  writeFileSync(join(oneDrive, 'схема-облако.txt'), 'Схема сети\n', 'utf-8')

  await pickFolder(oneDrive)
  await page.getByRole('button', { name: /Connect a folder|Подключить папку/ }).click()
  await expect(row(page, oneDrive)).toBeVisible({ timeout: 30000 })

  // Ни окна согласия, ни запроса ключей: окон у приложения не прибавилось, и на
  // экране нет ничего про Microsoft.
  expect(appWindows(stand.get()).length).toBe(1)
  await expect(page.getByText(/Microsoft|Graph/)).toHaveCount(0)
})

test('4.6.2 скан нашёл документы этой папки, и их число не ноль', async () => {
  const page = await ui()
  const envelope = await scanOnce(page)
  expect(envelope, 'скан не отчитался за три минуты').not.toBeNull()

  const sources = await page.evaluate(() => window.aecpilot.listSources())
  const oneDriveId = sources.find((source) => source.root_path.includes(ONE_DRIVE))!.id
  const report = (envelope as { report: { sources: Record<string, { added: string[] }> } }).report
  const added = report.sources[oneDriveId]?.added ?? []
  expect(added.length, `отчёт по папке OneDrive: ${JSON.stringify(added)}`).toBe(2)
})

test('4.6.3 файл из этой папки открывается во вьюере', async () => {
  const page = await ui()
  const oneDrive = join(sample.root, ONE_DRIVE)
  await clickEntry(page, oneDrive)
  const file = row(page, 'ведомость-облако.txt')
  await expect(file).toBeVisible({ timeout: 30000 })
  await file.locator('button').first().click()

  // Вьюер показывает содержимое файла, а не его имя в списке.
  await expect(page.getByText('Нагрузка щита 42 кВт')).toBeVisible({ timeout: 30000 })
  await clickEntry(page, oneDrive)
})

// ── Блок 5. Детект изменений ────────────────────────────────────────────────

test('5.1.1 уведомление о скане несёт разбивку: добавлено, изменено, удалено', async () => {
  const page = await ui()
  await clearNotifications(page)
  const oneDrive = join(sample.root, ONE_DRIVE)
  writeFileSync(join(oneDrive, 'новый-лист.txt'), 'Новый лист\n', 'utf-8')
  writeFileSync(
    join(oneDrive, 'ведомость-облако.txt'),
    'Нагрузка щита 64 кВт — изменено\n',
    'utf-8'
  )
  rmSync(join(oneDrive, 'схема-облако.txt'), { force: true })

  await page.evaluate(() => window.aecpilot.triggerScan())
  const toast = page
    .locator('[role="status"]')
    .filter({ hasText: /Источники изменились|Sources changed/ })
    // С 0.21.5 их стопка держит несколько тостов: запоздавший отчёт прежнего
    // цикла скана («добавлено 12») может лечь рядом. Ждём тот, что про эту правку.
    .filter({ hasText: /изменено|changed/ })
    .first()
  await expect(toast).toBeVisible({ timeout: 180000 })
  scanToast = await toast.innerText()

  expect(scanToast).toMatch(/добавлено 1|1 added/)
  expect(scanToast).toMatch(/изменено 1|1 changed/)
  expect(scanToast).toMatch(/удалено 1|1 deleted/)
})

test('5.1.2 неизменённые файлы в уведомлении не упоминаются', async () => {
  expect(scanToast, 'текст уведомления снят в 5.1.1').not.toBe('')
  const page = await ui()
  const sources = await page.evaluate(() => window.aecpilot.listSources())
  const untouched = sources.find((source) => source.root_path === sample.sourceA)!

  // Нетронутый источник в уведомлении не назван вовсе, а у изменившегося счёт
  // ровно по тронутым файлам — остальные в него не попали.
  expect(scanToast).not.toContain(untouched.id)
  expect(scanToast).not.toMatch(/добавлено (?!1\b)\d+|(?!1\b)\d+ added/)
})

test('5.2.1 скан без изменений не показывает уведомления вовсе', async () => {
  const page = await ui()
  await clearNotifications(page)
  const toast = page
    .locator('[role="status"]')
    .filter({ hasText: /Источники изменились|Sources changed/ })
  await expect(toast).toHaveCount(0)

  // Дождаться КОНЦА скана, а не таймера: «тишина» доказывается только после
  // того, как скан действительно прошёл.
  const envelope = await scanOnce(page)
  expect(envelope, 'скан не отчитался за три минуты').not.toBeNull()
  await expect(toast).toHaveCount(0)
})
