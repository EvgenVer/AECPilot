// Блок 46 чек-листа (задача 3F.9) на ЖИВОМ ядре: предпросмотр — перерисовка,
// браузер, правка, масштаб. Страницы открывает агент (их `desktop_preview`,
// отложенный — через `tool_call`, см. D-123); дальше проверяется окно и сами
// гостевые страницы. Детерминированные половины тех же задач (3E.24–3E.26,
// 3E.31) проверены на заглушке в `donor-shell-smoke.spec.ts`.

import { readFileSync, writeFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test, type ElectronApplication, type Page } from '@playwright/test'

import { hideFirstRunSurfaces, mainWindow, openProject, standFixture } from '../lib/app'
import { record } from '../lib/evidence'
import { recordChatEvents, turn } from '../lib/turn'

test.describe.configure({ mode: 'serial' })

const stand = standFixture({ mode: 'live', label: 'model-46' })

let projectOpened = false

async function ui(): Promise<Page> {
  const page = await mainWindow(stand.get())
  await hideFirstRunSurfaces(page)
  if (!projectOpened) {
    const dir = stand.get().projectDir
    writeFileSync(join(dir, 'a.html'), '<h1>STRANICA A ODIN</h1>', 'utf8')
    writeFileSync(join(dir, 'b.html'), '<h1>STRANICA B</h1>', 'utf8')
    writeFileSync(
      join(dir, 'form.html'),
      '<h1>Zayavka na zamer</h1><input id="code" placeholder="Шифр"><button id="ok" ' +
        'onclick="document.getElementById(\'echo\').textContent=\'PRINYATO: \'+document.getElementById(\'code\').value">Принять</button>' +
        '<p id="echo"></p>',
      'utf8'
    )
    writeFileSync(join(dir, 'zametka.md'), 'PERVAYA VERSIYA\n', 'utf8')
    await openProject(stand.get(), page)
    projectOpened = true
  }
  await recordChatEvents(page)
  return page
}

/** Выполнить код в гостевой странице предпросмотра, чей адрес содержит `part`. */
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

const guestText = (app: ElectronApplication, part: string) =>
  guestEval<string>(app, 'document.body.innerText', part)

async function openInPreview(page: Page, file: string): Promise<void> {
  await turn(
    page,
    `Открой файл ${join(stand.get().projectDir, file)} во встроенном предпросмотре — инструментом desktop_preview (action open, url — ровно этот путь; инструмент отложен, вызови через tool_call). Ответь одним словом «открыто».`,
    { expectTool: /desktop_preview|tool_call/ }
  )
}

test('46.1.1 правка файла на диске перерисовывает панель сама', async () => {
  const page = await ui()
  const app = stand.get().app
  await openInPreview(page, 'b.html')
  await expect.poll(() => guestText(app, 'b.html'), { timeout: 60000 }).toContain('STRANICA B')
  await openInPreview(page, 'a.html')
  await expect.poll(() => guestText(app, 'a.html'), { timeout: 60000 }).toContain('STRANICA A ODIN')
  // Метка в обеих страницах: перезагрузка её стирает.
  await guestEval(app, 'window.__mark = 1', 'a.html')
  expect(await guestEval(app, 'window.__mark = 1', 'b.html'), 'b.html открыта рядом').toBe(1)

  writeFileSync(join(stand.get().projectDir, 'a.html'), '<h1>STRANICA A DVA</h1>', 'utf8')
  await expect.poll(() => guestText(app, 'a.html'), { timeout: 60000 }).toContain('STRANICA A DVA')
  expect(await guestEval(app, 'window.__mark ?? null', 'a.html'), 'a.html перезагружена').toBeNull()
  await record(test.info(), page)
})

test('46.1.2 перерисовалась только та панель, где показывали', async () => {
  const app = stand.get().app
  expect(await guestEval(app, 'window.__mark', 'b.html'), 'b.html не перезагружалась').toBe(1)
})

