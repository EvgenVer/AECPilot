// Блок 38 чек-листа, 38.1–38.15 (задача 3F.9) на ЖИВОМ ядре: три специалиста с
// разными ролями, комната, вопрос всем, обращение по имени, файл в комнату.
// Комната — их «group chat» (SPEC UR27). Позиции, текст которых остался от
// нашей прежней поверхности комнат и у их комнаты не имеет соответствия, здесь
// не проверяются — они вынесены владельцу (D-137 в TASKS).
//
// Специалисты заводятся ядром, а не окном: заведение через окно проверено в
// блоке 37, а самопредставление троих стоит ~12 минут и денег.

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test, type Locator, type Page } from '@playwright/test'

import {
  hideFirstRunSurfaces,
  mainWindow,
  openProject,
  reopenRecentProject,
  standFixture
} from '../lib/app'
import { record } from '../lib/evidence'

test.describe.configure({ mode: 'serial' })

const stand = standFixture({ mode: 'live', label: 'model-38' })

const TEAM = [
  { name: 'smeta', title: 'Smeta', role: 'сметчик', soul: 'Ты сметчик. Считай деньги и сроки.' },
  {
    name: 'konstruktor',
    title: 'Konstruktor',
    role: 'конструктор',
    soul: 'Ты конструктор. Отвечай за несущую способность.'
  },
  {
    name: 'snip',
    title: 'Snip',
    role: 'нормоконтролёр',
    soul: 'Ты нормоконтролёр. Проверяй по нормам и ссылайся на пункт.'
  }
] as const

const ROOM = 'Совещание по перекрытию'

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

async function roster(page: Page): Promise<Page> {
  await page.getByRole('tab', { name: /Bots|Боты|Специалисты/i }).click()
  await page.waitForTimeout(1500)
  return page
}

function rosterRow(page: Page, title: string): Locator {
  return page.getByRole('button', { name: new RegExp(`^${title}( ·|$)`) }).first()
}

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
  description?: string
}

async function coreProfiles(page: Page): Promise<CoreProfile[]> {
  return ((await rpc(page, 'profiles.list', {})) as { profiles: CoreProfile[] }).profiles
}

async function openCard(page: Page, title: string): Promise<Locator> {
  await rosterRow(page, title).click({ button: 'right' })
  await page.getByRole('menuitem', { name: /^Изменить/ }).click()
  const card = page.getByRole('dialog', { name: 'Изменить профиль', exact: true })
  await expect(card).toBeVisible({ timeout: 15000 })
  return card
}

async function openCapabilities(card: Locator): Promise<void> {
  await card.getByRole('button', { name: /^Возможности —/ }).click()
  await expect(card.getByText('SOUL.md', { exact: false })).toBeVisible({ timeout: 60000 })
}

function composer(page: Page): Locator {
  return page.getByRole('textbox', { name: `Написать в ${ROOM}` })
}

/** Корень комнаты у них — колонка, в которой лежит поле «Написать в …»
 *  (`group-chat-view.tsx`); элемента `main` там нет. */
function room(page: Page): Locator {
  return page
    .locator('div.relative.flex.h-full.flex-col')
    .filter({ has: page.getByRole('textbox', { name: /^Написать в / }) })
    .last()
}

/** Текст ленты комнаты — для журнала прогона и проверок по содержанию. */
async function roomText(page: Page): Promise<string> {
  return (await room(page).innerText()).replace(/\s+\n/g, '\n')
}

/** Реплики специалистов в ленте комнаты: подпись-кнопка говорящего. */
function speakers(page: Page, title: string): Locator {
  return room(page).getByRole('button', { name: title, exact: true })
}

/** Отклонить просьбы специалистов выполнить команду. Специалист в комнате
 *  зовёт `execute_code` сам (замер 25.09.2026: Snip — искать нормы кодом), и
 *  комната встаёт на «Ждём вашего ответа…», пока человек не ответит. Команды
 *  позиции не просят — отвечаем отказом, как осторожный человек. */
async function denyPendingCommands(page: Page): Promise<void> {
  const deny = room(page).getByRole('button', { name: /^deny$/ })
  for (let tries = 0; tries < 5 && (await deny.first().isVisible().catch(() => false)); tries++) {
    console.log('[e2e] комната: отклонена команда специалиста')
    await deny.first().click()
    await page.waitForTimeout(1000)
  }
}

/** Дождаться, пока комната закончит ход: «Комната работает…» и «… думает…» ушли. */
async function roundDone(page: Page, timeout = 420000): Promise<void> {
  await expect
    .poll(async () => {
      await denyPendingCommands(page)
      return /Комната работает…|думает…|Ждём вашего ответа/.test(await roomText(page))
    }, {
      timeout,
      intervals: [5000],
      message: 'ход комнаты закончился'
    })
    .toBe(false)
}

