// Блок 14 чек-листа (задача 3F.8) на ЖИВОМ ядре — ветка «ключа нет»: профиль
// стенда скопирован без `.env`, ядру нечем отвечать, и поверх поднимается их
// экран подключения провайдера. Ключ здесь не вводится — ни настоящий, ни
// подставной: шаги 2–3 проверяют только, что мастер отдаёт этот шаг их экрану и
// не заводит своей формы. «Первые три шага отмечены сами» (14.4.1) проверяется
// на стенде с ключом — `live-14-wizard.spec.ts`.

import { expect, test, type Locator, type Page } from '@playwright/test'

import { mainWindow, openProject, standFixture } from '../lib/app'

test.describe.configure({ mode: 'serial' })

const stand = standFixture({ mode: 'live', label: 'live-14-nokey', withoutProviderKey: true })

function guide(page: Page): Locator {
  return page.getByRole('region', { name: 'С чего начать' })
}

type StepState = 'current' | 'done' | 'skipped' | 'waiting'

async function stepState(page: Page, label: string): Promise<StepState> {
  const row = guide(page).locator('li').filter({ hasText: label })
  const icon = (await row.locator('span.codicon').getAttribute('class')) ?? ''
  if (icon.includes('codicon-pass-filled')) return 'done'
  if (icon.includes('codicon-arrow-right')) return 'current'
  if (icon.includes('codicon-circle-slash')) return 'skipped'
  return 'waiting'
}

/** Их экран подключения провайдера — полноэкранный слой онбординга. */
function providerScreen(page: Page): Locator {
  return page.getByText('Подключите провайдера модели, чтобы начать общение.', { exact: false })
}

let page: Page

test('14.1.2 «1. Проект» отмечен, текущий шаг — «Ключ провайдера»', async () => {
  page = await mainWindow(stand.get())
  await openProject(stand.get(), page)
  await expect(guide(page)).toBeAttached({ timeout: 60000 })
  await expect.poll(() => stepState(page, 'Проект'), { timeout: 30000 }).toBe('done')
  await expect.poll(() => stepState(page, 'Ключ провайдера'), { timeout: 30000 }).toBe('current')
})

test('14.2.1 их экран поверх, «выберу позже» — мастер на месте, шаг тот же', async () => {
  await expect(providerScreen(page)).toBeVisible({ timeout: 60000 })
  await page.getByRole('button', { name: 'Выберу провайдера позже' }).click()
  await expect(providerScreen(page)).toBeHidden({ timeout: 15000 })
  await expect(guide(page)).toBeVisible()
  await expect.poll(() => stepState(page, 'Ключ провайдера')).toBe('current')
})

test('14.3.1 «Подключить провайдера» в мастере открывает тот же их экран', async () => {
  await guide(page).getByRole('button', { name: 'Подключить провайдера' }).click()
  await expect(providerScreen(page)).toBeVisible({ timeout: 15000 })
  // Своей формы для ключа у мастера нет: в его панели нет поля ввода.
  await expect(guide(page).getByRole('textbox')).toHaveCount(0)
})
