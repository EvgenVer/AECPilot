// Tests for reading `aec-rag ingest`'s stdout (task 2.15).

import { describe, expect, it, vi } from 'vitest'

import {
  applyIngestEvent,
  describeProgress,
  failureOf,
  type IngestProgress,
  interruptedFile,
  oneShotFailure,
  readIngestLines,
  RunFailedError,
  watchSilence
} from './ingest-progress-pure'

const started =
  '{"progress":{"stage":"started","done":0,"total":2,"source_id":"","rel_path":"","chunks":0,"error":""}}'
const file =
  '{"progress":{"stage":"file","done":1,"total":2,"source_id":"tasks","rel_path":"ЭОМ/задание.pdf","chunks":7,"error":""}}'
const report =
  '{"files_total":2,"files_ingested":2,"files_skipped":0,"files_failed":0,"chunks":12,"removed_chunks":0,"errors":[]}'

describe('readIngestLines', () => {
  it('reads every complete line and keeps the tail for the next read', () => {
    const result = readIngestLines(`${started}\n${file}\n{"progr`)

    expect(result.progress.map((event) => event.stage)).toEqual(['started', 'file'])
    expect(result.rest).toBe('{"progr')
    expect(result.report).toBeUndefined()
  })

  it('joins a line split across two reads', () => {
    const first = readIngestLines(file.slice(0, 30))
    const second = readIngestLines(first.rest + file.slice(30) + '\n')

    expect(first.progress).toEqual([])
    expect(second.progress[0].rel_path).toBe('ЭОМ/задание.pdf')
    expect(second.progress[0].chunks).toBe(7)
  })

  it('recognises the final report', () => {
    const result = readIngestLines(`${file}\n${report}\n`)

    expect(result.report?.files_ingested).toBe(2)
    expect(result.report?.chunks).toBe(12)
  })

  it('skips a line that is not ours instead of failing the run', () => {
    // Library chatter and python warnings do reach stdout; one stray line must
    // not abort an ingest that is otherwise fine.
    const result = readIngestLines(`DeprecationWarning: something\n${file}\n{"other":1}\n`)

    expect(result.progress).toHaveLength(1)
    expect(result.report).toBeUndefined()
  })

  it('has nothing to say about a buffer with no newline yet', () => {
    expect(readIngestLines('half a line')).toEqual({ progress: [], rest: 'half a line' })
  })
})

describe('describeProgress', () => {
  it('counts files while the run is in flight', () => {
    expect(describeProgress(readIngestLines(`${file}\n`).progress[0])).toBe('1 / 2')
  })

  it('says nothing once the run has finished — the report speaks then', () => {
    const finished = readIngestLines(
      '{"progress":{"stage":"finished","done":2,"total":2,"source_id":"","rel_path":"","chunks":0,"error":""}}\n'
    )

    expect(describeProgress(finished.progress[0])).toBeNull()
    expect(describeProgress(null)).toBeNull()
  })
})

describe('applyIngestEvent — файлы прогона для страницы «Индекс» (3H.15, 3H.19)', () => {
  const event = (patch: Partial<IngestProgress>): IngestProgress => ({
    chunks: 0,
    done: 1,
    error: '',
    page: 0,
    pages: 0,
    phase: 'text',
    rel_path: 'ИГИ/297-1.pdf',
    source_id: 'tasks',
    stage: 'file',
    total: 3,
    ...patch
  })

  it('файл после первого прохода ждёт распознавания столько страниц, сколько сказано', () => {
    const rows = applyIngestEvent([], event({ pages: 150 }))

    expect(rows).toEqual([
      {
        error: '',
        pagesDone: 0,
        pagesWaiting: 150,
        rel_path: 'ИГИ/297-1.pdf',
        source_id: 'tasks',
        state: 'waiting'
      }
    ])
  })

  it('второй проход ведёт страницу N из M и закрывает файл на последней', () => {
    let rows = applyIngestEvent([], event({ pages: 2 }))
    rows = applyIngestEvent(rows, event({ page: 1, pages: 2, phase: 'ocr', stage: 'page' }))
    expect(rows[0]).toMatchObject({ pagesDone: 1, pagesWaiting: 2, state: 'recognizing' })

    rows = applyIngestEvent(rows, event({ page: 2, pages: 2, phase: 'ocr', stage: 'page' }))
    expect(rows[0]).toMatchObject({ pagesDone: 2, state: 'done' })
  })

  it('файл без сканов готов сразу, сбойный — со словами причины', () => {
    let rows = applyIngestEvent([], event({ rel_path: 'ПЗ.docx' }))
    rows = applyIngestEvent(
      rows,
      event({ error: 'битый файл', rel_path: 'x.pdf', stage: 'failed' })
    )

    expect(rows.map((row) => row.state)).toEqual(['read', 'failed'])
    expect(rows[1].error).toBe('битый файл')
  })

  it('новый прогон начинает список заново, начало второго прохода — нет', () => {
    const rows = applyIngestEvent([], event({ pages: 1 }))

    expect(applyIngestEvent(rows, event({ phase: 'ocr', rel_path: '', stage: 'started' }))).toBe(
      rows
    )
    expect(applyIngestEvent(rows, event({ rel_path: '', stage: 'started' }))).toEqual([])
  })
})

