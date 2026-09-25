// Ход модели для автоприёмки (задача 3F.9): отправить сообщение человеческим
// путём, дождаться конца хода и собрать стенограмму из событий ядра, а не из
// разметки ленты — разметка показывает не всё (свёрнутые карточки, имена
// инструментов), а события приходят в окно тем же мостом, что и в их ленту.
//
// Модель недетерминирована: если позиция требует вызова инструмента, а модель
// ответила словами, ход повторяется ОДИН раз (решение 3F.9: «повторов хода ≤1»).
// Второй промах — честное падение позиции, а не третья попытка.

import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test, type Locator, type Page } from '@playwright/test'

import { send } from './app'
import { evidenceDir } from './evidence'

export interface ChatEvent {
  type: string
  at?: number
  session_id?: string
  payload?: {
    chunk?: string
    name?: string
    process_id?: string
    status?: string
    text?: string
    tool_id?: string
    usage?: unknown
  }
}

export interface TurnResult {
  /** Итоговый текст ответа (`message.complete`). */
  text: string
  /** Имена вызванных инструментов по порядку. */
  tools: string[]
  status: string
  usage?: unknown
  /** Ход повторялся, потому что с первого раза ожидаемого инструмента не было. */
  retried: boolean
  /** Для свидетельства: вопрос, вызовы, ответ. */
  transcript: string
}

/** Записывать события ядра в окне — один раз на страницу. */
export async function recordChatEvents(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __turnEvents?: unknown[] }
    if (w.__turnEvents) return
    w.__turnEvents = []
    // `at` — время прихода в окно: по нему видно, что вывод шёл потоком.
    window.aecpilot.onChatEvent((event) => {
      w.__turnEvents?.push({ ...event, at: Date.now() })
    })
  })
}

export async function eventsSince(page: Page, mark: number): Promise<ChatEvent[]> {
  return page.evaluate(
    (from) => ((window as unknown as { __turnEvents?: unknown[] }).__turnEvents ?? []).slice(from),
    mark
  ) as Promise<ChatEvent[]>
}

/** Отметка «с этого места» — для `eventsSince` и `waitTurnEnd`. */
export async function eventCount(page: Page): Promise<number> {
  return page.evaluate(
    () => ((window as unknown as { __turnEvents?: unknown[] }).__turnEvents ?? []).length
  )
}

/** Карточка подтверждения команды под вызовом, который его попросил. С 0.21.5
 *  это `tool-approval-card`: подпись «Команда», текст команды и кнопки — внутри
 *  неё, а `tool-approval-actions` — только ряд кнопок, без команды. Карточки
 *  стоят стопкой («1 / 2», когда модель выпустила две команды разом), и
 *  отвечать можно только на переднюю — остальные `aria-hidden` и `inert`. */
export function approvalStrip(page: Page): Locator {
  return page
    .locator(
      '[data-slot="tool-approval-card"]:not([aria-hidden="true"]), [data-slot="tool-approval-inline"]'
    )
    .last()
}

