// Блок 37 чек-листа (задача 3F.8) на ЖИВОМ ядре: реестр специалистов — список
// и создание, лицо, возможности, рутины, скрытие. Постоянный чат (37.10–37.13)
// и всё, где специалист должен ОТВЕТИТЬ или рутина должна ОТРАБОТАТЬ (37.9.2,
// 37.15, 37.16.2), идут в 3F.9.
//
// Сюда же поставлена позиция 30.7.1 («рутина у ОДНОГО из специалистов»): её
// вторая половина — «её нет у двух других», и проверять это можно только там,
// где трое заведены. Счётчик покрытия ищет позицию по НОМЕРУ в имени теста, а
// не по файлу.
//
// ХОД МОДЕЛИ ЗДЕСЬ ЕСТЬ, и он не наш выбор: при создании специалиста через окно
// их плагин сам отправляет ему «Привет! Расскажи о себе.» (самопредставление —
// `kickoff` в `canonical-chat.ts`, только при создании). Окном заводятся двое —
// «Смета» (37.2.1) и её клон (37.9.1), итого два хода. Остальные специалисты,
// нужные только для числа строк и для сравнения, заводятся прямо в ядре
// (`profiles.create`) — там самопредставления нет.

import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test, type Locator, type Page } from '@playwright/test'

import { hideFirstRunSurfaces, mainWindow, openProject, standFixture } from '../lib/app'

test.describe.configure({ mode: 'serial' })

const stand = standFixture({ mode: 'live', label: 'live-37' })

let projectOpened = false

async function ui(): Promise<Page> {
  const page = await mainWindow(stand.get())
  await hideFirstRunSurfaces(page)
  if (!projectOpened) {
    await openProject(stand.get(), page)
    projectOpened = true
  }
  return page
}

/** Панель специалистов слева. Вкладка подписана «BOTS» — их строка без
 *  перевода; русский проход по донорским поверхностям это задача 6.7. */
async function roster(page: Page): Promise<Page> {
  await page.getByRole('tab', { name: /Bots|Боты|Специалисты/i }).click()
  await page.waitForTimeout(1500)
  return page
}

/** Строка специалиста в списке — по видимому имени. */
function rosterRow(page: Page, title: string): Locator {
  return page.getByRole('button', { name: new RegExp(`^${title}( ·|$)`) }).first()
}

/** Вызов ядра мимо экрана — только чтобы ПРОВЕРИТЬ, что экран сделал, или
 *  завести то, что к проверяемой позиции не относится. */
async function rpc(page: Page, method: string, params: Record<string, unknown>): Promise<unknown> {
  const answer = (await page.evaluate(
    ([m, p]) => window.aecpilot.gatewayRpc(m as string, p as Record<string, unknown>),
    [method, params] as const
  )) as { ok?: boolean; value?: unknown; error?: unknown }
  if (answer?.ok === false) throw new Error(`${method}: ${JSON.stringify(answer.error)}`)
  return answer?.value ?? answer
}

interface CoreProfile {
  name: string
  is_default?: boolean
  description?: string
  model?: string
  provider?: string
  skill_count?: number
  has_avatar?: boolean
  ui_meta?: Record<string, Record<string, unknown>>
}

async function coreProfiles(page: Page): Promise<CoreProfile[]> {
  return ((await rpc(page, 'profiles.list', {})) as { profiles: CoreProfile[] }).profiles
}

async function coreProfile(page: Page, name: string): Promise<CoreProfile | undefined> {
  return (await coreProfiles(page)).find((row) => row.name === name)
}

/** Лицо специалиста в том виде, в каком его хранит ядро. */
async function coreFace(page: Page, name: string): Promise<Record<string, unknown>> {
  return (await coreProfile(page, name))?.ui_meta?.['hermes-bots'] ?? {}
}

async function coreAvatar(page: Page, name: string): Promise<string> {
  const answer = (await rpc(page, 'profiles.get_asset', { name, asset: 'avatar' })) as {
    found?: boolean
    data?: string
  }
  return answer?.found ? String(answer.data ?? '') : ''
}

