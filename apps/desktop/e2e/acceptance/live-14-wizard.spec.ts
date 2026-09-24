// Блок 14 чек-листа (задача 3F.8) на ЖИВОМ ядре — ветка «ключ уже есть»: мастер
// «С чего начать» на новом проекте, когда ключ провайдера на машине уже лежит.
// Ветка «ключа нет» (их экран подключения поверх, «выберу позже», та же форма из
// мастера) — в `live-14-wizard-nokey.spec.ts`: ей нужен профиль без ключа.
//
// Ходов модели здесь нет: «Подставить вопрос» кладёт текст в поле и НЕ отправляет.

import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test, type Locator, type Page } from '@playwright/test'

import { mainWindow, standFixture, type Stand } from '../lib/app'

test.describe.configure({ mode: 'serial' })

// Ключ в хранилище приложения — индексации нужны эмбеддинги (D-117).
const stand = standFixture({ mode: 'live', label: 'live-14', providerKeyInStore: true })

/** Мастер — регион «С чего начать». Прятать его, как в остальных спеках
 *  (`hideFirstRunSurfaces`), здесь нельзя: он и есть предмет проверки. */
function guide(page: Page): Locator {
  return page.getByRole('region', { name: 'С чего начать' })
}

type StepState = 'current' | 'done' | 'skipped' | 'waiting'

/** Состояние шага — по значку строки, как его видит человек. */
async function stepState(page: Page, label: string): Promise<StepState> {
  const row = guide(page).locator('li').filter({ hasText: label })
  const icon = (await row.locator('span.codicon').getAttribute('class')) ?? ''
  if (icon.includes('codicon-pass-filled')) return 'done'
  if (icon.includes('codicon-arrow-right')) return 'current'
  if (icon.includes('codicon-circle-slash')) return 'skipped'
  return 'waiting'
}

/** Открыть новый проект на папке `dir` — тем же системным диалогом, что и
 *  человек (выбор подменён, создание — наш вызов окна). */
async function createProject(s: Stand, page: Page, dir: string, name: string): Promise<void> {
  await s.app.evaluate(({ dialog }, picked) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [picked] })) as never
  }, dir)
  expect(await page.evaluate(() => window.aecpilot.pickProjectDirectory())).toBe(dir)
  const created = await page.evaluate(
    ([path, title]) => window.aecpilot.createProject(path, title, true),
    [dir, name] as const
  )
  expect(created, JSON.stringify(created)).toMatchObject({ ok: true })
  await expect(page.getByRole('textbox', { name: /Message|Сообщение/ })).toBeVisible({
    timeout: 120000
  })
}

/** Следующий выбор папки в системном диалоге вернёт `dir`. */
async function pickNext(s: Stand, dir: string): Promise<void> {
  await s.app.evaluate(({ dialog }, picked) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [picked] })) as never
  }, dir)
}

const STEPS = [
  'Проект',
  'Ключ провайдера',
  'Модель',
  'Папка с документами',
  'Индексация',
  'Первый вопрос'
]

let page: Page

test('14.1.1 на новом проекте — панель «С чего начать» из шести шагов', async () => {
  page = await mainWindow(stand.get())
  await createProject(stand.get(), page, stand.get().projectDir, 'e2e')
  await expect(guide(page)).toBeVisible({ timeout: 30000 })
  const rows = guide(page).locator('li')
  await expect(rows).toHaveCount(6)
  expect((await rows.allInnerTexts()).map((text) => text.trim())).toEqual(
    STEPS.map((label, i) => `${i + 1}. ${label}`)
  )
  // «В правом нижнем углу»: панель прижата к правому и нижнему краю окна.
  const box = await guide(page).boundingBox()
  const size =
    page.viewportSize() ?? (await page.evaluate(() => ({ height: innerHeight, width: innerWidth })))
  expect(box, 'панель на экране').not.toBeNull()
  expect(size.width - (box!.x + box!.width)).toBeLessThan(40)
  expect(size.height - (box!.y + box!.height)).toBeLessThan(40)
})

test('14.4.1 ключ на машине уже есть — первые три шага отмечены сами', async () => {
  for (const label of ['Проект', 'Ключ провайдера', 'Модель']) {
    await expect.poll(() => stepState(page, label), { timeout: 30000 }).toBe('done')
  }
})

test('14.5.1 «Подключить папку» — шаг отмечен, текущей стала «Индексация»', async () => {
  // Десять таблиц по сотне строк: индексация идёт секунды, и «N / M» успевает
  // показаться. Формат — `.csv`: индексатор берёт только pdf/docx/xlsx/csv
  // (`aec_rag.parse.SUPPORTED_SUFFIXES`), записки `.md` он честно пропускает.
  const docs = mkdtempSync(join(tmpdir(), 'aecpilot-e2e-docs-'))
  for (let i = 1; i <= 10; i += 1) {
    const rows = ['Этаж;Щит;Нагрузка, кВт;Резерв, %']
    for (let r = 1; r <= 100; r += 1)
      rows.push(`${r};ЩР-${i}.${r};${(r * 1.5).toFixed(1)};${i * 10}`)
    writeFileSync(join(docs, `нагрузки-${i}.csv`), rows.join('\n') + '\n', 'utf8')
  }
  await pickNext(stand.get(), docs)
  await guide(page).getByRole('button', { name: 'Подключить папку' }).click()
  // Папка вне проекта — окно может спросить «подключить всё равно».
  const anyway = guide(page).getByRole('button', { name: 'Подключить всё равно' })
  await expect
    .poll(
      async () => {
        if (await anyway.isVisible()) await anyway.click()
        return stepState(page, 'Папка с документами')
      },
      { timeout: 30000 }
    )
    .toBe('done')
  await expect.poll(() => stepState(page, 'Индексация')).toBe('current')
})

