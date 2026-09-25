// Блоки 6, 15, 22 чек-листа (задача 3F.9) на ЖИВОМ ядре с ходами модели.
// Здесь пока блок 6 — чат. Блок 15 (выдержки) и 22 (вики) стоят на индексе
// документов, а у стенда индексации нет до решения D-117.

import { expect, test, type Page } from '@playwright/test'

import {
  hideFirstRunSurfaces,
  mainWindow,
  openProject,
  openTerminalPane,
  send,
  standFixture
} from '../lib/app'
import { record } from '../lib/evidence'
import { eventCount, eventsSince, recordChatEvents, turn, waitTurnEnd } from '../lib/turn'

test.describe.configure({ mode: 'serial' })

const stand = standFixture({ mode: 'live', label: 'model-06' })

let projectOpened = false

async function ui(): Promise<Page> {
  const page = await mainWindow(stand.get())
  await hideFirstRunSurfaces(page)
  if (!projectOpened) {
    await openProject(stand.get(), page)
    projectOpened = true
  }
  await recordChatEvents(page)
  return page
}

function lastAnswer(page: Page) {
  return page.locator('[data-slot="aui_assistant-message-root"]').last()
}

// ───────────────────────────── Блок 6. Чат ────────────────────────────────────

/** Текст ответа без блока рассуждений — снимки во время печати. Рассуждения
 *  печатаются отдельной свёрткой, и их недописанная разметка к позиции 6.1.2
 *  («ответ не мигает символами») не относится. */
async function watchAnswerStream(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __stream?: string[]; __streamObserver?: MutationObserver }
    w.__stream = []
    w.__streamObserver?.disconnect()
    const observer = new MutationObserver(() => {
      const all = document.querySelectorAll('[data-slot="aui_assistant-message-content"]')
      const last = all[all.length - 1] as HTMLElement | undefined
      if (!last) return
      const copy = last.cloneNode(true) as HTMLElement
      copy
        .querySelectorAll('[data-slot="aui_thinking-disclosure"]')
        .forEach((node) => node.remove())
      w.__stream?.push(copy.textContent ?? '')
    })
    observer.observe(document.body, { characterData: true, childList: true, subtree: true })
    w.__streamObserver = observer
  })
}

async function streamSnapshots(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __stream?: string[]; __streamObserver?: MutationObserver }
    w.__streamObserver?.disconnect()
    return w.__stream ?? []
  })
}

let streamed: string[] = []

// Без номера в начале названия: сама подсветка — отдельной позицией 6.1.1.
test('часть 6.1.1: разметка отрисована; код в блоке с кнопкой копирования', async () => {
  const page = await ui()
  await watchAnswerStream(page)
  const result = await turn(
    page,
    'Ответь в Markdown, без вступления: маркированный список из трёх пунктов, блок кода на Python из двух строк и таблица 2×2.'
  )
  streamed = await streamSnapshots(page)
  const answer = lastAnswer(page)
  // Считается только сам ответ: рассуждения печатаются той же разметкой.
  const outsideThinking = (selector: string) =>
    answer
      .locator(selector)
      .evaluateAll(
        (els) => els.filter((el) => !el.closest('[data-slot="aui_thinking-body"]')).length
      )
  await expect.poll(() => outsideThinking('li'), { timeout: 15000 }).toBe(3)
  await expect.poll(() => outsideThinking('table')).toBe(1)
  const code = answer.locator('pre.aui-shiki').first()
  await expect(code).toBeVisible()
  await expect(code.locator('[data-testid="shiki-container"]')).toBeVisible()
  expect(await outsideThinking('button[aria-label="Копировать код"]')).toBeGreaterThan(0)
  await record(test.info(), page, { transcript: result.transcript })
})

