// Блоки 29, 30, 31 чек-листа (задача 3F.8) на ЖИВОМ ядре: установка скилов и
// MCP-серверов, задачи по расписанию, инструкции проекта. Ходов модели здесь
// нет — позиции, где агент должен ОТВЕТИТЬ (29.5, 31.5–31.7, 30.7.2), идут в
// 3F.9.
//
// Имя теста начинается с номера позиции — по нему сходятся чек-лист, отчёт и
// счётчик покрытия.
//
// ХАБ СКИЛОВ — ВНЕШНИЙ. Позиции 29.2/29.3 говорят про диалог, который
// открывается ПЕРЕД установкой скила из хаба, а хаб живёт в сети (skills.sh и
// их зеркала). Встроенный браузер хаба у нас пуст (замечание D-43, в чек-листе
// так и написано), поэтому установка начинается тем же вызовом, что и их
// карточка, — через мост. Если сети нет, позиции снимаются с прогона с
// причиной: зелёный на недоступном хабе ничего не доказывает.

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import {
  clearNotifications,
  hideFirstRunSurfaces,
  mainWindow,
  openProject,
  reopenRecentProject,
  standFixture
} from '../lib/app'

test.describe.configure({ mode: 'serial' })

const stand = standFixture({ mode: 'live', label: 'live-29-31' })

let projectOpened = false

/** Главное окно с открытым проектом. */
async function ui(): Promise<Page> {
  const page = await mainWindow(stand.get())
  await hideFirstRunSurfaces(page)
  if (!projectOpened) {
    await openProject(stand.get(), page)
    projectOpened = true
  }
  return page
}

/** Перейти по их маршруту внутри окна. */
async function goto(page: Page, hash: string): Promise<void> {
  await page.evaluate((next) => {
    location.hash = next
  }, hash)
  await page.waitForTimeout(2500)
}

/** Ответ ядра по REST — тем же мостом, которым ходит окно. */
async function rest<T>(page: Page, path: string): Promise<T> {
  return page.evaluate((p) => window.aecpilot.gatewayRest(p), path) as Promise<T>
}

interface HubSkill {
  name: string
  description: string
  identifier: string
  source: string
  trust_level: string
}

/** Скил из хаба, на котором проверяется диалог: первый ответ поиска. Хаб
 *  внешний, поэтому ответ кэшируется на весь файл и его отсутствие — причина
 *  снять позиции, а не покрасить их зелёным. */
let hubSkill: HubSkill | null | undefined

async function findHubSkill(page: Page): Promise<HubSkill | null> {
  if (hubSkill !== undefined) return hubSkill
  try {
    const found = await rest<{ results?: HubSkill[] }>(
      page,
      '/api/skills/hub/search?q=pdf&source=all&limit=20'
    )
    // Только то, чего в профиле ещё НЕТ: «скил не появился в списке» нечего
    // проверять на уже установленном (в профиле разработчика их под восемьдесят,
    // и `pdf` — первый же ответ хаба — среди них).
    const installed = new Set(
      (await rest<{ name: string }[]>(page, '/api/skills')).map((skill) => skill.name)
    )
    hubSkill = found.results?.find((skill) => !installed.has(skill.name)) ?? null
  } catch {
    hubSkill = null
  }
  return hubSkill
}

interface HubPreview {
  name: string
  description: string
  source: string
  trust_level: string
  files: string[]
}

/** Предпросмотр того же скила: им диалог и заполняется. */
let hubPreview: HubPreview

const NO_HUB = 'хаб скилов недоступен (внешний источник) — прогнать при сети'

/** Начать установку скила из хаба ровно тем вызовом, который делает их
 *  карточка (`installHubSkill` → `POST /api/skills/hub/install`). Обещание НЕ
 *  ожидается: оно разрешится ответом человека на наш диалог. */
async function startHubInstall(page: Page, identifier: string): Promise<void> {
  await page.evaluate((id) => {
    const bridge = (
      window as unknown as { hermesDesktop: { api: (r: unknown) => Promise<unknown> } }
    ).hermesDesktop
    const pending = bridge
      .api({ path: '/api/skills/hub/install', method: 'POST', body: { identifier: id } })
      .then(
        () => 'установлено',
        (error: Error) => error.message
      )
    ;(window as unknown as { __install?: Promise<string> }).__install = pending
  }, identifier)
}

