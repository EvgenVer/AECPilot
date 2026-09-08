// Задача 3.B2г. Догон событий после обрыва связи: решения проверяются здесь,
// а то, что метод вообще отдаёт пропущенное, — пробой на живом ядре
// (`runtime/session-events-probe.mjs`). Разделение намеренное: мок подтверждает
// только то, что в него положили, и поломка постоянного чата в 3.B2б была
// молчаливой ровно поэтому.

import { describe, expect, it } from 'vitest'

import {
  EMPTY_WATERMARK,
  noteEvent,
  planCatchUp,
  readCatchUp,
  type ReplayWatermark
} from './event-replay-pure'

const ready = (epoch: string) => ({
  type: 'gateway.ready' as const,
  payload: { replay_epoch: epoch }
})
const delta = (seq: number, sessionId = 'с-1') => ({
  type: 'message.delta' as const,
  session_id: sessionId,
  seq
})
const frame = (seq: number, sessionId = 'с-1') => ({
  method: 'event' as const,
  params: { type: 'message.delta', session_id: sessionId, seq }
})

describe('отметка догона', () => {
  it('метка запуска шлюза запоминается из gateway.ready', () => {
    expect(noteEvent(EMPTY_WATERMARK, ready('e1'))).toEqual({ epoch: 'e1', lastSeq: 0 })
  })

  it('номер кадра двигает отметку вверх', () => {
    const state = noteEvent({ epoch: 'e1', lastSeq: 3 }, delta(7))
    expect(state.lastSeq).toBe(7)
  })

  it('отметка НЕ откатывается назад', () => {
    // Переигранные кадры приходят вперемешку с живыми; откат заставил бы
    // просить у шлюза то, что окно уже получило.
    expect(noteEvent({ epoch: 'e1', lastSeq: 9 }, delta(4)).lastSeq).toBe(9)
  })

  it('кадр без номера отметку не трогает', () => {
    const before: ReplayWatermark = { epoch: 'e1', lastSeq: 5 }
    expect(noteEvent(before, { type: 'message.start', session_id: 'с-1' })).toEqual(before)
  })

  it('перезапуск шлюза роняет счётчик, а не сохраняет его', () => {
    // Номера живут в памяти процесса и начинаются заново. Сохранить старую
    // отметку значит потом попросить чужие кадры.
    const state = noteEvent({ epoch: 'e1', lastSeq: 120 }, ready('e2'))
    expect(state).toEqual({ epoch: 'e2', lastSeq: 0 })
  })
})

describe('надо ли догонять', () => {
  it('ядро без нумерации — догонять нечем', () => {
    expect(planCatchUp({ epoch: '', lastSeq: 0 }, true)).toEqual({
      action: 'skip',
      reason: 'no-seq'
    })
  })

  it('сессии нет — догонять некуда', () => {
    expect(planCatchUp({ epoch: 'e1', lastSeq: 12 }, false)).toEqual({
      action: 'skip',
      reason: 'no-seq'
    })
  })

  it('до обрыва не видели ни одного кадра — просить нечего', () => {
    // «Всё после нуля» вернуло бы кольцо целиком и продублировало окну то, что
    // оно возьмёт обычной загрузкой истории.
    expect(planCatchUp({ epoch: 'e1', lastSeq: 0 }, true)).toEqual({
      action: 'skip',
      reason: 'nothing-seen'
    })
  })

  it('видели кадры — просим всё после последнего', () => {
    expect(planCatchUp({ epoch: 'e1', lastSeq: 23 }, true)).toEqual({
      action: 'ask',
      lastSeen: 23
    })
  })
})

describe('разбор ответа переигровки', () => {
  it('доставляются только кадры новее отметки', () => {
    const reading = readCatchUp(
      { epoch: 'e1', lastSeq: 5 },
      {
        events: [frame(4), frame(5), frame(6), frame(7)],
        latest_seq: 7,
        truncated: false,
        epoch: 'e1'
      }
    )

    expect(reading.deliver.map((item) => item.params.seq)).toEqual([6, 7])
    expect(reading.watermark).toEqual({ epoch: 'e1', lastSeq: 7 })
    expect(reading.gap).toBe(false)
  })

  it('кольцо проехало точку — кадры отдаём, но о дыре говорим', () => {
    const reading = readCatchUp(
      { epoch: 'e1', lastSeq: 5 },
      {
        events: [frame(40)],
        latest_seq: 40,
        truncated: true,
        epoch: 'e1'
      }
    )

    expect(reading.deliver).toHaveLength(1)
    expect(reading.gap, 'молчать о потере нельзя — она уже случилась').toBe(true)
  })

  it('шлюз перезапустился — не доставляем НИ ОДНОГО кадра', () => {
    // Кадры из другой жизни процесса: их номера ничего не значат для нашей
    // отметки, и рассылать их окну — значит показать чужой разговор.
    const reading = readCatchUp(
      { epoch: 'e1', lastSeq: 5 },
      {
        events: [frame(1), frame(2)],
        latest_seq: 2,
        truncated: false,
        epoch: 'e2'
      }
    )

    expect(reading.deliver).toEqual([])
    expect(reading.watermark).toEqual({ epoch: 'e2', lastSeq: 2 })
    expect(reading.gap).toBe(true)
  })

  it('пустой ответ отметку не роняет', () => {
    const reading = readCatchUp(
      { epoch: 'e1', lastSeq: 9 },
      {
        events: [],
        latest_seq: 9,
        truncated: false,
        epoch: 'e1'
      }
    )

    expect(reading.deliver).toEqual([])
    expect(reading.watermark.lastSeq).toBe(9)
  })

  it('ядро без epoch в ответе не считается перезапущенным', () => {
    // Старое ядро поля не шлёт; читать его отсутствие как смену метки значило
    // бы глушить догон там, где он работает.
    const reading = readCatchUp(
      { epoch: 'e1', lastSeq: 5 },
      {
        events: [frame(6)],
        latest_seq: 6,
        truncated: false
      }
    )

    expect(reading.deliver.map((item) => item.params.seq)).toEqual([6])
    expect(reading.watermark.epoch).toBe('e1')
  })
})