// D-126: у вкладки ФАЙЛА кнопки «в браузер» нет нигде — в строке
// предпросмотра её место занимает «Вынести в окно», а пункт меню вкладки
// «Open in external» положен только вкладкам с адресом. Путь 3E.26 проверен на
// карточке артефакта (`donor-shell-smoke.spec.ts`). Решение — владельцу.
test.fixme('46.2.1 «Открыть в браузере» отдаёт ОС файл из нашей папки', async () => {
  const page = await ui()
  const app = stand.get().app
  await app.evaluate(({ shell }) => {
    const bag = globalThis as unknown as { openedExternally?: string[] }
    bag.openedExternally = []
    shell.openExternal = (async (url: string) => {
      bag.openedExternally?.push(url)
    }) as never
  })
  // В строке предпросмотра этой кнопки у нас нет: её место занимает «Вынести
  // в окно» (отдельные окна у приложения есть). Во внешний браузер вкладку
  // отдаёт меню самой вкладки.
  const tab = page.getByRole('tab', { name: /a\.html|STRANICA A/ }).first()
  await expect(tab).toBeVisible({ timeout: 20000 })
  await tab.click({ button: 'right' })
  await page.getByRole('menuitem', { name: /Open in external|во внешнем/i }).click()
  const opened = () =>
    app.evaluate(() => (globalThis as unknown as { openedExternally?: string[] }).openedExternally ?? [])
  await expect.poll(opened, { timeout: 30000 }).toHaveLength(1)
  const [url] = await opened()
  console.log('46.2 url ' + url)
  expect(url.startsWith('file:///'), 'файлом, а не произвольным адресом').toBe(true)
  const path = fileURLToPath(url)
  const ours = [stand.get().projectDir, stand.get().userDataDir].some((root) =>
    path.toLowerCase().startsWith((root + sep).toLowerCase())
  )
  expect(ours, `${path} — из папки проекта или приложения`).toBe(true)
  await record(test.info(), page)
})

test('46.3.1 правка в их редакторе доезжает на диск по показанному пути', async () => {
  const page = await ui()
  await openInPreview(page, 'zametka.md')
  const edit = page.getByRole('button', { name: /^(Изменить|Edit)$/ }).last()
  await expect(edit).toBeVisible({ timeout: 30000 })
  await edit.click()
  const editor = page.locator('.cm-content').last()
  await expect(editor).toBeVisible()
  await editor.click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type('VTORAYA STROKA')
  await page.getByRole('button', { name: /^(Сохранить|Save)$/ }).last().click()
  await expect
    .poll(() => readFileSync(join(stand.get().projectDir, 'zametka.md'), 'utf8'), { timeout: 20000 })
    .toContain('VTORAYA STROKA')
  await record(test.info(), page)
})

test('46.4.1 при масштабе 125 % нажатие агента попадает в цель', async () => {
  const page = await ui()
  const app = stand.get().app
  const applied = await page.evaluate(async () => {
    window.aecpilot.setZoomPercent(125)
    return window.aecpilot.getZoom()
  })
  expect(applied?.percent, 'масштаб применился').toBe(125)
  try {
    await openInPreview(page, 'form.html')
    await expect.poll(() => guestText(app, 'form.html'), { timeout: 60000 }).toContain('Zayavka na zamer')
    const result = await turn(
      page,
      'В открытой странице предпросмотра form.html впиши в поле «Шифр» значение AR-12 и нажми кнопку «Принять» — инструментом drive_preview (он отложен, вызови через tool_call). Ответь одним словом «готово».',
      { expectTool: /drive_preview|tool_call/ }
    )
    console.log('46.4 ' + result.transcript)
    await expect
      .poll(() => guestText(app, 'form.html'), { timeout: 30000 })
      .toContain('PRINYATO: AR-12')
    await record(test.info(), page, { transcript: result.transcript })
  } finally {
    await page.evaluate(() => window.aecpilot.setZoomPercent(100))
  }
})