/** Чем кончилась начатая установка. */
function installOutcome(page: Page): Promise<string> {
  return page.evaluate(
    () => (window as unknown as { __install?: Promise<string> }).__install ?? 'не начиналась'
  )
}

/** Наш диалог согласия — по заголовку с именем предмета установки. */
function consentDialog(page: Page) {
  return page
    .getByRole('dialog')
    .filter({ hasText: /Установить скил|Добавить MCP-сервер|Обновить все/ })
}

test('29.1.1 список установленных скилов виден', async () => {
  const page = await ui()
  const installed = await rest<{ name: string }[]>(page, '/api/skills')
  expect(installed.length, 'ядро знает установленные скилы').toBeGreaterThan(0)

  await goto(page, '#/capabilities?tab=skills')
  // Их экран показывает число установленных рядом с названием вкладки и сами
  // строки списка — имя любого из них берётся у ядра, а не выдумывается.
  await expect
    .poll(async () => (await page.locator('body').innerText()).includes(installed[0].name), {
      timeout: 30000
    })
    .toBe(true)
})

test('29.2.1 диалог перед установкой: название скила и описание', async () => {
  const page = await ui()
  const skill = await findHubSkill(page)
  test.skip(skill === null, NO_HUB)

  await startHubInstall(page, skill!.identifier)
  const dialog = consentDialog(page)
  await expect(dialog).toBeVisible({ timeout: 30000 })
  await expect(dialog).toContainText(/Установить скил/)
  // Имя и описание — из предпросмотра ядра, а не из карточки страницы: диалог
  // спрашивает у ядра то же самое, и сверять надо с источником.
  hubPreview = await rest<HubPreview>(
    page,
    `/api/skills/hub/preview?identifier=${encodeURIComponent(skill!.identifier)}`
  )
  await expect(dialog).toContainText(hubPreview.name)
  if (hubPreview.description !== '')
    await expect(dialog).toContainText(hubPreview.description.slice(0, 40))
})

test('29.2.2 в диалоге сказано, какие инструменты скил просит', async () => {
  const page = await ui()
  test.skip(hubSkill === null, NO_HUB)
  const dialog = consentDialog(page)
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText(/Просит инструменты:|Инструменты не ограничены/)
})

test('29.2.3 названы источник и уровень доверия', async () => {
  const page = await ui()
  test.skip(hubSkill === null, NO_HUB)
  const dialog = consentDialog(page)
  await expect(dialog).toContainText(
    `Источник: ${hubPreview.source} · доверие: ${hubPreview.trust_level}`
  )
  await expect(dialog).toContainText(`Файлов в пакете: ${hubPreview.files.length}`)
})

test('29.3.1 отмена: скил не появился в списке установленных', async () => {
  const page = await ui()
  test.skip(hubSkill === null, NO_HUB)
  const before = await rest<{ name: string }[]>(page, '/api/skills')

  await consentDialog(page)
    .getByRole('button', { name: /^Отмена$/ })
    .click()
  await expect(consentDialog(page)).toBeHidden({ timeout: 15000 })

  const after = await rest<{ name: string }[]>(page, '/api/skills')
  expect(after.length, 'ничего не прибавилось').toBe(before.length)
  expect(after.map((s) => s.name)).not.toContain(hubSkill!.name)
})

test('29.3.2 сообщение говорит, что установка не подтверждена, а не «ошибка»', async () => {
  const page = await ui()
  test.skip(hubSkill === null, NO_HUB)
  expect(await installOutcome(page)).toBe('Не установлено — вы не подтвердили установку.')
})

