// Блоки 36 и 41 чек-листа (задача 3F.8) на ЖИВОМ ядре: внешние каналы (список,
// раскрытие перед включением, экран вебхуков) и доступы Microsoft Graph.
// Ходов модели здесь нет.
//
// Имя теста начинается с номера позиции — по нему сходятся чек-лист, отчёт и
// счётчик покрытия.

import { expect, test, type Page } from '@playwright/test'

import {
  clearNotifications,
  hideFirstRunSurfaces,
  mainWindow,
  openProject,
  standFixture
} from '../lib/app'

test.describe.configure({ mode: 'serial' })

const stand = standFixture({ mode: 'live', label: 'live-36-41' })

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

async function goto(page: Page, hash: string): Promise<void> {
  await page.evaluate((next) => {
    location.hash = next
  }, hash)
  await page.waitForTimeout(2500)
}

/** Наш короткий список каналов глазами ЭКРАНА: тот же вызов, что делает их
 *  страница, — через мост, где стоит отбор. */
async function shownChannels(page: Page): Promise<ChannelRow[]> {
  const answer = await page.evaluate(() => {
    const bridge = (
      window as unknown as { hermesDesktop: { api: (r: unknown) => Promise<unknown> } }
    ).hermesDesktop
    return bridge.api({ path: '/api/messaging/platforms' })
  })
  return (answer as { platforms: ChannelRow[] }).platforms
}

interface ChannelRow {
  id: string
  name: string
  enabled: boolean
}

/** Все платформы, которые знает ядро, — мимо отбора. */
async function coreChannels(page: Page): Promise<string[]> {
  const answer = (await page.evaluate(() =>
    window.aecpilot.gatewayRest('/api/messaging/platforms')
  )) as { platforms: { id: string }[] }
  return answer.platforms.map((row) => row.id)
}

/** Выбрать канал в списке слева. */
async function pickChannel(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name, exact: true }).first().click()
  await page.waitForTimeout(800)
}

/** Тумблер включения выбранного канала. */
function channelSwitch(page: Page, name: string) {
  return page.getByRole('switch', { name: `Включить ${name}` })
}

/** Наше окно раскрытия перед включением канала. */
function disclosure(page: Page) {
  return page.getByRole('dialog').filter({ hasText: /Открыть канал/ })
}

test('36.1.1 в списке восемь каналов: Telegram, почта, вебхук, A2A, Teams, уведомления Graph, Signal, WhatsApp', async () => {
  const page = await ui()
  await goto(page, '#/messaging')

  const shown = await shownChannels(page)
  expect(shown.map((row) => row.id).sort()).toEqual(
    ['a2a', 'email', 'msgraph_webhook', 'signal', 'teams', 'telegram', 'webhook', 'whatsapp'].sort()
  )
  for (const name of [
    'Telegram',
    'Email',
    'Webhooks',
    'A2A',
    'Microsoft Teams',
    'Microsoft Graph Webhook',
    'Signal',
    'WhatsApp'
  ]) {
    await expect(
      page.getByRole('button', { name, exact: true }).first(),
      `карточка «${name}»`
    ).toBeVisible({ timeout: 15000 })
  }
})

test('36.1.2 незнакомых каналов в списке нет — это отбор, а не пропажа', async () => {
  const page = await ui()

  // Ядро их ЗНАЕТ — иначе проверка доказывала бы только то, что их нет вообще.
  const core = await coreChannels(page)
  for (const id of ['wecom', 'qqbot', 'dingtalk', 'weixin']) {
    expect(core, `ядро знает ${id}`).toContain(id)
  }

  const shown = (await shownChannels(page)).map((row) => row.id)
  for (const id of ['wecom', 'qqbot', 'dingtalk', 'weixin', 'discord', 'slack']) {
    expect(shown, `на экране нет ${id}`).not.toContain(id)
  }
  const text = await page.locator('body').innerText()
  expect(text).not.toMatch(/WeChat|DingTalk|QQ\b/i)
})