/** Пункты меню строки (правый щелчок). Меню закрывается. */
async function rowMenu(page: Page, title: string): Promise<string[]> {
  await rosterRow(page, title).click({ button: 'right' })
  const menu = page.getByRole('menu').last()
  await expect(menu).toBeVisible({ timeout: 15000 })
  const items: string[] = []
  for (const item of await menu.getByRole('menuitem').all()) {
    items.push((await item.innerText()).trim())
  }
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  return items
}

/** Карточка специалиста — «Изменить…» в меню строки. */
async function openCard(page: Page, title: string): Promise<Locator> {
  await rosterRow(page, title).click({ button: 'right' })
  await page.getByRole('menuitem', { name: /^Изменить/ }).click()
  const card = page.getByRole('dialog', { name: 'Изменить профиль', exact: true })
  await expect(card).toBeVisible({ timeout: 15000 })
  return card
}

/** Раздел «Возможности» карточки: модель, скилы, инструменты, SOUL. */
async function openCapabilities(card: Locator): Promise<void> {
  await card.getByRole('button', { name: /^Возможности —/ }).click()
  await expect(card.getByText('SOUL.md', { exact: false })).toBeVisible({ timeout: 60000 })
}

/** Выбор модели показывает ДВА вида: пару выпадающих списков и ручной ввод.
 *  Какой откроется первым, решает гонка их загрузки (список провайдеров ещё
 *  не пришёл — провайдер профиля «неизвестен» — открывается ручной ввод), так
 *  что вид задаётся явно. */
async function modelDropdowns(card: Locator): Promise<void> {
  const back = card.getByRole('button', { name: /Back to dropdowns|Вернуться к спискам/ })
  await expect(card.getByText(/^(Provider|Провайдер)/).first()).toBeVisible({ timeout: 60000 })
  if (await back.isVisible()) await back.click()
  await expect(card.getByRole('combobox').first()).toBeVisible({ timeout: 30000 })
}

/** Завести специалиста тем же путём, что человек: «+» → «Новый специалист». */
async function createSpecialist(
  page: Page,
  fields: { name: string; title: string; description: string; cloneFrom?: string }
): Promise<void> {
  await page.getByRole('button', { name: 'Новый специалист или комната' }).click()
  await page.getByRole('menuitem', { name: 'Новый специалист' }).click()
  const dialog = page.getByRole('dialog').last()
  await expect(dialog).toBeVisible({ timeout: 15000 })

  await dialog.getByRole('textbox').nth(0).fill(fields.name)
  await dialog.getByRole('textbox').nth(1).fill(fields.title)
  await dialog.getByRole('textbox').nth(2).fill(fields.description)
  if (fields.cloneFrom) {
    await dialog.getByRole('button', { name: /^Возможности/ }).click()
    const clone = dialog.getByRole('combobox').first()
    await expect(clone).toBeVisible({ timeout: 30000 })
    await clone.click()
    await page.getByRole('option', { name: fields.cloneFrom, exact: true }).click()
    await expect(clone).toContainText(fields.cloneFrom)
  }
  await dialog.getByRole('button', { name: /^(Create Bot|Создать специалиста)$/ }).click()
  await expect(dialog).toBeHidden({ timeout: 60000 })
  // Самопредставление: ждём, пока ход кончится, — иначе щелчок по строке
  // прервёт открытие его же чата.
  await expect(rosterRow(page, fields.title)).toContainText('Привет', { timeout: 180000 })
}

/** Вкладка рутин справа. Она есть, пока открыт чат специалиста. */
function routinesTab(page: Page): Locator {
  return page.getByText('Запланированные задачи', { exact: true }).last()
}