/** Текст команды, которую подтверждают, — раскрыть «Команда» и прочитать. */
export async function approvalCommand(page: Page): Promise<string> {
  const strip = approvalStrip(page)
  // До 0.21.5 текст прятался под кнопкой «Команда»; с 0.21.5 это подпись, а
  // команда видна сразу (замер 24.09.2026).
  const toggle = strip.getByRole('button', { name: 'Команда' })
  if ((await toggle.count()) > 0 && (await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click()
  }
  return (await strip.locator('pre').innerText()).trim()
}

/** События, пришедшие с отметки, — пока ход не закончился. */
export async function waitTurnEnd(
  page: Page,
  mark: number,
  timeoutMs = 240000,
  approve?: RegExp,
  clarify?: RegExp,
  declineForeign = false
): Promise<ChatEvent[]> {
  let events: ChatEvent[] = []
  let foreign = ''
  // Режим подтверждений стенда — ручной (3E.7): ход, упёршийся в
  // подтверждение, ждёт человека. Подтверждение приходит окну ВОПРОСОМ
  // сервера (мост 3.B5), а не событием чата, — поэтому оно читается с экрана:
  // полоса «Выполнить / Отклонить» и текст команды под «Команда». Тест жмёт
  // «Выполнить» ТОЛЬКО на команду, которую позиция сама попросила, — чужая
  // валит позицию сразу, а не через таймаут хода.
  const strip = approvalStrip(page)
  await expect
    .poll(
      async () => {
        events = await eventsSince(page, mark)
        // Вопрос агента карточкой `clarify` держит ход до ответа человека.
        // Позиция, передавшая `clarify`, отвечает вариантом по образцу; без
        // него ход честно ждёт до таймаута.
        // Отвеченная карточка остаётся в ленте с `data-clarify-settled` — ищем
        // только ждущую ответа.
        const card = page.locator('[data-slot="clarify-inline"]:not([data-clarify-settled])').last()
        if (clarify && (await card.isVisible())) {
          const choice = card.getByRole('button', { name: clarify }).first()
          if (await choice.isVisible()) {
            console.log(`[e2e] clarify → ${await choice.innerText()}`)
            await choice.click()
            await page.getByRole('button', { name: /Подтвердить и продолжить/ }).click()
            await expect(card).toBeHidden({ timeout: 15000 })
          }
        }
        if (await strip.isVisible()) {
          const command = await approvalCommand(page)
          if (!approve?.test(command)) {
            // Позиция, передавшая `declineForeign`, отвечает на чужую команду
            // «Отклонить», как осторожный человек, и ждёт ход дальше.
            if (declineForeign) {
              console.log(`[e2e] отклонена чужая команда:\n${command}`)
              await strip.getByRole('button', { name: /^Отклонить/ }).click()
              await expect(strip).toBeHidden({ timeout: 15000 })
              return false
            }
            foreign = command
            return true
          }
          await strip.getByRole('button', { name: /^Выполнить/ }).click()
          await expect(strip).toBeHidden({ timeout: 15000 })
        }
        return events.some((event) => event.type === 'message.complete')
      },
      { intervals: [500], timeout: timeoutMs, message: 'ход закончился (message.complete)' }
    )
    .toBe(true)
  if (foreign) console.log(`[e2e] подтверждение на чужую команду:
${foreign}`)
  expect(foreign, 'ход ждёт подтверждения на команду, которую позиция не просила').toBe('')
  return events
}

function summarize(question: string, events: ChatEvent[], retried: boolean): TurnResult {
  const complete = events.find((event) => event.type === 'message.complete')
  // `tool.start` и `tool.started` приходят на один и тот же вызов — по `tool_id`.
  const seen = new Set<string>()
  const tools: string[] = []
  for (const event of events) {
    if (event.type !== 'tool.start' && event.type !== 'tool.started') continue
    const id = event.payload?.tool_id ?? `${tools.length}`
    if (seen.has(id)) continue
    seen.add(id)
    tools.push(event.payload?.name ?? '?')
  }
  const text = complete?.payload?.text ?? ''
  const status = complete?.payload?.status ?? ''
  return {
    text,
    tools,
    status,
    usage: complete?.payload?.usage,
    retried,
    transcript: [
      `> ${question}`,
      ...tools.map((name) => `[инструмент] ${name}`),
      `[ответ, ${status}${retried ? ', со второй попытки' : ''}]`,
      text
    ].join('\n')
  }
}

/** Отправить сообщение и дождаться конца хода. `expectTool` — имя инструмента,
 *  без которого позиция не проверяется: промах даёт один повтор. `approve` —
 *  образец команды, которую позиция сама просит и на которую можно ответить
 *  «Выполнить». */
export async function turn(
  page: Page,
  question: string,
  options: { approve?: RegExp; clarify?: RegExp; declineForeign?: boolean; expectTool?: RegExp; timeoutMs?: number } = {}
): Promise<TurnResult> {
  await recordChatEvents(page)
  let mark = await eventCount(page)
  await send(page, question)
  let events = await waitTurnEnd(page, mark, options.timeoutMs, options.approve, options.clarify, options.declineForeign)
  let result = summarize(question, events, false)
  if (options.expectTool && !result.tools.some((name) => options.expectTool!.test(name))) {
    mark = await eventCount(page)
    await send(page, question)
    events = await waitTurnEnd(page, mark, options.timeoutMs, options.approve, options.clarify, options.declineForeign)
    result = summarize(question, events, true)
  }
  recordUsage(result)
  return result
}

/** Расход хода — в `usage.jsonl` рядом со свидетельствами: отчёт 3F.11
 *  складывает его в «ходов модели и токенов». Сбой записи ход не роняет. */
function recordUsage(result: TurnResult): void {
  try {
    mkdirSync(evidenceDir, { recursive: true })
    const title = test.info().title
    appendFileSync(join(evidenceDir, 'usage.jsonl'), JSON.stringify({ title, retried: result.retried, usage: result.usage ?? null }) + '\n', 'utf-8')
  } catch {
    // Вне теста (`test.info()` бросает) или диск недоступен — отчёт без этой строки.
  }
}