describe('watchSilence — предел молчания вместо часа (D-183, 3H.17)', () => {
  it('процесс, который говорит, не обрывается и через два часа', () => {
    vi.useFakeTimers()
    const silent = vi.fn()
    const watch = watchSilence(15 * 60 * 1000, silent)

    for (let minute = 0; minute < 120; minute += 1) {
      vi.advanceTimersByTime(60 * 1000)
      watch.poke()
    }

    expect(silent).not.toHaveBeenCalled()
    watch.stop()
    vi.useRealTimers()
  })

  it('молчащий дольше предела обрывается один раз', () => {
    vi.useFakeTimers()
    const silent = vi.fn()
    const watch = watchSilence(15 * 60 * 1000, silent)

    vi.advanceTimersByTime(15 * 60 * 1000 + 1)
    vi.advanceTimersByTime(60 * 60 * 1000)

    expect(silent).toHaveBeenCalledTimes(1)
    watch.stop()
    vi.useRealTimers()
  })
})

describe('interruptedFile — какой файл прочитается заново (3J.9)', () => {
  const at = (stage: string, rel_path: string, phase = 'text'): IngestProgress => ({
    chunks: 0,
    done: 0,
    error: '',
    phase,
    rel_path,
    source_id: 'tasks',
    stage,
    total: 2
  })

  it('reading без file — этот файл', () => {
    expect(
      interruptedFile([
        at('started', ''),
        at('reading', 'а.pdf'),
        at('file', 'а.pdf'),
        at('reading', 'б.pdf')
      ])
    ).toEqual({ rel_path: 'б.pdf', source_id: 'tasks' })
  })

  it('каждый начатый файл закончен — ничего', () => {
    expect(interruptedFile([at('reading', 'а.pdf'), at('failed', 'а.pdf')])).toBeNull()
    expect(interruptedFile([at('reading', 'а.pdf'), at('file', 'а.pdf')])).toBeNull()
  })

  it('распознавание страниц не теряет ничего — не считается', () => {
    expect(
      interruptedFile([at('reading', 'а.pdf'), at('file', 'а.pdf'), at('page', 'а.pdf', 'ocr')])
    ).toBeNull()
  })

  it('строка файла показывает «читаю», пока проход по нему идёт', () => {
    expect(applyIngestEvent([], at('reading', 'а.pdf'))[0].state).toBe('reading')
  })
})

describe('fatal и failureOf (3J.7, 3J.11)', () => {
  it('строка fatal читается рядом с прогрессом, чужой объект — нет', () => {
    const lines = readIngestLines(
      '{"fatal": {"code": "provider_missing", "detail": "нет ключа"}}\n{"fatal": 3}\n'
    )
    expect(lines.fatal).toEqual({ code: 'provider_missing', detail: 'нет ключа' })
    expect(readIngestLines('{"fatal": {"detail": "x"}}\n').fatal).toBeUndefined()
  })

  it('чужая ошибка — код exit с её текстом', () => {
    expect(failureOf(new Error('сломалось'))).toEqual({ code: 'exit', detail: 'сломалось' })
    expect(failureOf(new RunFailedError('silent', 'молчал'))).toEqual({
      code: 'silent',
      detail: 'молчал'
    })
  })
})

describe('oneShotFailure — причина вместо журнала (3M.6, приёмка 46.4.2)', () => {
  const log = [
    'INFO: [aec-71ebae2ab55f7df3] Loaded graph from C:\\vault\\graph.graphml with 476 nodes',
    "INFO:nano-vectordb:Init {'embedding_dim': 3072}",
    'WARNING: No chunks found for document doc-1'
  ].join('\n')

  it('строка fatal — её причина, а не страница INFO', () => {
    const stdout = '{"fatal": {"code": "index_failed", "detail": "документ не удалился"}}'
    expect(oneShotFailure(stdout, `${log}\naec-rag: BridgeError: документ не удалился`)).toBe(
      'документ не удалился'
    )
  })

  it('без fatal — последняя строка, которая не запись журнала', () => {
    expect(oneShotFailure('', `${log}\naec-rag: project.json not found\nINFO: done`)).toBe(
      'aec-rag: project.json not found'
    )
  })
})