// D-119: их shiki компилирует грамматики через WebAssembly — CSP окна это
// разрешает с 24.09.2026 (`'wasm-unsafe-eval'`). Раскраска приходит после
// компиляции грамматики, поэтому ждём, а не снимаем мгновенно.
test('6.1.1 код подсвечен', async () => {
  const page = await ui()
  const code = lastAnswer(page).locator('pre.aui-shiki').first()
  await expect
    .poll(() => code.locator('span[style*="color"]').count(), { timeout: 30000, message: 'код раскрашен' })
    .toBeGreaterThan(0)
})

// Без номера в начале названия: позиция 6.1.2 засчитается, только когда
// недописанная таблица перестанет мигать (D-120).
test('часть 6.1.2: пока ответ печатается, недописанный блок кода не мигает ```', async () => {
  expect(streamed.length, 'ответ печатался по частям').toBeGreaterThan(3)
  const raw = streamed.filter((text) => text.includes('```'))
  expect(raw.map((text) => text.slice(-300)), 'ни в одном снимке нет сырых ```').toEqual([])
})

// D-120: пока строка-разделитель таблицы не дописана, их потоковый рендер
// разметки показывает шапку таблицы сырым текстом («| Ключ | Значение |
// |------|»). Замер 23.09.2026: один прогон из трёх.
test.fixme('6.1.2 недописанная таблица не мигает символами', async () => {
  const raw = streamed.filter((text) => /^\s*\|[\s|:-]*-{3}/m.test(text))
  expect(raw.map((text) => text.slice(-300))).toEqual([])
})

test('6.2.1 видны карточки вызовов; рассуждения сворачиваются и разворачиваются', async () => {
  const page = await ui()
  const result = await turn(
    page,
    'Выполни в терминале команду `echo aec-e2e-tool` и одним предложением скажи, что она вывела.',
    { expectTool: /terminal|shell|exec|command/i }
  )
  expect(result.tools.join(','), 'агент вызвал терминал').toMatch(/terminal|shell|exec|command/i)
  const answer = lastAnswer(page)
  const card = answer.locator('[data-slot="tool-block"]').first()
  await expect(card).toBeVisible({ timeout: 15000 })
  await expect(card).toContainText('aec-e2e-tool')
  // Рассуждения модель пишет не на каждый ход — свёртка берётся из ленты, а
  // если её там нет, ход с задачей, над которой приходится думать.
  const disclosure = page
    .locator('[data-slot="aui_thinking-disclosure"] button[aria-expanded]')
    .first()
  if ((await disclosure.count()) === 0) {
    await turn(
      page,
      'Не вызывай инструментов, посчитай в уме и подумай, прежде чем отвечать: у трёх этажей нагрузки 420, 395 и 380 кН, запас прочности 1,15. Какую суммарную расчётную нагрузку принять? Ответь одним числом.'
    )
  }
  await expect(disclosure).toBeVisible()
  const before = await disclosure.getAttribute('aria-expanded')
  await disclosure.click()
  await expect(disclosure).not.toHaveAttribute('aria-expanded', before ?? '')
  await disclosure.click()
  await expect(disclosure).toHaveAttribute('aria-expanded', before ?? '')
  await record(test.info(), page, { transcript: result.transcript })
})

test('6.3.1 прерывание срабатывает; следующее сообщение уходит', async () => {
  const page = await ui()
  await recordChatEvents(page)
  const storyMark = await eventCount(page)
  await send(
    page,
    'Напиши подробный рассказ примерно на 800 слов о том, как монтажники прокладывают кабель в новом здании.'
  )
  const stop = page.getByRole('button', { name: /^(Стоп|Stop)$/ }).first()
  await expect(stop).toBeVisible({ timeout: 60000 })
  // Прервать на середине: ответ уже печатается.
  await expect
    .poll(async () => ((await lastAnswer(page).textContent()) ?? '').length, { timeout: 120000 })
    .toBeGreaterThan(300)
  await stop.click()
  await expect(page.getByRole('button', { name: /^(Стоп|Stop)$/ })).toHaveCount(0, {
    timeout: 60000
  })
  // Конец прерванного хода приходит уже после того, как пропала «Стоп»; без
  // этого ожидания его принял бы за свой следующий ход.
  await waitTurnEnd(page, storyMark, 60000)
  const next = await turn(page, 'Ответь одним словом: получил ли ты это сообщение?')
  expect(next.status).toBe('complete')
  expect(next.text.trim().length).toBeGreaterThan(0)
  await record(test.info(), page, { transcript: next.transcript })
})

