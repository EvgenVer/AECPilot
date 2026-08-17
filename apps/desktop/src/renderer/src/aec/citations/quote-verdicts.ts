// Что приложение выяснило про выдержки в ответе (SPEC UR26, задача 3.31b).
//
// Фишка цитаты — единственное место в ленте, которое принадлежит нам и стоит
// вплотную к выдержке (решение владельца 2026-08-17). Поэтому пометка живёт на
// ней, а здесь — то, что ей нужно знать: у какой ссылки есть выдержка, которой
// в источнике нет.
//
// Ключ — сырой текст ссылки. Он же и есть адрес места: `[src: источник/путь#p12]`.
// Двум ответам, сославшимся на одно место, достаётся общая пометка — и это
// правильнее, чем молчание: если фраза не нашлась в этом документе, она не
// нашлась в нём ни для кого.

import { atom } from 'nanostores'

import type { QuoteVerdict } from '../../../../shared/ipc'
import { parseCitations } from './citation-pure'

/** `raw` ссылки → фразы, которых в источнике нет. */
export const $unverifiedQuotes = atom<Record<string, string[]>>({})

/** Ссылка, ближайшая ПЕРЕД выдержкой — так их и ставит скил, и так же считает
 * `aec-rag check-quotes`. Держим два места в согласии намеренно: разойдись они,
 * пометка встала бы не на ту ссылку. */
function citationBefore(answer: string, position: number): string | undefined {
  const preceding = parseCitations(answer).filter((citation) => citation.start < position)
  return preceding.at(-1)?.raw
}

/** Раскладывает вердикты по ссылкам. Подтверждённые не запоминаются: их
 * отсутствие в списке и означает «всё в порядке», а хранить оба состояния
 * значило бы завести второй источник правды о том же. */
export function rememberVerdicts(answer: string, verdicts: readonly QuoteVerdict[]): void {
  const failed = verdicts.filter((verdict) => !verdict.ok)
  if (failed.length === 0) return

  const next = { ...$unverifiedQuotes.get() }
  for (const verdict of failed) {
    const raw = citationBefore(answer, verdict.start)
    if (!raw) continue
    const already = next[raw] ?? []
    if (!already.includes(verdict.text)) next[raw] = [...already, verdict.text]
  }
  $unverifiedQuotes.set(next)
}

export function forgetVerdicts(): void {
  $unverifiedQuotes.set({})
}
