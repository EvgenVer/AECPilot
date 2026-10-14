// Блок 46 чек-листа (фаза 3L) на моке: то, что решает наш код и таблицы
// раскладок донора, а не модель.
//
// 46.2.x — задача 3L.2 (D-207, SPEC HX7-прим.): панели живой оболочки для
// человека нет — ни вкладки «Терминал», ни кнопки в строке состояния, ни строки
// Ctrl+K, а Ctrl+` ничего не открывает. Исполнение команд агентом с карточкой
// «Выполнить» проверяет живой блок 48.

import { expect, test, type Page } from '@playwright/test'

import { hideFirstRunSurfaces, mainWindow, openProject, standFixture } from '../lib/app'
import { record } from '../lib/evidence'

test.describe.configure({ mode: 'serial' })

const stand = standFixture({ mode: 'mock', label: 'blocks-46' })

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

/** Вкладка панели живой оболочки — так её называл донор. */
function terminalTab(page: Page) {
  return page.getByText(/^(Терминал|Terminal)$/)
}

test('55.2.1 вкладки «Терминал» нет, и Ctrl+` её не открывает', async () => {
  const page = await ui()
  await expect(page.getByRole('contentinfo')).toBeVisible()
  await expect(terminalTab(page)).toHaveCount(0)
  await page.keyboard.press('Control+Backquote')
  await page.keyboard.press('Control+Shift+Backquote')
  await page.waitForTimeout(1000)
  await expect(terminalTab(page)).toHaveCount(0)
  await expect(page.locator('.xterm')).toHaveCount(0)
  await record(test.info(), page)
})

test('55.2.2 в строке состояния нет кнопки «Терминал»', async () => {
  const page = await ui()
  const bar = page.locator('[data-slot="statusbar"]')
  await expect(bar.locator('button:has(svg.tabler-icon-terminal-2)')).toHaveCount(0)
  // Пункты строки, включаемые правым кликом, — там жил и переключатель.
  await bar.click({ button: 'right' })
  const menu = page.getByRole('menu').last()
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('menuitemcheckbox', { name: /^(Терминал|Terminal)$/ })).toHaveCount(0)
  await page.keyboard.press('Escape')
})

test('55.2.3 Ctrl+K не предлагает терминал', async () => {
  const page = await ui()
  await page.keyboard.press('Control+k')
  const palette = page.getByRole('dialog').last()
  await expect(palette).toBeVisible()
  for (const query of ['terminal', 'терминал']) {
    await page.keyboard.press('Control+a')
    await page.keyboard.type(query)
    await page.waitForTimeout(300)
    const text = await palette.innerText()
    expect(text, `палитра по запросу «${query}»`).not.toMatch(
      /Toggle terminal|Terminal deck|скрыть терминал|Новый терминал|New terminal/i
    )
  }
  await page.keyboard.press('Escape')
  await expect(palette).toBeHidden()
})
