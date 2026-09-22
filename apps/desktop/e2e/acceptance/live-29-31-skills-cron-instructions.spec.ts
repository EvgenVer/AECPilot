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

import { expect, test, type Page } from '@playwright/test'
import { hideFirstRunSurfaces, mainWindow, openProject, standFixture } from '../lib/app'

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

  await goto(page, '#/skills?tab=skills')
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
  await goto(page, '#/skills?tab=mcp')

  // Их экран MCP — редактор всего `mcp.json`: «Новый сервер» вписывает
  // заготовку, «Сохранить» отправляет запись целиком (D-101).
  await page
    .getByRole('button', { name: /^Новый сервер$/ })
    .first()
    .click()
  await page.waitForTimeout(500)
  await page
    .getByRole('button', { name: /^Сохранить$/ })
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
  await goto(page, '#/skills?tab=skills')
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