test('36.2.1 включённый канал виден всегда — даже не из короткого списка', async () => {
  const page = await ui()

  // Включается канал ВНЕ короткого списка: ровно тот случай, ради которого
  // правило и написано. Через ядро напрямую — так же, как его включили бы
  // из командной строки или из их дашборда, мимо нашего экрана.
  await page.evaluate(() =>
    window.aecpilot.gatewayRest('/api/messaging/platforms/ntfy', {
      method: 'PUT',
      body: { enabled: true }
    })
  )
  await goto(page, '#/')
  await goto(page, '#/messaging')

  const shown = await shownChannels(page)
  expect(
    shown.map((row) => row.id),
    'включённый канал показан'
  ).toContain('ntfy')
  expect(shown.find((row) => row.id === 'ntfy')?.enabled).toBe(true)

  // Вернуть как было: дальше проверяется отказ, и лишний включённый канал
  // сбил бы счёт.
  await page.evaluate(() =>
    window.aecpilot.gatewayRest('/api/messaging/platforms/ntfy', {
      method: 'PUT',
      body: { enabled: false }
    })
  )
})

test('36.3.1 тумблер Telegram: вопрос со списком, что уходит с машины', async () => {
  const page = await ui()
  await goto(page, '#/messaging')
  await pickChannel(page, 'Telegram')
  await channelSwitch(page, 'Telegram').click()

  const dialog = disclosure(page)
  await expect(dialog).toBeVisible({ timeout: 15000 })
  // D-107: заголовок называет канал именем с его карточки, а не id из конфига.
  await expect(dialog).toContainText('Открыть канал Telegram?')
  await expect(dialog, 'что уходит: переписка').toContainText('всё сказанное в сессиях')
  await expect(dialog, 'доступ к файлам').toContainText('читает и пишет файлы vault')
  await expect(dialog, 'запуск снаружи').toContainText('возможность запустить его снаружи')
})

test('36.3.2 отказ возвращает тумблер назад, канал не включён', async () => {
  const page = await ui()
  await disclosure(page)
    .getByRole('button', { name: /^Отмена$/ })
    .click()
  await expect(disclosure(page)).toBeHidden({ timeout: 15000 })

  await expect(channelSwitch(page, 'Telegram')).toHaveAttribute('aria-checked', 'false')
  const shown = await shownChannels(page)
  expect(shown.find((row) => row.id === 'telegram')?.enabled, 'ядро канал не включило').toBe(false)
})

test('36.4.1 у A2A в списке два дополнительных пункта: порт 9900 и та же живая сессия', async () => {
  const page = await ui()
  await pickChannel(page, 'A2A')
  await channelSwitch(page, 'A2A').click()

  const dialog = disclosure(page)
  await expect(dialog).toBeVisible({ timeout: 15000 })
  await expect(dialog, 'открытый порт').toContainText('открытый сетевой порт на этой машине')
  await expect(dialog).toContainText('9900')
  await expect(dialog, 'та же живая сессия').toContainText('попадает в ТУ ЖЕ живую сессию')

  await dialog.getByRole('button', { name: /^Отмена$/ }).click()
  await expect(dialog).toBeHidden({ timeout: 15000 })
})

// Задача 3G.28: карточки Signal и WhatsApp, у каждой свой перечень по коду адаптера.
test('36.5.1 у Signal два дополнительных пункта: демон signal-cli и «любой, кто напишет»', async () => {
  const page = await ui()
  await pickChannel(page, 'Signal')
  await channelSwitch(page, 'Signal').click()

  const dialog = disclosure(page)
  await expect(dialog).toBeVisible({ timeout: 15000 })
  await expect(dialog, 'демон на машине').toContainText('демон signal-cli')
  await expect(dialog).toContainText('127.0.0.1:8080')
  await expect(dialog, 'любой в личку').toContainText('доходит ЛЮБОЙ')

  await dialog.getByRole('button', { name: /^Отмена$/ }).click()
  await expect(dialog).toBeHidden({ timeout: 15000 })
})

test('36.5.2 у WhatsApp два дополнительных пункта: сессия в профиле и риск для номера', async () => {
  const page = await ui()
  await pickChannel(page, 'WhatsApp')
  await channelSwitch(page, 'WhatsApp').click()

  const dialog = disclosure(page)
  await expect(dialog).toBeVisible({ timeout: 15000 })
  await expect(dialog, 'сессия в профиле').toContainText('вошедшую сессию WhatsApp')
  await expect(dialog).toContainText('npm')
  await expect(dialog, 'риск для номера').toContainText('рискует ограничением')

  await dialog.getByRole('button', { name: /^Отмена$/ }).click()
  await expect(dialog).toBeHidden({ timeout: 15000 })
})