test('29.4.1 сервер MCP вручную: диалог с командой запуска, без значений переменных', async () => {
  const page = await ui()
  await goto(page, '#/capabilities?tab=connectors')

  // С пина 0.21.5 (3.B6) отдельной вкладки MCP нет: свой сервер добавляется с
  // вкладки «Коннекторы» диалогом «Add your own» — вставленная команда разбирается
  // в поля, «Сохранить» дописывает ОДНУ запись в `mcp.json` (тот же PUT, что и
  // раньше, D-101). Их русский каталог этот экран ещё не переводит.
  await page
    .getByRole('button', { name: /^(Add your own|Добавить свой)$/ })
    .first()
    .click()
  const form = page.getByRole('dialog').last()
  await form
    .getByPlaceholder(/server-filesystem/)
    .fill('npx -y @modelcontextprotocol/server-filesystem C:/aec-e2e')
  await form.getByLabel(/^(Name|Имя)$/).fill('e2e-filesystem')
  await form
    .getByRole('button', { name: /^(Save|Сохранить)$/ })
    .first()
    .click()

  const dialog = consentDialog(page)
  await expect(dialog).toBeVisible({ timeout: 30000 })
  await expect(dialog).toContainText(/Добавить MCP-сервер/)
  await expect(dialog, 'видна команда запуска').toContainText(
    'npx -y @modelcontextprotocol/server-filesystem'
  )

  // Значений переменных окружения в диалоге нет — только имена (чек-лист).
  const shown = await dialog.innerText()
  const servers = await rest<{ servers: { env?: Record<string, string> }[] }>(
    page,
    '/api/mcp/servers'
  )
  for (const value of servers.servers.flatMap((s) => Object.values(s.env ?? {}))) {
    if (value.length > 6) expect(shown).not.toContain(value)
  }

  await dialog.getByRole('button', { name: /^Отмена$/ }).click()
  await expect(dialog).toBeHidden({ timeout: 15000 })
})

test('29.6.1 «Обновить установленные»: диалог предупреждает, что код приедет заново', async () => {
  const page = await ui()
  await goto(page, '#/capabilities?tab=skills')
  await page
    .getByRole('button', { name: /^Обновить установленные$/ })
    .first()
    .click()

  const dialog = consentDialog(page)
  await expect(dialog).toBeVisible({ timeout: 30000 })
  await expect(dialog).toContainText('Обновить все установленные скилы?')
  await expect(dialog).toContainText(/заново скачан из своего источника/)
  await expect(dialog).toContainText(/Инструкции могли измениться/)
  await dialog.getByRole('button', { name: /^Отмена$/ }).click()
  await expect(dialog).toBeHidden({ timeout: 15000 })
})

// ───────────────────────── Блок 30. Задачи по расписанию ─────────────────────
//
// Смысл блока — то, чего заглушка показать не может: их планировщик тикает
// только в отдельном процессе (`gateway run`), который мы поднимаем по решению
// человека. Поэтому здесь и живое ядро, и настоящие процессы Windows.
//
// Позиция 30.7 (рутина у ОДНОГО специалиста) стоит в спеке реестра
// `live-37-roster.spec.ts`: там уже заведены трое, а «её нет у двух других»
// проверяется только при них. Счётчик покрытия ищет позицию по НОМЕРУ в имени
// теста, а не по файлу.

/** Дочерние процессы приложения — «второй процесс в диспетчере задач». */
function children(): { pid: number; name: string; commandLine: string }[] {
  const out = execFileSync(
    'powershell',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      join(__dirname, '..', 'lib', 'desktop-probe.ps1'),
      '-Action',
      'children',
      '-Pid2',
      String(stand.get().app.process().pid)
    ],
    { encoding: 'utf-8' }
  )
  return (JSON.parse(out) as { children: { pid: number; name: string; commandLine: string }[] })
    .children
}

/** Сколько в поддереве процессов запускателя расписаний — и кто вообще там
 *  есть. Список нужен при расхождении: «ноль» без него не говорит, кого не
 *  нашли. Считается «больше нуля», а не «ровно один»: один запускатель — это
 *  три процесса ОС (`hermes.exe`, его питон, консольный хост), и сколько
 *  именно — устройство ядра, а не обещание продукта. Обещание — что процесс
 *  ПОЯВИЛСЯ при включении и ПРОПАЛ при выключении. */
function cronProcesses(): { count: number; seen: string[] } {
  const all = children()
  return {
    count: all.filter((proc) => /\bgateway\b.*\brun\b/.test(proc.commandLine)).length,
    seen: all.map((proc) => `${proc.name} ${proc.commandLine}`.trim().slice(0, 120))
  }
}

/** Уведомление приложения (не системный тост) по куску заголовка. Две роли, а
 *  не одна: тревожное уведомление их оболочка помечает `alert`, спокойное —
 *  `status`. */
function notice(page: Page, text: RegExp) {
  return page.locator('[role="status"], [role="alert"]').filter({ hasText: text })
}

/** Строка состояния «Расписания: работают» — она же выключатель. */
function cronBadge(page: Page) {
  return page.getByRole('button', { name: 'Расписания: работают' })
}