/** Открыть панель рутин того специалиста, по чьей строке щёлкнули. */
async function openRoutinesOf(page: Page, title: string): Promise<void> {
  await rosterRow(page, title).click()
  const tab = routinesTab(page)
  await expect(tab).toBeVisible({ timeout: 60000 })
  const create = page.getByRole('button', { name: 'Новый cron' }).first()
  if (!(await create.isVisible())) await tab.click()
  // Панель готова, когда в ней кнопка «Новый cron» (есть и над списком, и в
  // пустом). «Сначала специалист должен появиться в списке» — это НЕ
  // готовность, а владелец, которого она ещё не нашла.
  await expect(create).toBeVisible({ timeout: 120000 })
}

const PNG_RED =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR42mP8z8AARLQHo0YDAIYsB/1w1MwYAAAAAElFTkSuQmCC'

// ───────────────────────────── 37.1 Список и создание ─────────────────────────

test('37.1.1 в списке есть хотя бы один — агент по умолчанию', async () => {
  const page = await roster(await ui())
  await expect(rosterRow(page, 'AECPilot')).toBeVisible({ timeout: 30000 })
  const main = (await coreProfiles(page)).filter((row) => row.is_default)
  expect(
    main.map((row) => row.name),
    'в ядре он — профиль по умолчанию'
  ).toEqual(['default'])
})

test('37.1.2 у агента по умолчанию нет кнопки удаления', async () => {
  const page = await ui()
  const items = await rowMenu(page, 'AECPilot')
  expect(items, 'меню строки прочитано').toContain('Изменить…')
  expect(items).not.toContain('Удалить')
})

test('37.2.1 заведённый специалист появился в списке под именем «Смета»', async () => {
  const page = await ui()
  await createSpecialist(page, { name: 'smeta', title: 'Смета', description: 'сметчик' })

  await expect(rosterRow(page, 'Смета')).toBeVisible()
  const smeta = await coreProfile(page, 'smeta')
  expect(smeta, 'в ядре появился профиль smeta').toBeTruthy()
  expect(smeta?.description).toContain('сметчик')
  expect(smeta?.ui_meta?.['hermes-bots']?.title).toBe('Смета')
  // Для сравнения с 37.1.2: у обычного специалиста удаление ЕСТЬ.
  expect(await rowMenu(page, 'Смета')).toContain('Удалить')
})

test('37.2.2 имя профиля (smeta) в карточке менять не предлагают', async () => {
  const page = await ui()
  const card = await openCard(page, 'Смета')
  await expect(card).toContainText('(smeta)')

  const values: string[] = []
  for (const box of await card.getByRole('textbox').all()) values.push(await box.inputValue())
  expect(values, 'правятся только название и описание').toHaveLength(2)
  expect(values[0]).toBe('Смета')
  expect(values).not.toContain('smeta')

  await card.getByRole('button', { name: /^Отмена$/ }).click()
  await expect(card).toBeHidden()
})

// ───────────────────────────── 37.2 Лицо ──────────────────────────────────────

test('37.5.1 форма и цвет из карточки меняют значок в списке', async () => {
  const page = await ui()
  const before = await coreFace(page, 'smeta')
  const iconBefore = await rosterRow(page, 'Смета').locator('svg, img').first().innerHTML()

  const card = await openCard(page, 'Смета')
  // Формы — кнопки 44×44 без подписи (в них нарисовано лицо); берётся та, что
  // сейчас НЕ выбрана.
  const shapes = card.locator('button').filter({ has: page.locator('svg') })
  const shapeCount = await shapes.count()
  let picked = false
  for (let i = 0; i < shapeCount && !picked; i += 1) {
    const shape = shapes.nth(i)
    const box = await shape.boundingBox()
    const selected = (await shape.getAttribute('class'))?.includes('ring-1') ?? false
    if (box && Math.round(box.width) === 44 && !selected) {
      await shape.click()
      picked = true
    }
  }
  expect(picked, 'нашлась невыбранная форма').toBe(true)
  await card.getByRole('button', { name: 'hsl(120 68% 58%)', exact: true }).click()
  await card.getByRole('button', { name: /^Сохранить$/ }).click()
  await expect(card).toBeHidden({ timeout: 30000 })

  await expect
    .poll(async () => JSON.stringify(await coreFace(page, 'smeta')), { timeout: 30000 })
    .not.toBe(JSON.stringify(before))
  const after = await coreFace(page, 'smeta')
  expect(after.color, 'цвет записан в ядро').toBe('hsl(120 68% 58%)')
  await expect
    .poll(() => rosterRow(page, 'Смета').locator('svg, img').first().innerHTML(), {
      timeout: 30000
    })
    .not.toBe(iconBefore)
})