test('36.5.3 отказ у Signal и WhatsApp возвращает тумблер назад, канал не включён', async () => {
  const page = await ui()
  for (const name of ['Signal', 'WhatsApp']) {
    await pickChannel(page, name)
    await channelSwitch(page, name).click()
    const dialog = disclosure(page)
    await expect(dialog).toBeVisible({ timeout: 15000 })
    await dialog.getByRole('button', { name: /^Отмена$/ }).click()
    await expect(dialog).toBeHidden({ timeout: 15000 })
  }

  const shown = await shownChannels(page)
  for (const id of ['signal', 'whatsapp']) {
    expect(shown.find((row) => row.id === id)?.enabled, `${id} не включён`).toBe(false)
  }
})

// ──────────────────── Блок 41. Доступы Microsoft Graph ───────────────────────

const GRAPH_FIELDS = ['MSGRAPH_TENANT_ID', 'MSGRAPH_CLIENT_ID', 'MSGRAPH_CLIENT_SECRET'] as const

/** НАШЕ окно доступов — по имени самого окна, а не по тексту внутри: строка
 *  «Доступы Microsoft Graph» встречается и в палитре команд, а палитра тоже
 *  `dialog`, и отбор по тексту молча брал бы её. */
function graphDialog(page: Page) {
  return page.getByRole('dialog', { name: 'Доступы Microsoft Graph', exact: true })
}

test('41.1.1 в палитре есть команда «Доступы Microsoft Graph», она открывает окно', async () => {
  const page = await ui()
  await goto(page, '#/')
  await page.keyboard.press('Control+k')
  const palette = page.getByRole('dialog').last()
  await expect(palette).toBeVisible()
  await page.keyboard.type('Graph')
  await page.waitForTimeout(400)
  await expect(palette).toContainText('Доступы Microsoft Graph')

  // Строку палитры запускают с клавиатуры: щелчок по ней перехватывает их же
  // обёртка списка. Выделение после набора встаёт не всегда — поэтому стрелкой
  // доходим до нужной строки и только тогда жмём ввод. Ввод по невыделенному
  // списку не делает НИЧЕГО, и на этом тест однажды получил тихий зелёный:
  // палитра осталась открытой, а окно доверия искалось по тексту, который есть
  // и в палитре.
  const selected = palette.locator('[role="option"][data-selected="true"]')
  for (let step = 0; step < 10; step += 1) {
    if ((await selected.count()) > 0 && /Доступы Microsoft Graph/.test(await selected.innerText()))
      break
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(150)
  }
  await expect(selected).toHaveText(/Доступы Microsoft Graph/)
  await page.keyboard.press('Enter')

  await expect(graphDialog(page)).toBeVisible({ timeout: 15000 })
})

test('41.2.1 три поля с именами переменных и состоянием каждого', async () => {
  const page = await ui()
  const dialog = graphDialog(page)
  for (const field of GRAPH_FIELDS) {
    await expect(dialog, `поле ${field}`).toContainText(field)
  }
  await expect(dialog).toContainText('Идентификатор тенанта (каталога)')
  await expect(dialog).toContainText('Идентификатор приложения (client ID)')
  await expect(dialog).toContainText('Секрет приложения')
  expect(
    (await dialog.innerText()).match(/не задан|задан/g)?.length,
    'состояние у каждого из трёх'
  ).toBeGreaterThanOrEqual(3)
})

test('41.2.2 сказано, что это учётные данные приложения и достают они данные организации', async () => {
  const page = await ui()
  await expect(graphDialog(page)).toContainText(
    'Это учётные данные приложения, а не вход под собой'
  )
  await expect(graphDialog(page)).toContainText('данные вашей организации')
})

test('41.2.3 «чего ещё не хватает» называет два плагина и канал уведомлений', async () => {
  const page = await ui()
  const dialog = graphDialog(page)
  await expect(dialog).toContainText('Чего ещё не хватает')
  await expect(dialog, 'плагин разбора встреч').toContainText('teams_pipeline')
  await expect(dialog, 'плагин канала Teams').toContainText('teams-platform')
  await expect(dialog, 'канал уведомлений').toContainText('канал уведомлений Microsoft Graph')
})

