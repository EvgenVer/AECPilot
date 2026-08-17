// Когда запускать вторую проверку выдержек (SPEC UR26, задача 3.31b).
//
// Точка подключения — наш собственный мост событий, а не их лента: `message.complete`
// несёт готовый текст ответа, а мост — наш файл. Значит правки вендоренного кода
// не нужно ни одной, и правило четырёх правок (AGENTS §14) не задето.
//
// Проверка идёт ПОСЛЕ конца хода, а не по ходу потока: сверять недописанную
// фразу бессмысленно — она не совпадёт просто потому, что оборвана, и человек
// увидит пометку, которая исчезнет сама собой.

import { gatewayBridge } from '../../shared/gateway-bridge'

import { rememberVerdicts } from './quote-verdicts'

type MessageComplete = { payload?: { status?: string; text?: string } }

/** Подписывается один раз на всё время жизни окна. */
export function registerQuoteCheck(): () => void {
  return gatewayBridge().on('message.complete', (event) => {
    const payload = (event as MessageComplete).payload
    // Оборванный ход проверять нечего: текст в нём обрезан на полуслове.
    if (!payload || payload.status !== 'complete') return
    const answer = payload.text ?? ''
    if (!answer.includes('[src:')) return

    void window.aecpilot.checkQuotes(answer).then((result) => {
      // `available: false` — проверка не состоялась. Молча ничего не помечаем:
      // выдать «всё подтверждено» после несостоявшейся проверки значило бы дать
      // гарантию, которой нет. Пометки об этом на фишке нет по решению
      // владельца — фишка говорит только про найденное несовпадение.
      if (result.available) rememberVerdicts(answer, result.quotes)
    })
  })
}
