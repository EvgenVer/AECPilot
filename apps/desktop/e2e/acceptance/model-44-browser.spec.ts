// Блок 44 чек-листа (задача 3F.9) на ЖИВОМ ядре: встроенный браузер и рука
// агента в нём. Внешние адреса — example.com/example.org (стабильные страницы
// IANA); страница для руки агента — локальная, в проекте стенда, чтобы
// проверять, ЧТО он нажал и ввёл, без чужих сайтов.

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test, type ElectronApplication, type Page } from '@playwright/test'

import { hideFirstRunSurfaces, mainWindow, openProject, standFixture } from '../lib/app'
import { record } from '../lib/evidence'
import { eventCount, eventsSince, recordChatEvents, turn } from '../lib/turn'

test.describe.configure({ mode: 'serial' })

const stand = standFixture({ mode: 'live', label: 'model-44' })

let projectOpened = false

async function ui(): Promise<Page> {
  const page = await mainWindow(stand.get())
  await hideFirstRunSurfaces(page)
  if (!projectOpened) {
    writeFileSync(
      join(stand.get().projectDir, 'search.html'),
      '<h1>Katalog</h1><a id="more" href="#razdel" onclick="document.getElementById(\'log\').textContent+=\'KLIK;\'">Razdel kolonn</a>' +
        '<input id="q" placeholder="Поиск"><p id="log"></p>',
      'utf8'
    )
    await openProject(stand.get(), page)
    projectOpened = true
  }
  await recordChatEvents(page)
  return page
}

/** Адреса гостевых страниц предпросмотра (вкладок браузера) во всех окнах. */
function guestUrls(app: ElectronApplication): Promise<string[]> {
  return app.evaluate(({ webContents }) =>
    webContents
      .getAllWebContents()
      .filter((wc) => wc.getType() === 'webview' && !wc.isDestroyed())
      .map((wc) => wc.getURL())
  )
}

function guestEval<T>(app: ElectronApplication, code: string, part: string): Promise<T | null> {
  return app.evaluate(
    async ({ webContents }, { code, part }) => {
      const guest = webContents
        .getAllWebContents()
        .find((wc) => wc.getType() === 'webview' && wc.getURL().includes(part))
      if (!guest || guest.isDestroyed()) return null
      try {
        return (await guest.executeJavaScript(code)) as never
      } catch {
        return null
      }
    },
    { code, part }
  )
}

async function openUrl(page: Page, url: string): Promise<void> {
  await turn(
    page,
    `Открой ${url} во встроенном браузере — инструментом desktop_preview (action open, url — ровно этот адрес; инструмент отложен, вызови через tool_call). Ответь одним словом «открыто».`,
    { expectTool: /desktop_preview|tool_call/ }
  )
}

test('44.1.1 страница открывается в окне; адресная строка, назад и вперёд работают', async () => {
  const page = await ui()
  const app = stand.get().app
  await openUrl(page, 'https://example.com/')
  await expect
    .poll(() => guestEval<string>(app, 'document.body.innerText', 'example.com'), {
      timeout: 60000
    })
    .toContain('Example Domain')

  const address = page.getByRole('textbox', { name: 'Адрес' }).last()
  await address.click()
  await address.fill('https://example.org/')
  await address.press('Enter')
  await expect
    .poll(() => guestUrls(app), { timeout: 30000 })
    .toContainEqual(expect.stringContaining('example.org'))

  await page.getByRole('button', { name: 'Назад', exact: true }).last().click()
  await expect
    .poll(() => guestUrls(app), { timeout: 30000 })
    .toContainEqual(expect.stringContaining('example.com'))
  await page.getByRole('button', { name: 'Вперёд', exact: true }).last().click()
  await expect
    .poll(() => guestUrls(app), { timeout: 30000 })
    .toContainEqual(expect.stringContaining('example.org'))
  await record(test.info(), page)
})

test('44.2.1 вкладка выносится в отдельное окно и возвращается', async () => {
  const page = await ui()
  const app = stand.get().app
  // Гости `<webview>` Playwright тоже считает окнами — окно-оболочка
  // вынесенной вкладки узнаётся по адресу `?win=browser`.
  const shells = () => app.windows().filter((w) => w.url().includes('win=browser'))
  await page
    .getByRole('button', { name: /^(Pop out|Вынести в окно)$/ })
    .last()
    .click()
  await expect.poll(() => shells().length, { timeout: 30000 }).toBe(1)
  const popped = shells()[0]
  await popped.waitForLoadState()
  // Содержимое то же: гость в новом окне показывает тот же адрес.
  await expect
    .poll(() => guestUrls(app), { timeout: 30000 })
    .toContainEqual(expect.stringContaining('example.org'))
  // Их предложение «Stay signed in to your sites» (профиль браузера) ложится
  // поверх окна — отказываемся, как отказался бы человек.
  const notNow = popped.getByRole('button', { name: /^(Not now|Не сейчас)$/ })
  if (await notNow.isVisible({ timeout: 5000 }).catch(() => false)) await notNow.click()
  await popped.getByRole('button', { name: /^(Pop in|Вернуть)$/ }).click()
  await expect.poll(() => shells().length, { timeout: 30000 }).toBe(0)
  // Вкладка вернулась в панель главного окна (дефект D-128) — с тем же адресом.
  await expect
    .poll(() => guestUrls(app), { timeout: 30000 })
    .toContainEqual(expect.stringContaining('example.org'))
  await record(test.info(), page)
})