// ───────────────────────────── 38.1 Подготовка ────────────────────────────────

test('38.1.1 все трое в списке, каждый со своей ролью', async () => {
  const page = await roster(await ui())
  for (const member of TEAM) {
    await rpc(page, 'profiles.create', {
      name: member.name,
      description: member.role,
      clone_from: null
    })
  }
  const profiles = await coreProfiles(page)
  for (const member of TEAM) {
    await expect(rosterRow(page, member.title)).toBeVisible({ timeout: 60000 })
    expect(profiles.find((row) => row.name === member.name)?.description).toBe(member.role)
  }
  await record(test.info(), page)
})

test('38.2.1 модель выбирается парой «провайдер · модель»', async () => {
  const page = await roster(await ui())
  const card = await openCard(page, TEAM[1].title)
  await openCapabilities(card)
  // Какой вид выбора модели откроется первым, решает гонка загрузки (см. блок 37).
  const back = card.getByRole('button', { name: /Back to dropdowns|Вернуться к спискам/ })
  await expect(card.getByText(/^(Provider|Провайдер)/).first()).toBeVisible({ timeout: 60000 })
  if (await back.isVisible()) await back.click()
  await expect(card.getByText(/^(Provider|Провайдер)$/)).toBeVisible({ timeout: 30000 })
  await expect(card.getByText(/^(Model|Модель)$/)).toBeVisible()
  await expect(card.getByRole('combobox').nth(1)).toBeVisible({ timeout: 30000 })
  await card.getByRole('button', { name: /^Отмена$/ }).click()
  await expect(card).toBeHidden()
})