// D-114: сразу после «Подключить папку» индексация видит файлы (раньше — только
// после скана по расписанию, через 5 минут). Прогресс «N / M» — первая половина
// позиции 14.6.1.
test('D-114: «Проиндексировать» сразу после подключения — «индексация N / M» по всем файлам', async () => {
  await page.evaluate(() => {
    const w = window as unknown as { __seen?: string[] }
    w.__seen = []
    const region = () => document.querySelector('[role="region"][aria-label="С чего начать"]')
    new MutationObserver(() => {
      const text = (region() as HTMLElement | null)?.innerText
      if (text) w.__seen?.push(text)
    }).observe(document.body, { characterData: true, childList: true, subtree: true })
  })
  await guide(page).getByRole('button', { name: 'Проиндексировать' }).click()
  await expect
    .poll(
      async () =>
        (
          (await page.evaluate(() => window.aecpilot.getIngestState())) as {
            lastReport?: { files_total: number } | null
            running: boolean
          }
        ).lastReport?.files_total ?? 0,
      { timeout: 180000 }
    )
    .toBe(10)
  const seen = await page.evaluate(() =>
    ((window as unknown as { __seen?: string[] }).__seen ?? []).join('\n')
  )
  expect(seen).toMatch(/индексация \d+ \/ 10/)
})

// Вторая половина позиции — «по окончании шаг отмечен». Эмбеддингам нужен
// ключ из НАШЕГО хранилища (D-115); стенд кладёт его туда (D-117).
test('14.6.1 по окончании индексации шаг отмечен галкой', async () => {
  await expect.poll(() => stepState(page, 'Индексация'), { timeout: 180000 }).toBe('done')
})

test('14.7.1 «Подставить вопрос» — вопрос в поле ввода, но НЕ отправлен', async () => {
  // Если индексация не закончилась (14.6.1 упала), откладываем — шаг
  // необязательный, и к «Первому вопросу» человек доходит так же.
  if ((await stepState(page, 'Индексация')) === 'current') {
    await guide(page).getByRole('button', { name: 'Позже' }).click()
  }
  await expect.poll(() => stepState(page, 'Первый вопрос')).toBe('current')
  await guide(page).getByRole('button', { name: 'Подставить вопрос' }).click()
  const composer = page.getByRole('textbox', { name: /Message|Сообщение/ })
  await expect(composer).toContainText('Перечисли документы', { timeout: 10000 })
  // Не отправлен: кнопка «Стоп» не появлялась, в ленте нет реплики человека.
  await page.waitForTimeout(3000)
  await expect(page.getByRole('button', { name: /^(Стоп|Stop)$/ })).toHaveCount(0)
  await expect(composer).toContainText('Перечисли документы')
})

test('14.7.2 после этого панель исчезает', async () => {
  await expect(guide(page)).toBeHidden({ timeout: 10000 })
})

test('14.8.1 перезапуск с тем же проектом — панели нет', async () => {
  await stand.get().relaunch()
  page = await mainWindow(stand.get())
  // Перезапуск открывается на выборе проекта — «тот же проект» выбирает человек.
  const recent = page.getByRole('button', { name: /^e2e / }).first()
  const composer = page.getByRole('textbox', { name: /Message|Сообщение/ })
  await expect(recent.or(composer).first()).toBeVisible({ timeout: 60000 })
  if (await recent.isVisible()) await recent.click()
  await expect(composer).toBeVisible({ timeout: 120000 })
  await page.waitForTimeout(5000)
  await expect(guide(page)).toBeHidden()
})

test('14.9.1 второй проект, «Позже» на папке — индексация «отложено», текущий — «Первый вопрос»', async () => {
  // Новый проект создаётся с экрана выбора проекта — туда приложение приходит
  // после перезапуска. Создание поверх открытого проекта окно не переключает.
  await stand.get().relaunch()
  page = await mainWindow(stand.get())
  await expect(page.getByRole('button', { name: /^e2e / }).first()).toBeVisible({
    timeout: 60000
  })
  const second = mkdtempSync(join(tmpdir(), 'aecpilot-e2e-project2-'))
  await createProject(stand.get(), page, second, 'e2e-2')
  await expect(guide(page)).toBeVisible({ timeout: 30000 })
  await expect
    .poll(() => stepState(page, 'Папка с документами'), { timeout: 30000 })
    .toBe('current')
  await guide(page).getByRole('button', { name: 'Позже' }).click()
  await expect.poll(() => stepState(page, 'Индексация')).toBe('skipped')
  await expect(guide(page).locator('li').filter({ hasText: 'Индексация' })).toContainText(
    'отложено'
  )
  await expect.poll(() => stepState(page, 'Первый вопрос')).toBe('current')
  await expect(guide(page).getByRole('button', { name: 'Проиндексировать' })).toHaveCount(0)
})

test('14.9.2 подставленный вопрос другой — про то, что агент умеет', async () => {
  const composer = page.getByRole('textbox', { name: /Message|Сообщение/ })
  // Неотправленный вопрос первого проекта поле хранит как черновик (их
  // поведение) — стираем его, как стёр бы человек, чтобы видеть только новый.
  await composer.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Delete')
  await expect(composer).toHaveText('')
  await guide(page).getByRole('button', { name: 'Подставить вопрос' }).click()
  await expect(composer).toContainText('Что ты умеешь делать в этом проекте', { timeout: 10000 })
  await expect(composer).not.toContainText('Перечисли документы')
})