test('41.2.4 сказано, что окно не обращается к Microsoft', async () => {
  const page = await ui()
  await expect(graphDialog(page)).toContainText('не обращается к Microsoft')
})

/** Задан ли ключ — по ответу главного процесса, а не по тексту на экране.
 *
 * Читать состояние из текста нельзя: «не задан» КОНЧАЕТСЯ на «задан», и
 * проверка «строка заканчивается на „задан“» была зелёной всегда — на этом
 * 41.3.1 один раз получила тихий зелёный. */
async function graphKeySet(page: Page, envVar: string): Promise<boolean> {
  const state = (await page.evaluate(() => window.aecpilot.getGraphAccess())) as {
    keys: { envVar: string; hasKey: boolean }[]
  }
  return state.keys.find((key) => key.envVar === envVar)?.hasKey === true
}

test('41.3.1 сохранение: состояние стало «задан», о перезапуске ядра сказано заранее', async () => {
  const page = await ui()
  const dialog = graphDialog(page)

  // Предупреждение о перезапуске стоит в окне ДО нажатия, а не всплывает после.
  await expect(dialog, 'цена названа заранее').toContainText(
    'ядро перезапускается — разговор остаётся, идущая работа прерывается'
  )

  expect(await graphKeySet(page, 'MSGRAPH_TENANT_ID'), 'до сохранения ключа нет').toBe(false)
  await dialog.getByRole('textbox', { name: 'Идентификатор тенанта (каталога)' }).fill('e2e-tenant')
  await dialog
    .getByRole('button', { name: /^Сохранить$/ })
    .first()
    .click()

  // Ядро перезапускается — ждём, пока значение доедет.
  await expect
    .poll(() => graphKeySet(page, 'MSGRAPH_TENANT_ID'), {
      timeout: 180000,
      intervals: [2000],
      message: 'значение сохранено'
    })
    .toBe(true)
  await expect(dialog.getByText('задан', { exact: true }).first()).toBeVisible({ timeout: 30000 })
})

test('41.3.2 «Удалить» возвращает состояние в «не задан»', async () => {
  const page = await ui()
  const dialog = graphDialog(page)

  // Кнопка «Удалить» есть только у поля, где ключ ЗАДАН, — значит она одна.
  await dialog.getByRole('button', { name: /^Удалить$/ }).click()

  await expect
    .poll(() => graphKeySet(page, 'MSGRAPH_TENANT_ID'), {
      timeout: 180000,
      intervals: [2000],
      message: 'значение удалено'
    })
    .toBe(false)
  await expect(
    dialog.locator('section').filter({ hasText: 'MSGRAPH_TENANT_ID' }),
    'в самом окне состояние вернулось'
  ).toContainText('не задан', { timeout: 30000 })

  await dialog
    .getByRole('button', { name: /^Закрыть$/ })
    .first()
    .click()
  await expect(dialog).toBeHidden({ timeout: 15000 })
})

test('41.4.1 в списке каналов есть карточки «Microsoft Teams» и «Microsoft Graph Webhook»', async () => {
  const page = await ui()
  await goto(page, '#/messaging')

  const shown = (await shownChannels(page)).map((row) => row.id)
  expect(shown).toContain('teams')
  expect(shown).toContain('msgraph_webhook')
  // Список у ядра (выше) и карточки на странице — разные моменты: с донором
  // 0.22.2 страница дольше держит «Загрузка платформ сообщений…».
  await expect(page.getByRole('button', { name: 'Microsoft Teams', exact: true })).toBeVisible({
    timeout: 30000
  })
  await expect(
    page.getByRole('button', { name: 'Microsoft Graph Webhook', exact: true })
  ).toBeVisible({ timeout: 30000 })
})

test('41.5.1 тумблер «Microsoft Graph Webhook»: порт 8646, звонит сам Microsoft, права на тенант', async () => {
  const page = await ui()
  await pickChannel(page, 'Microsoft Graph Webhook')
  await channelSwitch(page, 'Microsoft Graph Webhook').click()

  const dialog = disclosure(page)
  await expect(dialog).toBeVisible({ timeout: 15000 })
  await expect(dialog, 'порт приёмника').toContainText('8646')
  await expect(dialog, 'звонит сам Microsoft').toContainText('в машину звонит сам Microsoft')
  await expect(dialog, 'права приложения на тенант').toContainText('достаёт данные ТЕНАНТА')
})

