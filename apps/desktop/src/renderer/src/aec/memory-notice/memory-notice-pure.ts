// Задача 5.1б, сценарий спеки «Провайдер недоступен»: слой 2 не поднялся, а
// человек об этом не знает. Здесь решения; провод — в `register-memory-notice.ts`.
//
// ПОЧЕМУ ВООБЩЕ НУЖНЫ МЫ. Ядро о недоступном провайдере говорит ОДИН раз и
// только в лог (`agent/agent_init.py:_warn_memory_provider_unavailable`,
// «Memory provider … is selected but reports unavailable»), а лога человек не
// видит. Разговор при этом идёт: слой 1 (записка ядра) работает, слой 2 молчит,
// и отличить «мне нечего вспомнить» от «память выключена» изнутри разговора
// нельзя.
//
// ТРИ ПРИЧИНЫ ОТКАЗА ПРИХОДЯТ ДВУМЯ РАЗНЫМИ ДОРОГАМИ, и это ЗАМЕР, а не
// предположение. Их же функция статуса (`_discover_memory_provider_statuses`)
// прогнана на четырёх состояниях профиля:
//
//   пусто                → needs_config, deps: true    (ключей нет)
//   наши четыре ключа    → ready,        deps: true    (слой поднялся)
//   endpoint недоступен  → ready,        deps: true    ← ВАЖНО
//   без vector_store     → needs_config, deps: true
//
// Третья строка и есть вывод: НЕДОСТУПНЫЙ ENDPOINT В СТАТУСЕ НЕ ВИДЕН. Ядро
// считает провайдера готовым — сеть при опросе не трогается. Значит эта причина
// ловится только тогда, когда инструмент памяти реально отвечает ошибкой, и её
// текст пишет их же плагин («Mem0 backend not initialized: …», «Mem0
// temporarily unavailable …» — с ядра 0.22 это внешний плагин
// `mem0ai/mem0: integrations/hermes-plugin-mem0/__init__.py`, задача T20.6).
//
// Отсюда две входные точки ниже и ровно один вывод для человека.

import { isGatewayEventOfType, type GatewayEvent } from '../../../../shared/gateway/types'

/** Задача 3G.49 (D-172): у памяти нет провайдера — агент по подписке, а свой не
 *  выбран (или у своего не хватает моделей). Причина — словами из main; `null` —
 *  провайдер есть, или профиль не прочитан, или агент ещё не настроен (это дело
 *  мастера, не уведомления). */
export function memoryProviderGap(state: {
  agentProvider: string | null
  memory: { ok: boolean; reason?: string }
  profileRead: boolean
}): null | string {
  if (!state.profileRead || !state.agentProvider || state.memory.ok) return null
  return state.memory.reason ?? ''
}

/** Что стало со вторым слоем памяти. */
export type MemoryLayerVerdict =
  /** Поднялся — говорить нечего. */
  | { kind: 'ok' }
  /** Провайдер не выбран: второго слоя в этом профиле нет по решению, а не по
   *  отказу. Сообщение здесь было бы шумом. */
  | { kind: 'off' }
  /** Выбран и не работает. `reason` — то, что мы можем назвать честно. */
  | { kind: 'down'; reason: 'package' | 'config' | 'missing' | 'unknown' }

interface ProviderRow {
  name?: unknown
  status?: unknown
  setup?: { dependencies_installed?: unknown } | null
}

function rows(payload: unknown): ProviderRow[] {
  const list = (payload as { providers?: unknown } | null)?.providers
  return Array.isArray(list) ? (list as ProviderRow[]) : []
}

/**
 * Приговор по ответу `GET /api/memory` — единственному месту, где ядро само
 * говорит о провайдере до первого хода.
 *
 * Форма ответа снята с их кода, а значения — с живого прогона (см. шапку).
 */
export function memoryLayerVerdict(payload: unknown): MemoryLayerVerdict {
  const active = (payload as { active?: unknown } | null)?.active
  if (typeof active !== 'string' || active.trim() === '') return { kind: 'off' }

  const row = rows(payload).find((entry) => entry.name === active)
  // Провайдер выбран, а ядро его не нашло: их статус зовёт это `missing`, но
  // строки может не быть вовсе — ответ старого ядра или чужого профиля.
  if (!row) return { kind: 'down', reason: 'missing' }

  switch (row.status) {
    case 'ready':
      return { kind: 'ok' }
    case 'missing':
      return { kind: 'down', reason: 'missing' }
    case 'needs_config':
      return { kind: 'down', reason: 'config' }
    case 'unavailable':
      // Их правило: `unavailable` + невыполненные зависимости = не установлен
      // пакет; `unavailable` без этого — всё остальное, чего мы не знаем.
      return {
        kind: 'down',
        reason: row.setup?.dependencies_installed === false ? 'package' : 'unknown'
      }
    default:
      return { kind: 'down', reason: 'unknown' }
  }
}

/** Их плагин зовётся так; префикс — граница между «инструмент памяти» и любым
 *  другим. Имена схем: `mem0_search`, `mem0_add`, `mem0_update`, `mem0_delete`. */
const MEMORY_TOOL_PREFIX = 'mem0_'

/** Два начала строк, которыми их плагин отвечает, когда бэкенд не поднялся или
 *  перестал отвечать. Совпадение проверяется тестом по ИХ исходнику: строку
 *  могут переписать, и тогда покраснеть должно здесь, а не у человека. */
export const MEMORY_TOOL_FAILURES = [
  'Mem0 backend not initialized',
  'Mem0 temporarily unavailable'
] as const

function resultText(result: unknown): string {
  if (typeof result === 'string') return result
  if (result && typeof result === 'object') {
    const error = (result as { error?: unknown }).error
    if (typeof error === 'string') return error
  }
  return ''
}

/**
 * Отказ инструмента памяти — вторая дорога, та самая, которой приходит
 * недоступный endpoint.
 *
 * Возвращает текст ЯДРА (в нём и стоит подсказка про хранилище), либо `null`,
 * если событие не про память или инструмент отработал.
 */
export function memoryToolFailure(event: GatewayEvent): null | string {
  if (!isGatewayEventOfType(event, 'tool.complete')) return null

  const name = event.payload?.name
  if (typeof name !== 'string' || !name.startsWith(MEMORY_TOOL_PREFIX)) return null

  const text = resultText(event.payload?.result)
  if (text === '') return null

  return MEMORY_TOOL_FAILURES.some((marker) => text.includes(marker)) ? text : null
}