test('37.5.2 питомца в выборе лица нет; портрет генерацией — есть (запрет снят)', async () => {
  const page = await ui()
  const card = await openCard(page, 'Смета')
  for (const tab of ['Специалист', 'Сгенерировать', 'Загрузить']) {
    await expect(card.getByRole('button', { name: tab, exact: true })).toBeVisible()
  }
  await expect(card).not.toContainText(/Питом|\bPet\b/)
  await card.getByRole('button', { name: /^Отмена$/ }).click()
  await expect(card).toBeHidden()
})

let avatarBeforeUpload = ''

test('37.6.1 «Загрузить» → PNG: в списке вместо фигуры картинка', async () => {
  const page = await ui()
  avatarBeforeUpload = await coreAvatar(page, 'smeta')
  const file = join(mkdtempSync(join(tmpdir(), 'aecpilot-face-')), 'face.png')
  writeFileSync(file, Buffer.from(PNG_RED, 'base64'))

  const card = await openCard(page, 'Смета')
  await card.getByRole('button', { name: 'Загрузить', exact: true }).click()
  const chooser = page.waitForEvent('filechooser')
  await card.getByRole('button', { name: /Choose an image/ }).click()
  await (await chooser).setFiles(file)
  await expect(card.locator('img').first()).toBeVisible({ timeout: 30000 })
  await card.getByRole('button', { name: /^Сохранить$/ }).click()
  await expect(card).toBeHidden({ timeout: 30000 })

  await expect(rosterRow(page, 'Смета').locator('img').first()).toBeVisible({ timeout: 30000 })
})

test('37.6.2 картинка лежит в ядре — вторая машина с тем же ядром получит ту же', async () => {
  const page = await ui()
  await expect
    .poll(() => coreAvatar(page, 'smeta'), { timeout: 30000 })
    .not.toBe(avatarBeforeUpload)
  expect(await coreAvatar(page, 'smeta'), 'ядро отдаёт картинку').not.toBe('')
  expect((await coreProfile(page, 'smeta'))?.has_avatar).toBe(true)
})

// ───────────────────────────── перезапуск ─────────────────────────────────────

test('37.3.1 после перезапуска специалист на месте со своим именем и ролью', async () => {
  await stand.get().relaunch()
  let page = await mainWindow(stand.get())
  await hideFirstRunSurfaces(page)
  // После перезапуска приложение открывается на выборе проекта.
  await page.getByRole('button', { name: /^e2e / }).first().click()
  await expect(page.getByRole('textbox', { name: /Message|Сообщение/ })).toBeVisible({
    timeout: 120000
  })
  page = await roster(page)

  await expect(rosterRow(page, 'Смета')).toBeVisible({ timeout: 60000 })
  const smeta = await coreProfile(page, 'smeta')
  expect(smeta?.description).toContain('сметчик')
  expect(smeta?.ui_meta?.['hermes-bots']?.title).toBe('Смета')
  const card = await openCard(page, 'Смета')
  expect(await card.getByRole('textbox').nth(1).inputValue()).toContain('сметчик')
  await card.getByRole('button', { name: /^Отмена$/ }).click()
})

// ───────────────────────────── 37.3 Возможности ───────────────────────────────