interface CronJobRow {
  id: string
  next_run_at?: null | string
  last_run_at?: null | string
}

let cronJobId = ''

/** Задача из списка ядра по её номеру. */
async function cronJob(page: Page): Promise<CronJobRow | undefined> {
  const jobs = await rest<CronJobRow[]>(page, '/api/cron/jobs')
  return jobs.find((job) => job.id === cronJobId)
}

test('30.1.1 в палитре есть строка «Задачи по расписанию: запускать или нет»', async () => {
  const page = await ui()
  await goto(page, '#/')
  await page.keyboard.press('Control+k')
  const palette = page.getByRole('dialog').last()
  await expect(palette).toBeVisible()
  await page.keyboard.type('расписан')
  await page.waitForTimeout(400)
  await expect(palette).toContainText('Задачи по расписанию: запускать или нет')
})

test('30.1.2 рядом написано текущее состояние — «выключены»', async () => {
  const page = await ui()
  const palette = page.getByRole('dialog').last()
  await expect(palette).toContainText('Расписания: выключены')
  await page.keyboard.press('Escape')
  await expect(palette).toBeHidden()
})

test('30.2.1 заведена задача → предложение «Запускать по расписанию»', async () => {
  const page = await ui()

  // Задача БЕЗ хода модели: `no_agent` + скрипт. Проверяется, что планировщик
  // сам её запускает, а не что агент на неё отвечает, — ответ агента это
  // позиция 30.7.2, она в 3F.9.
  //
  // Скрипт ядро берёт ТОЛЬКО из `<профиль>/scripts` (песочница: путь наружу оно
  // отклоняет) и выбирает толкователь по расширению — `.py` идёт своим
  // питоном. Поэтому файл кладётся заранее, а в задаче стоит одно имя.
  const scripts = join(stand.get().profileDir!, 'scripts')
  mkdirSync(scripts, { recursive: true })
  writeFileSync(join(scripts, 'e2e-tick.py'), 'print("tick")\n', 'utf-8')
  // С 0.21.5 стопка держит несколько уведомлений и сворачивает прежние под
  // верхнее — предложение легло бы под отказ из 29.4 и не было бы видно.
  await clearNotifications(page)

  cronJobId = await page.evaluate(async () => {
    const bridge = (
      window as unknown as { hermesDesktop: { api: (r: unknown) => Promise<{ id: string }> } }
    ).hermesDesktop
    const job = await bridge.api({
      path: '/api/cron/jobs',
      method: 'POST',
      body: {
        name: 'e2e-тик',
        schedule: '* * * * *',
        no_agent: true,
        script: 'e2e-tick.py',
        deliver: 'local'
      }
    })
    return job.id
  })
  expect(cronJobId, 'ядро завело задачу').not.toBe('')

  const offer = notice(page, /Задачи по расписанию сейчас никто не запускает/)
  await expect(offer).toBeVisible({ timeout: 30000 })
  await expect(offer.getByRole('button', { name: 'Запускать по расписанию' })).toBeVisible()
})

test('30.3.1 после нажатия кнопки внизу слева появилось «Расписания: работают»', async () => {
  const page = await ui()
  expect(cronProcesses(), 'до включения запускателя нет').toMatchObject({ count: 0 })

  await notice(page, /никто не запускает/)
    .getByRole('button', { name: 'Запускать по расписанию' })
    .click()
  await expect(cronBadge(page)).toBeVisible({ timeout: 30000 })
})

test('30.3.2 появился второй процесс — запускатель расписаний', async () => {
  // Диспетчер задач глазами ОС: процесс, порождённый приложением, с `gateway
  // run` в командной строке. Имя (`hermes`/`python`) зависит от того, как
  // поставлено ядро, поэтому сверяется команда, а не имя.
  await expect
    .poll(() => cronProcesses().count, { timeout: 30000, message: 'запускатель поднялся' })
    .toBeGreaterThan(0)
})