test('41.5.2 «Отмена» — канал остался выключенным', async () => {
  const page = await ui()
  await disclosure(page)
    .getByRole('button', { name: /^Отмена$/ })
    .click()
  await expect(disclosure(page)).toBeHidden({ timeout: 15000 })

  await expect(channelSwitch(page, 'Microsoft Graph Webhook')).toHaveAttribute(
    'aria-checked',
    'false'
  )
  const shown = await shownChannels(page)
  expect(shown.find((row) => row.id === 'msgraph_webhook')?.enabled).toBe(false)
})

// ───────────────── Блок 36, вторая половина: экран вебхуков ──────────────────
//
// Экран приехал с кодом донора. На 22.09.2026 он ПО-РУССКИ: их собственный
// каталог `i18n/ru.ts` его покрывает. Оговорка чек-листа «экран на английском —
// это не замечание» устарела; строка в чек-листе поправлена задачей 3F.8.

/** Строка состояния: её контекстное меню включает значки. */
function statusBar(page: Page) {
  return page.locator('[data-slot="status-bar"], footer').first()
}

test('36.7.1 экран вебхуков открывается из строки состояния и показывает список подписок', async () => {
  const page = await ui()
  await goto(page, '#/')

  // Другого входа нет — ни палитры, ни настроек; так устроено у донора.
  // Значок включается правым щелчком по строке состояния.
  await statusBar(page).click({ button: 'right' })
  const menu = page.getByRole('menu').last()
  await expect(menu).toBeVisible({ timeout: 15000 })
  await menu.getByRole('menuitemcheckbox', { name: /Webhooks|Вебхуки/ }).click()
  // Меню с галочками остаётся открытым — оно перекрывает строку состояния.
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden({ timeout: 15000 })

  await page
    .getByRole('contentinfo')
    .getByRole('button', { name: /Вебхуки/ })
    .first()
    .click()
  await page.waitForTimeout(1500)

  // Список подписок, а не пустое место: либо заголовок со счётчиком, либо
  // предложение включить приёмник — и то и другое содержимое.
  await expect(page.getByText(/Подписки \(\d+\)|Приёмник вебхуков отключён/).first()).toBeVisible({
    timeout: 30000
  })
})

// 36.8.2 идёт ДО 36.8.1: цену надо увидеть, пока приёмник ещё выключен.
// Задача 3F.D4 (D-105): наш вопрос из моста перед `POST /api/webhooks/enable`.
test('36.8.2 цена перезапуска названа ДО нажатия, а не после', async () => {
  const page = await ui()

  const enable = page.getByRole('button', { name: 'Включить вебхуки' })
  await expect(enable, 'приёмник на стенде выключен — иначе цену не увидеть').toBeVisible({
    timeout: 30000
  })
  // Прежние тосты спеки убираются ДО окна согласия: их стопка показывает сверху
  // старый («Не удалось обновить Telegram»), а новый прячет под «Показать ещё N»
  // (замер 30.09.2026). Щелчок по тосту поверх окна закрыл бы и само окно.
  await clearNotifications(page)
  await enable.click()

  const dialog = page.getByRole('dialog', { name: 'Включить приёмник вебхуков?' })
  await expect(
    dialog.getByText(/Ядро перезапустится — идущая работа агента прервётся/),
    'чем платим за перезапуск — сказано до перезапуска'
  ).toBeVisible({ timeout: 15000 })

  // Отказ: запрос не ушёл, приёмник остался выключен.
  await dialog.getByRole('button', { name: 'Отмена' }).click()
  await expect(dialog).toBeHidden()
  await expect(
    page.getByText('Приёмник не включён — вы отменили перезапуск ядра.').first()
  ).toBeVisible({ timeout: 15000 })
  await expect(enable).toBeVisible()
})