test('37.7.1 модель выбирается парой «провайдер · модель»', async () => {
  const page = await ui()
  const card = await openCard(page, 'Смета')
  await openCapabilities(card)
  await modelDropdowns(card)

  await expect(card.getByText(/^(Provider|Провайдер)$/)).toBeVisible()
  await expect(card.getByText(/^(Model|Модель)$/)).toBeVisible()
  const smeta = await coreProfile(page, 'smeta')
  await expect(card.getByRole('combobox').nth(0)).toContainText(String(smeta?.provider))
  await expect(card.getByRole('combobox').nth(1)).toContainText(String(smeta?.model))
})

// ИЗВЕСТНОЕ РАСХОЖДЕНИЕ — D-109 в TASKS, решает владелец. Их выбор модели
// показывает ВСЕ провайдеры каталога (на живом ядре 54, из них 46 без ключа);
// фильтра по ключам в нём нет. Требование чек-листа осталось от нашего прежнего
// роестра. Проверка оставлена целиком: включается снятием `fixme`.
test.fixme('37.7.2 провайдеров, к которым нет ключа, в списке нет', async () => {
  const page = await ui()
  const card = page.getByRole('dialog', { name: 'Изменить профиль', exact: true })
  await card.getByRole('combobox').nth(0).click()
  const shown: string[] = []
  for (const option of await page.getByRole('option').all()) {
    const slug = /\(([a-z0-9-]+)\)\s*$/.exec((await option.innerText()).trim())?.[1]
    if (slug) shown.push(slug)
  }
  await page.keyboard.press('Escape')

  // «Без ключа» — провайдер, у которого в каталоге ядра есть переменные для
  // ключа, и ни одна не задана. Флаг `authenticated` из `model.options` для
  // этого не годится: ядро ставит его всем подряд. Ответ `/api/env` содержит
  // и частично скрытые значения ключей, поэтому он разбирается ВНУТРИ окна, а
  // наружу выходят только имена провайдеров.
  const withoutKey = await page.evaluate(async () => {
    const env = (await window.aecpilot.gatewayRest('/api/env')) as Record<
      string,
      { is_set?: boolean; provider?: string }
    >
    const keyed = new Set<string>()
    const needKey = new Set<string>()
    for (const row of Object.values(env)) {
      if (!row?.provider) continue
      needKey.add(row.provider)
      if (row.is_set) keyed.add(row.provider)
    }
    return [...needKey].filter((slug) => !keyed.has(slug))
  })
  console.log(`37.7.2: в списке ${shown.length}, без ключа по каталогу ${withoutKey.length}`)
  expect(withoutKey.length, 'проверка не пустая: такие провайдеры есть').toBeGreaterThan(0)
  expect(
    shown.filter((slug) => withoutKey.includes(slug)),
    'в списке нет провайдеров без ключа'
  ).toEqual([])
})

test('37.7.3 в возможностях есть характер (SOUL), скилы и наборы инструментов', async () => {
  const page = await ui()
  const card = page.getByRole('dialog', { name: 'Изменить профиль', exact: true })
  // Окно осталось открытым после 37.7.1 (или 37.7.2, когда она включена).
  if (!(await card.isVisible())) await openCapabilities(await openCard(page, 'Смета'))
  await expect(card).toContainText('SOUL.md')
  expect(await card.locator('textarea').last().inputValue()).toContain('Смета')
  await expect(card.getByRole('button', { name: /^Навыки/ }).first()).toBeVisible()
  await expect(card.getByRole('button', { name: /^Инструменты/ }).first()).toBeVisible()
  await card.getByRole('button', { name: /^Отмена$/ }).click()
  await expect(card).toBeHidden()
})