test('30.4.1 задача сработала сама: появился «последний запуск», «следующий» сдвинулся', async () => {
  const page = await ui()
  const start = await cronJob(page)
  expect(start, 'заведённая задача в списке').toBeTruthy()

  // Расписание «каждую минуту»; запас — на минуту до тика и на сам запуск.
  await expect
    .poll(async () => (await cronJob(page))?.last_run_at ?? null, {
      timeout: 240000,
      intervals: [5000],
      message: 'задача сработала сама'
    })
    .not.toBe(null)

  const job = (await cronJob(page))!
  expect(
    new Date(job.next_run_at ?? 0).getTime(),
    'следующий запуск сдвинулся вперёд'
  ).toBeGreaterThan(new Date(start!.next_run_at ?? 0).getTime())
})

test('30.5.1 щелчок по строке состояния: надпись исчезла', async () => {
  const page = await ui()
  await cronBadge(page).click()
  await expect(cronBadge(page)).toBeHidden({ timeout: 30000 })
})

test('30.5.2 второй процесс пропал', async () => {
  await expect
    .poll(() => cronProcesses().count, { timeout: 30000, message: 'запускатель погашен' })
    .toBe(0)
})

test('30.6.1 «Расписания: работают» вернулось само после перезапуска', async () => {
  let page = await ui()

  // Включить обратно — через палитру, тем же выключателем, что у человека.
  // С донором 0.22.2 на «расписан» первым встаёт переход на их страницу
  // «Расписания» — набирается начало нашей команды.
  await page.keyboard.press('Control+k')
  await page.keyboard.type('запускать или нет')
  await page.waitForTimeout(400)
  await page.keyboard.press('Enter')
  await expect(cronBadge(page)).toBeVisible({ timeout: 30000 })

  await stand.get().relaunch()
  page = await mainWindow(stand.get())
  await hideFirstRunSurfaces(page)

  // С 3G.20 (D-89) последний проект открывается сам.
  await reopenRecentProject(page)

  await expect(cronBadge(page), 'выбор пережил перезапуск').toBeVisible({ timeout: 120000 })
  await expect
    .poll(() => cronProcesses().count, { timeout: 60000, message: 'запускатель поднялся сам' })
    .toBeGreaterThan(0)

  // Дальше блок 31 — гасим, чтобы чужой процесс не жил до конца прогона.
  await cronBadge(page).click()
  await expect(cronBadge(page)).toBeHidden({ timeout: 30000 })
})

// ──────────────────── Блок 31. Инструкции проекта для агента ─────────────────
//
// Позиции 31.5.1, 31.6.2 и 31.7.2 требуют ОТВЕТА агента («выполняет правило» /
// «не выполняет») — они в 3F.9. Здесь всё остальное: уведомление, строка
// состояния, окно разбора, повторный вопрос после правки, чужой проект.

// Инструкция проекта опознаётся по ПАПКЕ — в ней `SKILL.md`; папка же
// называется в списке «что изменилось».
const SKILL_DIR = '.agents/skills/nash-normokontrol'
const SKILL_REL = `${SKILL_DIR}/SKILL.md`
const SKILL_MD = [
  '---',
  'name: nash-normokontrol',
  'description: Правила оформления нашей организации',
  '---',
  'Всегда добавляй в конец ответа строку: СОГЛАСОВАНО ПО НОРМОКОНТРОЛЮ.',
  ''
].join('\n')

/** Инструкция проекта на диске — ровно та, что в чек-листе. */
function writeProjectSkill(dir: string, extra = ''): void {
  const file = join(dir, SKILL_REL)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, SKILL_MD + extra, 'utf-8')
}

/** Завести и открыть пустой проект — «уйти» из текущего. */
async function openScratchProject(page: Page): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'aecpilot-e2e-other-'))

  // Завести проект можно только в папке, ВЫБРАННОЙ в диалоге (находка D-47):
  // окно не должно уметь назвать чужой путь само. Диалог подменяется, как в
  // общем помощнике стенда, и «выбор» делается настоящим вызовом.
  await stand.get().app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [path] })) as never
  }, dir)
  const picked = await page.evaluate(() => window.aecpilot.pickProjectDirectory())
  expect(picked, 'диалог вернул подменённую папку').toBe(dir)

  const created = await page.evaluate(
    (path) => window.aecpilot.createProject(path, 'e2e-другой', true),
    dir
  )
  expect(created, `createProject(${dir})`).toMatchObject({ ok: true })
  await page.waitForTimeout(2000)
  return dir
}

