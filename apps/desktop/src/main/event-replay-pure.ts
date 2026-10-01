// Догон событий после обрыва связи (задача 3.B2г, ядро 0.20.6).
//
// ЗАЧЕМ. Обрыв WebSocket посреди хода агента — это окно, в котором нынешний путь
// восстановить нечего: сокет поднимается заново, сессия читается из базы, а
// строка хода попадает туда только по его ЗАВЕРШЕНИИ. Всё, что агент успел
// сказать до обрыва и пока нас не было, для окна исчезает.
//
// ЗАМЕРЕНО (`runtime/session-events-probe.mjs`, 2026-08-30): на одном обрыве
// посреди ответа `session.events.since` вернул 67 пропущенных кадров, из них 61
// дельту, а `session.resume` на той же сессии отдал последний ответ ассистента
// длиной НОЛЬ символов. Это и есть цена: 61 дельта против нуля.
//
// ГДЕ ЭТО ЖИВЁТ. Сокетом владеет главный процесс (SPEC C9), он же видит обрыв и
// он же рассылает события окнам. Значит догон встаёт здесь, и код донора не
// трогается вовсе — окно получает догнанные кадры тем же каналом, что и живые,
// и отличить их не может.
//
// Здесь только решения; вызовы и рассылка — в `main/index.ts`.

import type { GatewayEventFrame } from '../shared/gateway/types'

/** Что помним между кадрами. */
export interface ReplayWatermark {
  /** Метка запуска шлюза из `gateway.ready`. Пусто — ядро без переигровки. */
  epoch: string
  /** Самый свежий номер кадра, который окна ТОЧНО получили. */
  lastSeq: number
}

export const EMPTY_WATERMARK: ReplayWatermark = { epoch: '', lastSeq: 0 }

type EventParams = GatewayEventFrame['params']

/**
 * Обновление отметки по живому кадру.
 *
 * Номера берутся только вверх: кадры приходят по порядку, но переигранные могут
 * прийти вперемешку с живыми, и откат отметки назад заставил бы просить уже
 * доставленное.
 */
export function noteEvent(state: ReplayWatermark, params: EventParams): ReplayWatermark {
  const epoch = params.type === 'gateway.ready' ? readEpoch(params.payload) : state.epoch

  const seq = typeof params.seq === 'number' && Number.isFinite(params.seq) ? params.seq : 0

  // Перезапуск шлюза: счётчики в нём живут в памяти процесса и начинаются
  // заново, поэтому старая отметка указывает в пустоту. Ронять её здесь —
  // единственный способ не попросить потом чужие кадры.
  if (epoch !== state.epoch && epoch !== '') return { epoch, lastSeq: seq }

  return { epoch, lastSeq: Math.max(state.lastSeq, seq) }
}

/**
 * Кадр для окна с эпохой шлюза (D-132) — то, что их клиент ставит сам
 * (`json-rpc-gateway.ts`, `dispatchEvent`). Их пул держит по клиенту на профиль,
 * и у нас все они — псевдонимы одного соединения: кадр сессии специалиста
 * доходит до их обработчика дважды. Их фильтр дублей узнаёт копию по
 * `(replayEpoch, session_id, seq)`; без эпохи ключ берётся из `connectionId`,
 * а он у основного клиента `local`, у клиента профиля пуст — и каждая дельта
 * печаталась дважды («ПрПриветивет»).
 */
export function tagReplayEpoch<E extends EventParams>(
  state: ReplayWatermark,
  event: E
): E | (E & { replayEpoch: string }) {
  return state.epoch === '' ? event : { ...event, replayEpoch: state.epoch }
}

function readEpoch(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null) return ''
  const value = (payload as Record<string, unknown>).replay_epoch
  return typeof value === 'string' ? value : ''
}

export type CatchUpPlan =
  /** Спросить пропущенное с этой отметки. */
  | { action: 'ask'; lastSeen: number }
  /** Просить нечего — с основанием, чтобы в журнале было видно, почему тихо. */
  | { action: 'skip'; reason: 'no-seq' | 'nothing-seen' }

/**
 * Надо ли догонять после восстановления связи.
 *
 * `no-seq` — ядро не нумерует кадры (старее 0.20.6), догонять нечем.
 * `nothing-seen` — до обрыва мы не видели ни одного кадра этой сессии: просить
 * «всё после нуля» значит получить кольцо целиком и продублировать окну то,
 * что оно и так возьмёт обычной загрузкой истории.
 */
export function planCatchUp(state: ReplayWatermark, hasSession: boolean): CatchUpPlan {
  if (!hasSession || state.epoch === '') return { action: 'skip', reason: 'no-seq' }
  if (state.lastSeq <= 0) return { action: 'skip', reason: 'nothing-seen' }

  return { action: 'ask', lastSeen: state.lastSeq }
}

export interface CatchUpReading {
  /** Кадры, которые можно разослать окнам как живые. */
  deliver: GatewayEventFrame[]
  /** Новая отметка. */
  watermark: ReplayWatermark
  /**
   * В ленте ДЫРА, и догон её не закрыл. Два случая: кольцо шлюза проехало
   * запрошенную точку (`truncated`) либо шлюз успел перезапуститься (метка
   * не совпала). Оба означают одно — часть событий потеряна безвозвратно, и
   * честный ответ на это перечитать историю, а не молча продолжить.
   */
  gap: boolean
}

/**
 * Разбор ответа переигровки.
 *
 * Несовпадение метки — не «дыра плюс кадры», а «кадры не наши»: они из другой
 * жизни процесса, и рассылать их окну нельзя ни одного.
 */
export function readCatchUp(
  state: ReplayWatermark,
  answer: {
    events?: GatewayEventFrame[]
    latest_seq?: number
    truncated?: boolean
    epoch?: string
  }
): CatchUpReading {
  const epoch = typeof answer.epoch === 'string' ? answer.epoch : ''
  const latest = typeof answer.latest_seq === 'number' ? answer.latest_seq : state.lastSeq

  if (epoch !== '' && state.epoch !== '' && epoch !== state.epoch) {
    return { deliver: [], watermark: { epoch, lastSeq: latest }, gap: true }
  }

  const events = Array.isArray(answer.events) ? answer.events : []
  const fresh = events.filter((frame) => {
    const seq = frame?.params?.seq
    return typeof seq === 'number' && seq > state.lastSeq
  })

  const highest = fresh.reduce((top, frame) => Math.max(top, frame.params.seq ?? 0), state.lastSeq)

  return {
    deliver: fresh,
    watermark: { epoch: epoch === '' ? state.epoch : epoch, lastSeq: Math.max(highest, latest) },
    gap: answer.truncated === true
  }
}