// Поток вывода у донора — у ФОНОВЫХ процессов агента: ядро шлёт куски
// `agent.terminal.output`, а правая панель показывает их во вкладке терминала.
// Обычный вызов терминала отдаёт вывод одним куском в конце — так устроено ядро.
test('6.4.1 вывод долгой команды идёт потоком, форматирование сохранено', async () => {
  const page = await ui()
  const mark = await eventCount(page)
  const result = await turn(
    page,
    'Запусти в терминале фоновый процесс (terminal с background=true): цикл, который шесть раз с паузой в две секунды печатает строку «шаг N» (N от 1 до 6). Не жди его завершения — сразу ответь одним словом «запущено».',
    { approve: /шаг/, expectTool: /terminal/ }
  )
  const steps = async () =>
    (await eventsSince(page, mark)).filter(
      (event) => event.type === 'agent.terminal.output' && /шаг \d/.test(event.payload?.chunk ?? '')
    )
  await expect
    .poll(async () => (await steps()).map((event) => event.payload?.chunk ?? '').join(''), {
      timeout: 60000
    })
    .toContain('шаг 6')
  const chunks = await steps()
  expect(chunks.length, 'вывод пришёл несколькими кусками').toBeGreaterThanOrEqual(3)
  const span = (chunks[chunks.length - 1].at ?? 0) - (chunks[0].at ?? 0)
  expect(span, 'куски приходили по мере печати, а не разом').toBeGreaterThan(6000)
  expect(
    chunks.map((event) => event.payload?.chunk ?? '').join(''),
    'строки вывода разделены переводами строк'
  ).toMatch(/шаг 1\n(.*\n)*шаг 2\n/)
  // Правая панель: вывод фонового процесса — отдельная вкладка терминала. С
  // 0.21.5 вкладки процессов живут в списке «Терминалы» и названы командой.
  await openTerminalPane(page)
  await expect(
    page
      .getByRole('tablist', { name: /^(Терминалы|Terminals)$/ })
      .getByRole('tab', { name: /шаг/ })
  ).toBeVisible()
  await record(test.info(), page, { transcript: result.transcript })
})

test('6.4.2 агент спросил ввод — ответ из окна доходит', async () => {
  const page = await ui()
  const mark = await eventCount(page)
  await send(
    page,
    'Прежде чем ответить, спроси меня через инструмент уточнения (clarify), какой цвет выбрать: красный или синий. Потом назови мой выбор.'
  )
  // Только внутри рамки уточнения: сообщение человека в ленте — тоже кнопка,
  // и слово «синий» в нём есть.
  const blue = page
    .locator('[data-slot="clarify-inline"]')
    .last()
    .getByRole('button', { name: /синий/i })
  await expect(blue).toBeVisible({ timeout: 180000 })
  await blue.click()
  const answered = Date.now()
  await page.getByRole('button', { name: /Подтвердить и продолжить/ }).click()
  const events = await waitTurnEnd(page, mark, 60000)
  const complete = events.find((event) => event.type === 'message.complete')
  expect(complete?.payload?.text ?? '', 'агент назвал выбор из окна').toMatch(/син/i)
  expect(Date.now() - answered, 'ответ дошёл, а не истёк таймаут уточнения').toBeLessThan(30000)
  await record(test.info(), page, { transcript: `[clarify → синий]\n${complete?.payload?.text ?? ''}` })
})