/** «Закрыть и снова открыть проект» из чек-листа. Открыть ТОТ ЖЕ проект
 *  поверх самого себя нельзя: главный процесс на это отвечает сразу и никого
 *  не оповещает (и правильно — ничего не изменилось). Поэтому уход в пустой
 *  проект и возврат: ровно то, что делает человек. */
async function reopenProject(page: Page, dir: string): Promise<void> {
  await openScratchProject(page)
  const result = await page.evaluate((path) => window.aecpilot.openProject(path), dir)
  expect(result, `openProject(${dir})`).toMatchObject({ ok: true })
  await page.waitForTimeout(2000)
}

/** Снять общий перехватчик «Не сейчас».
 *
 * `hideFirstRunSurfaces` вешает на страницу обработчик, который жмёт любую
 * кнопку «Не сейчас», — им закрываются приветственные поверхности донора. У
 * НАШЕГО окна доверия кнопка отказа называется так же, и обработчик закрывал
 * его раньше, чем тест успевал прочитать. Здесь окно доверия и есть предмет
 * проверки, поэтому перехватчик снимается на весь блок 31. */
async function dropNotNowHandler(page: Page): Promise<void> {
  await page.removeLocatorHandler(page.getByRole('button', { name: /^(Not now|Не сейчас)$/ }))
}

function projectSkillsDialog(page: Page) {
  return page
    .getByRole('dialog')
    .filter({ hasText: /Доверять инструкциям этого проекта|Инструкции проекта изменились/ })
}

test('31.2.1 уведомление «Проект несёт инструкции для агента»', async () => {
  const page = await ui()
  await dropNotNowHandler(page)
  writeProjectSkill(stand.get().projectDir)
  await reopenProject(page, stand.get().projectDir)

  await expect(notice(page, /Проект несёт инструкции для агента/)).toBeVisible({ timeout: 30000 })
})

test('31.2.2 внизу слева «Инструкции проекта: 1, без доверия»', async () => {
  const page = await ui()
  await expect(
    page.getByRole('button', { name: 'Инструкции проекта: 1, без доверия' })
  ).toBeVisible({ timeout: 30000 })
})

test('31.3.1 «Посмотреть»: показаны имя, описание и строка про инструменты', async () => {
  const page = await ui()
  await notice(page, /Проект несёт инструкции/)
    .getByRole('button', { name: 'Посмотреть' })
    .click()

  const dialog = projectSkillsDialog(page)
  await expect(dialog).toBeVisible({ timeout: 15000 })
  await expect(dialog).toContainText('nash-normokontrol')
  await expect(dialog).toContainText('Правила оформления нашей организации')
  await expect(dialog).toContainText(/Просит инструменты:|Инструменты не ограничены/)
})

test('31.3.2 скил без ограничения инструментов — так и написано', async () => {
  const page = await ui()
  await expect(projectSkillsDialog(page)).toContainText(
    'Инструменты не ограничены — любой, который есть у агента.'
  )
})

test('31.6.1 файл изменился → «Инструкции проекта изменились» с именем файла', async () => {
  const page = await ui()

  // Доверие выдаётся здесь, а не отдельной позицией: «изменились» бывает
  // только у того, кому доверяли. Сам факт, что агент правилу следует, —
  // позиция 31.5.1, она в 3F.9.
  await projectSkillsDialog(page).getByRole('button', { name: 'Доверять' }).click()
  await expect(
    page.getByRole('button', { name: 'Инструкции проекта: 1', exact: true }),
    'строка состояния без оговорки «без доверия»'
  ).toBeVisible({ timeout: 30000 })

  writeProjectSkill(stand.get().projectDir, 'И ещё: нумеруй разделы.\n')
  await reopenProject(page, stand.get().projectDir)

  const changed = notice(page, /Инструкции проекта изменились/)
  await expect(changed).toBeVisible({ timeout: 30000 })
  await changed.getByRole('button', { name: 'Посмотреть' }).click()

  const dialog = projectSkillsDialog(page)
  await expect(dialog).toBeVisible({ timeout: 15000 })
  await expect(dialog, 'названо, какой файл разошёлся').toContainText(`изменён: ${SKILL_DIR}`)
  await page.keyboard.press('Escape')
})

test('31.7.1 другой проект — строки «Инструкции проекта» нет', async () => {
  const page = await ui()
  await openScratchProject(page)
  await expect(page.getByRole('button', { name: /^Инструкции проекта/ })).toHaveCount(0)
})