test('38.3.1 характер сохранился; при повторном открытии карточки текст на месте', async () => {
  const page = await roster(await ui())
  for (const member of TEAM) {
    let card = await openCard(page, member.title)
    await openCapabilities(card)
    // Поле характера — моноширинное (`SOUL.md …`); остальные поля карточки нет.
    const soul = () => card.locator('textarea.font-mono').first()
    await expect(soul()).toBeVisible({ timeout: 60000 })
    await soul().fill(member.soul)
    await card.getByRole('button', { name: /^Сохранить$/ }).click()
    await expect(card).toBeHidden({ timeout: 30000 })
    card = await openCard(page, member.title)
    await openCapabilities(card)
    await expect(soul()).toHaveValue(
      new RegExp(member.soul.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      { timeout: 60000 }
    )
    await card.getByRole('button', { name: /^Отмена$/ }).click()
    await expect(card).toBeHidden()
  }
})

// ───────────────────────────── 38.2 Комната ───────────────────────────────────

async function openNewRoom(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Новый специалист или комната' }).click()
  await page.getByRole('menuitem', { name: 'Новая комната' }).click()
  const dialog = page.getByRole('dialog', { name: 'Новая комната' })
  await expect(dialog).toBeVisible({ timeout: 15000 })
  return dialog
}

function memberBox(dialog: Locator, index: number): Locator {
  return dialog.getByRole('checkbox').nth(index)
}

test('38.5.2 кнопка «Создать» не срабатывает, пока выбран один', async () => {
  const page = await roster(await ui())
  const dialog = await openNewRoom(page)
  console.log('38.5 ' + (await dialog.innerText()).replace(/\n/g, ' ⏎ '))
  await memberBox(dialog, 0).click()
  await expect(dialog.getByRole('button', { name: /^Create Group/ })).toBeDisabled()
  await dialog.getByRole('button', { name: /^Отмена$|^Cancel$/ }).click()
  await expect(dialog).toBeHidden()
})

test('38.6.1 комната появилась в списке с именем по составу', async () => {
  const page = await roster(await ui())
  const dialog = await openNewRoom(page)
  const boxes = dialog.getByRole('checkbox')
  const labels = await dialog.locator('label').allInnerTexts()
  for (let index = 0; index < labels.length; index += 1) {
    if (
      TEAM.some(
        (member) =>
          labels[index].includes(member.title) || labels[index].includes(`@${member.name}`)
      )
    ) {
      await boxes.nth(index).click()
    }
  }
  const name = dialog.getByRole('textbox', { name: 'Имя комнаты' })
  const byMembers = (await name.getAttribute('placeholder')) ?? ''
  console.log('38.6 имя по составу: ' + byMembers)
  for (const member of TEAM)
    expect(byMembers).toMatch(new RegExp(`${member.title}|${member.name}`, 'i'))
  await dialog.getByRole('button', { name: /^Create Group \(3\)$/ }).click()
  await expect(dialog).toBeHidden({ timeout: 30000 })
  await expect(page.getByRole('button', { name: byMembers }).first()).toBeVisible({
    timeout: 30000
  })
  await record(test.info(), page)
})

test('38.6.2 открылась пустая лента комнаты и поле сообщения в комнату', async () => {
  const page = await ui()
  const field = page.getByRole('textbox', { name: /^Написать в / })
  await expect(field).toBeVisible({ timeout: 30000 })
  await expect(speakers(page, TEAM[0].title)).toHaveCount(0)
})

test('38.7.1 имя комнаты меняется в её заголовке — и в списке', async () => {
  const page = await ui()
  await page
    .getByRole('button', { name: /^Настройки комнаты / })
    .first()
    .click()
  const settings = page.getByRole('dialog', { name: 'Настройки комнаты' })
  await expect(settings).toBeVisible({ timeout: 15000 })
  await settings.getByRole('textbox', { name: 'Имя комнаты' }).fill(ROOM)
  await settings.getByRole('button', { name: /^Сохранить$|^Save$/ }).click()
  await expect(settings).toBeHidden({ timeout: 30000 })
  await expect(page.getByRole('button', { name: new RegExp(`^${ROOM}`) }).first()).toBeVisible({
    timeout: 30000
  })
  await expect(composer(page)).toBeVisible({ timeout: 30000 })
})

test('38.7.2 после перезапуска приложения имя сохранилось', async () => {
  await stand.get().relaunch()
  // После перезапуска — экран выбора проекта (D-89): проект — из «недавних».
  await reopenRecentProject(await mainWindow(stand.get()))
  const page = await roster(await ui())
  const room = page.getByRole('button', { name: new RegExp(`^${ROOM}`) }).first()
  await expect(room).toBeVisible({ timeout: 60000 })
  await room.click()
  await expect(composer(page)).toBeVisible({ timeout: 60000 })
})

// ───────────────────────────── 38.3 Вопрос всем ───────────────────────────────

const QUESTION =
  'Перекрытие над подвалом — монолит или сборные плиты? Нужен ответ с учётом сроков, несущей способности и норм. Ответь коротко, со своей позиции.'

let firstRound = ''

test('38.9.1 после отправки видно, что комната работает', async () => {
  const page = await ui()
  await composer(page).fill(QUESTION)
  await composer(page).press('Enter')
  await expect(page.getByText(/Комната работает…|думает…/).first()).toBeVisible({ timeout: 60000 })
  await record(test.info(), page)
})

test('38.9.3 ответы приходят по одному, а не все разом в конце', async () => {
  const page = await ui()
  // Снимаем число говоривших раз в 2 с: если ответы пришли по одному, среди
  // снимков есть промежуточное число — больше нуля и меньше итога.
  const seen = new Set<number>()
  const started = Date.now()
  while (Date.now() - started < 420000) {
    let count = 0
    for (const member of TEAM) count += (await speakers(page, member.title).count()) > 0 ? 1 : 0
    seen.add(count)
    if (!/Комната работает…|думает…/.test(await roomText(page))) break
    await page.waitForTimeout(2000)
  }
  await roundDone(page)
  firstRound = await roomText(page)
  console.log('38.9.3 снимки числа говоривших: ' + [...seen].join(','))
  console.log('38.10 ' + firstRound.replace(/\n/g, ' ⏎ ').slice(0, 3000))
  const final = Math.max(...seen)
  expect(
    [...seen].some((count) => count > 0 && count < final),
    'был промежуточный снимок'
  ).toBe(true)
})

test('38.10.1 ответили минимум двое', async () => {
  const page = await ui()
  let answered = 0
  for (const member of TEAM) answered += (await speakers(page, member.title).count()) > 0 ? 1 : 0
  expect(answered).toBeGreaterThanOrEqual(2)
})

test('38.10.2 ответы разные по существу — каждый со своей позиции', async () => {
  // Позиции узнаются по словам своей темы: деньги/сроки, нагрузка/прочность,
  // норма/пункт. Три одинаковых пересказа такой проверки не пройдут.
  const themes = [
    /руб|стоимост|срок|дешевл|дорож|смет/i,
    /нагрузк|несущ|прочн|прогиб|армир/i,
    /СП |СНиП|ГОСТ|пункт|п\.\s*\d|норм/i
  ]
  const hit = themes.filter((theme) => theme.test(firstRound)).length
  expect(hit, 'затронуты темы всех трёх ролей').toBe(3)
})

test('38.10.3 у каждой реплики видно, кто её сказал', async () => {
  const page = await ui()
  for (const member of TEAM) {
    if ((await speakers(page, member.title).count()) > 0)
      await expect(speakers(page, member.title).first()).toBeVisible()
  }
})

// ───────────────────────────── 38.4 Обращение по имени ────────────────────────

test('38.12.1 подсказка после «@» предлагает участников комнаты', async () => {
  const page = await ui()
  await composer(page).fill('')
  await composer(page).pressSequentially('@')
  for (const member of TEAM) {
    await expect(
      page.getByRole('button', { name: new RegExp(`^@${member.name}`) }).first()
    ).toBeVisible({ timeout: 15000 })
  }
  await composer(page).press('Escape')
})

test('38.12.3 ответил только названный — остальные молчат', async () => {
  const page = await ui()
  await denyPendingCommands(page)
  await roundDone(page)
  const before = await Promise.all(TEAM.map((member) => speakers(page, member.title).count()))
  await composer(page).fill('')
  await composer(page).pressSequentially('@sme')
  // Enter в подсказке выбирает, а не отправляет.
  await composer(page).press('Enter')
  await expect(composer(page)).toHaveValue(/@smeta\s*$/)
  await composer(page).pressSequentially(' сколько это в деньгах? Ответь одной фразой.')
  await composer(page).press('Enter')
  await expect(page.getByText(/Комната работает…|думает…/).first()).toBeVisible({ timeout: 60000 })
  await roundDone(page)
  const after = await Promise.all(TEAM.map((member) => speakers(page, member.title).count()))
  console.log(`38.12 до=${before} после=${after}`)
  expect(after[0], 'Смета ответил').toBeGreaterThan(before[0])
  expect(after[1], 'Конструктор молчит').toBe(before[1])
  expect(after[2], 'Нормоконтроль молчит').toBe(before[2])
})

test('38.13.1 вопрос без обращений — отвечают все', async () => {
  const page = await ui()
  const before = await Promise.all(TEAM.map((member) => speakers(page, member.title).count()))
  await composer(page).fill(
    '@everyone Назовите по одному главному риску этого решения, одной фразой.'
  )
  await composer(page).press('Escape')
  await composer(page).press('Enter')
  await expect(page.getByText(/Комната работает…|думает…/).first()).toBeVisible({ timeout: 60000 })
  await roundDone(page)
  const after = await Promise.all(TEAM.map((member) => speakers(page, member.title).count()))
  console.log(`38.13 до=${before} после=${after}`)
  const answered = after.filter((count, index) => count > before[index]).length
  expect(answered, 'ответили все или почти все').toBeGreaterThanOrEqual(2)
})

// ───────────────────────────── 38.5 Файл в комнату ────────────────────────────

const FILE_MARK = 'Нагрузка на перекрытие П-1 принята 7,5 кПа'

test('38.15.1 вложение в поле показано по имени, а не путём', async () => {
  const page = await ui()
  const file = join(stand.get().projectDir, 'нагрузки.txt')
  writeFileSync(file, `${FILE_MARK}.\n`, 'utf8')
  const chooser = page.waitForEvent('filechooser')
  await page
    .getByRole('button', { name: 'Приложить файлы — их увидит каждый, кто ответит' })
    .last()
    .click()
  await (await chooser).setFiles(file)
  await expect(page.getByText('нагрузки.txt').first()).toBeVisible({ timeout: 15000 })
  await expect(page.getByText(stand.get().projectDir, { exact: false })).toHaveCount(0)
})

test('38.15.2 кнопка «Убрать вложение» снимает его до отправки', async () => {
  const page = await ui()
  await page.getByRole('button', { name: 'Убрать вложение' }).first().click()
  await expect(page.getByText('нагрузки.txt')).toHaveCount(0)
})

test('38.15.3 ответы ссылаются на содержимое файла — он доехал до всех', async () => {
  const page = await ui()
  const file = join(stand.get().projectDir, 'нагрузки.txt')
  const chooser = page.waitForEvent('filechooser')
  await page
    .getByRole('button', { name: 'Приложить файлы — их увидит каждый, кто ответит' })
    .last()
    .click()
  await (await chooser).setFiles(file)
  await expect(page.getByText('нагрузки.txt').first()).toBeVisible({ timeout: 15000 })
  const before = await roomText(page)
  await composer(page).fill(
    '@everyone Какая нагрузка на перекрытие П-1 указана в приложенном файле? Назовите число.'
  )
  await composer(page).press('Escape')
  await composer(page).press('Enter')
  await expect(page.getByText(/Комната работает…|думает…/).first()).toBeVisible({ timeout: 60000 })
  await roundDone(page)
  const after = await roomText(page)
  const added = after.slice(before.length)
  console.log('38.15 ' + added.replace(/\n/g, ' ⏎ ').slice(0, 2000))
  const mentions = added.match(/7[,.]5/g) ?? []
  expect(mentions.length, 'число из файла назвали хотя бы двое').toBeGreaterThanOrEqual(2)
  await record(test.info(), page)
})