test('37.8.1 неприменившийся раздел назван по имени, сообщения об успехе нет', async () => {
  const page = await ui()
  const providerBefore = (await coreProfile(page, 'smeta'))?.provider
  const card = await openCard(page, 'Смета')
  await openCapabilities(card)

  // Модель без провайдера — раздел, который не применится: их код сам
  // помечает его неприменённым, ничего не отправляя. Вход в ручной ввод —
  // пункт «Enter manually…» списка провайдеров.
  await modelDropdowns(card)
  await card.getByRole('combobox').nth(0).click()
  await page.getByRole('option', { name: /Enter manually/ }).click()
  const provider = card.getByPlaceholder(/omnirouter/).first()
  await expect(provider).toBeVisible({ timeout: 15000 })
  await provider.fill('')
  const model = card
    .getByText(/^Model \(Custom\)/)
    .locator('xpath=..')
    .locator('input')
  await model.fill('gpt-5-mini')

  await card.getByRole('button', { name: /^Сохранить$/ }).click()
  await expect(page.getByRole('alert').filter({ hasText: /failed: model/ })).toBeVisible({
    timeout: 30000
  })
  await expect(page.getByRole('status').filter({ hasText: /updated/ })).toHaveCount(0)
  expect((await coreProfile(page, 'smeta'))?.provider, 'в ядре ничего не сломалось').toBe(
    providerBefore
  )
})

test('37.9.1 «Клонировать с»: настройки скопировались', async () => {
  const page = await roster(await ui())
  // Источник клона отличается от умолчания по-настоящему: заведён без скилов.
  // Клон со «Сметы» проверял бы копирование не отличимо от «взял умолчание».
  await rpc(page, 'profiles.create', {
    name: 'filler1',
    description: 'наполнитель',
    clone_from: null,
    no_skills: true
  })
  await expect(rosterRow(page, 'Filler1')).toBeVisible({ timeout: 60000 })
  const source = await coreProfile(page, 'filler1')
  const main = await coreProfile(page, 'default')
  expect(source?.skill_count, 'источник отличается от умолчания').not.toBe(main?.skill_count)

  await createSpecialist(page, {
    name: 'smeta-kopiya',
    title: 'Смета копия',
    description: 'второй сметчик',
    cloneFrom: 'filler1'
  })
  const clone = await coreProfile(page, 'smeta-kopiya')
  expect(clone?.skill_count, 'скилы как у источника').toBe(source?.skill_count)
  expect(clone?.provider).toBe(source?.provider)
  expect(clone?.model).toBe(source?.model)
})

test('37.4.1 поиск «сметчик» находит по роли, а не только по имени', async () => {
  const page = await roster(await ui())
  // Поле поиска у них появляется от восьми строк; до стольких список
  // добивается специалистами, заведёнными прямо в ядре.
  for (let i = 2; i <= 6; i += 1) {
    await rpc(page, 'profiles.create', {
      name: `filler${i}`,
      description: 'наполнитель',
      clone_from: null,
      no_skills: true
    })
  }
  const search = page.getByRole('textbox', { name: /Поиск по специалистам/ })
  await expect(search).toBeVisible({ timeout: 60000 })
  await search.fill('сметчик')
  await expect(rosterRow(page, 'Смета')).toBeVisible()
  await expect(rosterRow(page, 'Filler2')).toBeHidden()
  await expect(rosterRow(page, 'AECPilot')).toBeHidden()
  await search.fill('')
  await expect(rosterRow(page, 'Filler2')).toBeVisible()
})

// ───────────────────────────── 37.5 Рутины ────────────────────────────────────

test('37.14.1 рутина из карточки появилась в его списке', async () => {
  const page = await ui()
  await openRoutinesOf(page, 'Смета')
  await page.getByRole('button', { name: 'Новый cron' }).first().click()
  const dialog = page.getByRole('dialog').last()
  await expect(dialog).toContainText('Новая cron-задача')
  await expect(dialog).toContainText('Смета')
  await dialog.getByRole('textbox').nth(0).fill('Сводка по смете')
  await dialog.getByRole('textbox').nth(1).fill('Собери короткую сводку по смете')
  await dialog.getByRole('button', { name: /^Создать cron$/ }).click()
  await expect(dialog).toBeHidden({ timeout: 30000 })
  await expect(page.getByText('Сводка по смете', { exact: true })).toBeVisible({ timeout: 30000 })
})