test('36.8.1 включение приёмника: сказано, что шлюз перезапускается', async () => {
  const page = await ui()

  const enable = page.getByRole('button', { name: 'Включить вебхуки' })
  if (await enable.isVisible().catch(() => false)) {
    await expect(
      page.getByText('Вебхуки — это отдельная платформа шлюза'),
      'сказано, что это отдельная платформа шлюза'
    ).toBeVisible()
    await enable.click()
    const dialog = page.getByRole('dialog', { name: 'Включить приёмник вебхуков?' })
    await expect(dialog, 'вопрос о перезапуске задан').toBeVisible({ timeout: 15000 })
    await dialog.getByRole('button', { name: 'Включить', exact: true }).click()
    await expect(dialog).toBeHidden()
  }

  // Ядро 0.21.2 перезапускает шлюз САМО, сразу по включению, и говорит об этом.
  // Отдельная кнопка «Перезапустить шлюз» появляется только если этот
  // перезапуск НЕ удался (`restart_started: false`) — поэтому она здесь и не
  // обязана быть. Строка чек-листа поправлена под это же (задача 3F.8).
  await expect(
    page.getByText(/шлюз перезапускается|шлюз всё ещё нужно перезапустить/).first(),
    'о перезапуске сказано'
  ).toBeVisible({ timeout: 60000 })

  // Приёмник действительно включился: экран перешёл к списку подписок.
  await expect(page.getByText(/Подписок вебхуков пока нет\.|Подписки \(\d+\)/).first()).toBeVisible(
    { timeout: 60000 }
  )
})

test('36.9.1 подписка создана: показаны адрес приёмника и секрет с пометкой «показывается один раз»', async () => {
  const page = await ui()
  await page.getByRole('button', { name: 'Новая подписка' }).first().click()
  await page.waitForTimeout(500)

  await page.getByRole('textbox', { name: 'Имя', exact: true }).first().fill('probe')
  await page
    .getByRole('button', { name: /^Создать$/ })
    .first()
    .click()

  await expect(page.getByText('Подписка создана')).toBeVisible({ timeout: 30000 })
  await expect(page.getByText('URL вебхука')).toBeVisible()
  await expect(page.getByText('Секрет (показывается один раз)')).toBeVisible()
  await expect(
    page.getByText('Скопируйте секрет сейчас — он показывается только один раз.')
  ).toBeVisible()
})

test('36.9.2 секрет больше нигде не появляется — ни в списке, ни в карточке', async () => {
  const page = await ui()
  const shown = await page.locator('body').innerText()
  const secret = /Секрет \(показывается один раз\)\s*([A-Za-z0-9_\-+/=]{16,})/.exec(shown)?.[1]
  expect(secret, 'секрет показан один раз и прочитан тестом').toBeTruthy()

  await page
    .getByRole('button', { name: /^Готово$/ })
    .first()
    .click()
  await page.waitForTimeout(1000)
  await page
    .getByRole('button', { name: /^probe$/ })
    .first()
    .click()
  await page.waitForTimeout(1000)

  expect(await page.locator('body').innerText(), 'секрета на экране больше нет').not.toContain(
    secret!
  )
})

/** Меню действий строки подписки. Кнопка называется «Actions» — их строка без
 *  перевода; русский проход по донорским экранам это задача 6.7. */
async function rowActions(page: Page) {
  await page.getByRole('button', { name: 'Actions' }).first().click()
  const menu = page.getByRole('menu').last()
  await expect(menu).toBeVisible({ timeout: 15000 })
  return menu
}

test('36.10.1 выключение подписки применяется сразу, без перезапуска', async () => {
  const page = await ui()
  const menu = await rowActions(page)
  await menu.getByRole('menuitem', { name: /^Отключить$/ }).click()

  await expect(page.getByText('Отключено: «probe»')).toBeVisible({ timeout: 30000 })
  await expect(
    page.getByRole('button', { name: /Перезапустить шлюз/ }),
    'перезапуска не просят'
  ).toHaveCount(0)
})

test('36.10.2 удаление спрашивает подтверждение', async () => {
  const page = await ui()
  const menu = await rowActions(page)
  await menu.getByRole('menuitem', { name: /^Удалить$/ }).click()

  const confirm = page.getByRole('dialog').filter({ hasText: 'Удалить вебхук' })
  await expect(confirm).toBeVisible({ timeout: 15000 })
  await expect(confirm).toContainText('Это действие необратимо')
  await confirm
    .getByRole('button', { name: /^Удалить$/ })
    .first()
    .click()
  await expect(page.getByText('Вебхук удалён')).toBeVisible({ timeout: 30000 })
})
