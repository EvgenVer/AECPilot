// Путь владельца на приёмке 2026-10-08 (D-192, D-193), на ЖИВОМ ядре, профиль без
// ключа: первый запуск с ключом OpenAI до «Начать», затем вход по подписке из
// «Настройки → Провайдеры → Аккаунты» в той же сессии.
//
// D-193 (7.3.1): «Изменить» на шаге модели показывал список, снятый до ключа, —
// без OpenAI. D-192: после «Начать» их окно подключения оставалось растворённым,
// и окно входа по подписке рисовалось прозрачным — код выдан, а не виден.
//
// Ключ — заведомо фиктивный: список моделей OpenAI ядро отдаёт из своего кэша, и
// ходов модели здесь нет. Наружу уходит один запрос — ядро получает у OpenAI код
// входа, — и вход тут же отменяется. Браузер не открывается: `openExternal`
// подменён.
import { expect, test, type Locator, type Page } from '@playwright/test'

import { mainWindow, openProject, standFixture } from '../lib/app'

test.describe.configure({ mode: 'serial' })
const stand = standFixture({ mode: 'live', label: 'live-07-sub', withoutProviderKey: true })

/** Их окно подключения провайдера — полноэкранный слой онбординга. */
function onboarding(page: Page): Locator {
  return page.locator('[class*="z-(--z-onboarding)"]')
}

let page: Page

test('D-193 ключ OpenAI-API в первом запуске: «Изменить» показывает модели OpenAI', async () => {
  page = await mainWindow(stand.get())
  await openProject(stand.get(), page)
  await stand.get().app.evaluate(({ shell }) => {
    shell.openExternal = (async () => undefined) as never
  })

  const ob = onboarding(page)
  await ob
    .getByRole('button', { name: /^OpenAI-API/ })
    .first()
    .click({ timeout: 60000 })
  await ob.locator('input').last().fill('sk-e2e-not-a-real-key-000000')
  await ob
    .getByRole('button', { name: /^(Подключить|Connect)$/ })
    .last()
    .click()

  const change = ob.getByRole('button', { name: /^(Изменить|Change)$/ }).first()
  await expect(change).toBeVisible({ timeout: 120000 })
  await change.click()
  const picker = page.getByRole('dialog').last()
  // Число — каталог ядра (0.21.5 — 20 моделей, 0.22.2 — 22): позиция про то, что
  // моделей OpenAI не ноль, а не про их счёт на текущем пине.
  await expect(picker.getByText(/openai-api · [1-9]\d*/)).toBeVisible({
    timeout: 30000
  })
  await page.keyboard.press('Escape')
  await expect(picker).toBeHidden()
})

test('D-192 после «Начать» вход по подписке из настроек показывает код', async () => {
  const ob = onboarding(page)
  // Надпись «Начать» печатается по буквам — кнопка находится, когда она устоялась.
  const begin = ob.locator('button', { hasText: 'Начать' }).first()
  await expect(begin).toBeVisible({ timeout: 30000 })
  const reloaded = page.waitForEvent('load', { timeout: 30000 })
  await begin.click()
  await reloaded

  await page.evaluate(() => {
    location.hash = '#/settings?tab=providers&pview=accounts'
  })
  const more = page.getByRole('button', { name: 'Другие провайдеры' })
  const row = page.getByRole('button', { name: /^ChatGPT or Codex Subscription/ }).first()
  await expect(more.or(row).first()).toBeVisible({ timeout: 60000 })
  if (await more.isVisible()) await more.click()
  await row.click()

  await expect(ob.getByText('Введите там этот код', { exact: false })).toBeVisible({
    timeout: 60000
  })
  await expect(ob).toHaveCSS('opacity', '1')
  await expect(ob).not.toHaveClass(/pointer-events-none/)

  await ob.getByRole('button', { name: /^(Отмена|Cancel)$/ }).click()
  await expect(ob.getByText('Введите там этот код', { exact: false })).toBeHidden({
    timeout: 15000
  })
})