test('30.7.1 рутина есть у одного специалиста, и её нет у двух других', async () => {
  const page = await ui()
  for (const other of ['Filler1', 'AECPilot']) {
    await openRoutinesOf(page, other)
    await expect(
      page.getByText('Сводка по смете', { exact: true }),
      `у «${other}» рутины «Сметы» нет`
    ).toHaveCount(0)
  }
  await openRoutinesOf(page, 'Смета')
  await expect(page.getByText('Сводка по смете', { exact: true })).toBeVisible({ timeout: 30000 })
})

test('37.14.2 у другого специалиста её нет — у него свой пустой список', async () => {
  const page = await ui()
  await openRoutinesOf(page, 'Filler1')
  await expect(page.getByText('Сводка по смете', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Запланированных задач пока нет')).toBeVisible()
})

// ───────────────────────────── 37.6 Скрытие ───────────────────────────────────

let faceBeforeHide: Record<string, unknown> = {}

/** Подсказка `@` в поле ввода — строки всплывающего списка. */
async function mentionSuggestions(page: Page, prefix: string): Promise<string> {
  // Поиск подсказок идёт через сессию открытого чата: пока чат «пробуждается»,
  // сессии ещё нет, и список висит на «Ищем…».
  await expect(page.getByText(/^Пробуждаем/)).toHaveCount(0, { timeout: 180000 })
  const composer = page.getByRole('textbox', { name: /Message|Сообщение/ }).last()
  await composer.click()
  await composer.pressSequentially(`@${prefix}`)
  const list = page.locator('[data-slot="composer-completion-drawer"]')
  await expect(list).toBeVisible({ timeout: 15000 })
  // Сначала в списке крутится индикатор — строки приходят следом.
  await expect(list).toContainText('@', { timeout: 60000 })
  const text = await list.innerText()
  await page.keyboard.press('Escape')
  await composer.fill('')
  return text
}

test('37.16.1 скрытый специалист исчез из списка, появилась кнопка скрытых', async () => {
  const page = await roster(await ui())
  faceBeforeHide = await coreFace(page, 'smeta')
  await rosterRow(page, 'AECPilot').click()
  expect(await mentionSuggestions(page, 'sm'), 'до скрытия подсказка есть').toContain('@smeta')

  await rosterRow(page, 'Смета').click({ button: 'right' })
  await page.getByRole('menuitem', { name: /^(Hide|Скрыть)$/ }).click()
  await expect(rosterRow(page, 'Смета')).toBeHidden({ timeout: 15000 })
  await expect(page.getByRole('button', { name: /^(Hidden|Скрытые)(\s|$)/ })).toBeVisible()
})

test('37.16.3 в подсказке @ скрытый по-прежнему предлагается', async () => {
  const page = await ui()
  expect(await mentionSuggestions(page, 'sm')).toContain('@smeta')
})

test('37.17.1 возвращён той же кнопкой — со всеми настройками', async () => {
  const page = await ui()
  await page.getByRole('button', { name: /^(Hidden|Скрытые)(\s|$)/ }).click()
  await rosterRow(page, 'Смета').click({ button: 'right' })
  await page.getByRole('menuitem', { name: /^(Unhide|Вернуть|Показать)/ }).click()
  await expect(page.getByRole('button', { name: /^(Hidden|Скрытые)(\s|$)/ })).toBeHidden({
    timeout: 15000
  })
  await expect(rosterRow(page, 'Смета')).toBeVisible()
  // Все настройки, что были до скрытия, на месте. Новые поля (их отметки о
  // скрытии и возврате) сравнением не считаются.
  const after = await coreFace(page, 'smeta')
  const added = Object.keys(after).filter((key) => !(key in faceBeforeHide))
  console.log('37.17.1: добавились поля', JSON.stringify(added))
  expect(after).toMatchObject(faceBeforeHide)
  expect(after.hidden, 'отметка скрытия снята').toBeFalsy()
  await expect(rosterRow(page, 'Смета').locator('img').first()).toBeVisible()
})