test('44.3.1 в ленте видно, что именно агент нажал и ввёл', async () => {
  const page = await ui()
  const app = stand.get().app
  await openUrl(page, join(stand.get().projectDir, 'search.html'))
  await expect
    .poll(() => guestEval<string>(app, 'document.body.innerText', 'search.html'), {
      timeout: 60000
    })
    .toContain('Katalog')
  const mark = await eventCount(page)
  const result = await turn(
    page,
    'На открытой странице search.html нажми ссылку «Razdel kolonn» и впиши в поле «Поиск» текст KOLONNA-7 — инструментом drive_preview (он отложен, вызови через tool_call). Ответь одним словом «готово».',
    { expectTool: /drive_preview|tool_call/ }
  )
  console.log('44.3 ' + result.transcript)
  // Действие дошло до страницы.
  await expect
    .poll(
      () =>
        guestEval<string>(
          app,
          "document.getElementById('log').textContent + '|' + document.getElementById('q').value",
          'search.html'
        ),
      { timeout: 30000 }
    )
    .toBe('KLIK;|KOLONNA-7')
  // И видно в ленте: вызов руки несёт, ЧТО нажато и ЧТО введено.
  const calls = JSON.stringify(
    (await eventsSince(page, mark)).filter((e) => e.type === 'tool.start')
  )
  expect(calls, 'в вызове видно введённое значение').toContain('KOLONNA-7')
  const cards = page
    .locator('[data-slot="aui_assistant-message-root"]')
    .last()
    .locator('[data-slot="tool-block"]')
  await expect(cards.first()).toBeVisible()
  const cardText = (await cards.allInnerTexts()).join(' | ')
  console.log('44.3 CARDS ' + cardText.slice(0, 800))
  await record(test.info(), page, { transcript: result.transcript })
})

test('44.4.1 облачные провайдеры браузера выключены и ключей не просят', async () => {
  const page = await ui()
  // Что знает ядро — REST набора, тот же ответ, что рисует их панель.
  const config = (await page.evaluate(() =>
    window.aecpilot.gatewayRest('/api/tools/toolsets/browser/config')
  )) as {
    providers: {
      badge: string
      env_vars: { is_set: boolean; key: string }[]
      is_active: boolean
      name: string
    }[]
  }
  console.log('44.4 ' + JSON.stringify(config.providers.map((p) => [p.name, p.badge, p.is_active])))
  // Облачный — платный или по подписке (метка ядра без «free»). «Browser Use»
  // помечен «free · local · cloud»: без ключа он работает локальным CLI, и ядро
  // по умолчанию включает именно его (`_browser_use_default_active`).
  const cloud = config.providers.filter((p) => !/free/i.test(p.badge))
  expect(
    cloud.map((p) => p.name),
    'облачные провайдеры в списке есть'
  ).toContainEqual(expect.stringMatching(/Browserbase/))
  expect(
    cloud.filter((p) => p.is_active).map((p) => p.name),
    'ни один облачный не включён'
  ).toEqual([])
  // Ключей нет — значит, и «Browser Use» не в облачном режиме. Смотрим только
  // признак `is_set`, значений ядро не отдаёт.
  const keys = config.providers.flatMap((p) => p.env_vars).filter((e) => /API_KEY/.test(e.key))
  expect(
    keys.filter((e) => e.is_set).map((e) => e.key),
    'ни один облачный ключ не задан'
  ).toEqual([])

  // Окно: набор раскрыт, провайдеры видны, поля ключа не показано.
  await page.evaluate(() => {
    window.location.hash = '#/capabilities'
  })
  const tools = page.getByRole('button', { name: /^(Tools|Инструменты)( \d+)?$/ }).first()
  await expect(tools).toBeVisible({ timeout: 30000 })
  await tools.click()
  const browser = page.getByRole('button', { name: /^Browser\b/ }).first()
  await expect(browser).toBeVisible({ timeout: 30000 })
  await browser.click()
  await expect(
    page.getByText(cloud.find((p) => /Browserbase/.test(p.name))!.name).first()
  ).toBeVisible({ timeout: 20000 })
  await expect(page.locator('input[type="password"]'), 'ключа не просят').toHaveCount(0)
  await record(test.info(), page)
})
