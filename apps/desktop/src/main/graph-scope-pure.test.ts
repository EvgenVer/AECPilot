// Задача 5.15 — решения отметки в граф: что уезжает в CLI и что приезжает назад.
//
// Главное здесь — отказы. Путь в область графа попадает в `project.json` и
// показывается человеку как его выбор, поэтому чужому источнику, неизвестному
// виду записи и выходу наружу место в тесте, а не в списке.

import { describe, expect, it } from 'vitest'

import {
  BAD_KIND_ERROR,
  PARENT_SEGMENT_ERROR,
  UNKNOWN_SOURCE_ERROR,
  decideGraphMark,
  graphScopePath,
  readGraphLines,
  readGraphPreview
} from './graph-scope-pure'

const SOURCES = ['tasks', 'archive']

describe('graphScopePath', () => {
  it('корень источника — это сам источник, без хвостового слэша', () => {
    expect(graphScopePath('tasks', '')).toBe('tasks')
    expect(graphScopePath('tasks', '/')).toBe('tasks')
  })

  it('папка внутри источника склеивается через один слэш', () => {
    expect(graphScopePath('tasks', 'ЭОМ/задание.pdf')).toBe('tasks/ЭОМ/задание.pdf')
    expect(graphScopePath('tasks', '/ЭОМ//')).toBe('tasks/ЭОМ')
  })
})

describe('decideGraphMark', () => {
  it('пропускает папку известного источника', () => {
    const decision = decideGraphMark({ kind: 'folder', rel: 'ЭОМ', sourceId: 'tasks' }, SOURCES)

    expect(decision).toEqual({ kind: 'folder', ok: true, path: 'tasks/ЭОМ' })
  })

  it('пропускает корень источника: он тоже единица выбора UR24', () => {
    const decision = decideGraphMark({ kind: 'folder', rel: '', sourceId: 'archive' }, SOURCES)

    expect(decision).toEqual({ kind: 'folder', ok: true, path: 'archive' })
  })

  it('отказывает незнакомому источнику', () => {
    const decision = decideGraphMark({ kind: 'file', rel: 'a.pdf', sourceId: 'чужой' }, SOURCES)

    expect(decision).toEqual({ error: UNKNOWN_SOURCE_ERROR, ok: false })
  })

  it('отказывает выходу за корень источника', () => {
    const decision = decideGraphMark(
      { kind: 'folder', rel: '../соседний', sourceId: 'tasks' },
      SOURCES
    )

    expect(decision).toEqual({ error: PARENT_SEGMENT_ERROR, ok: false })
  })

  it('отказывает неизвестному виду записи', () => {
    const decision = decideGraphMark({ kind: 'всё', rel: 'ЭОМ', sourceId: 'tasks' }, SOURCES)

    expect(decision).toEqual({ error: BAD_KIND_ERROR, ok: false })
  })
})

describe('readGraphPreview', () => {
  it('читает прогноз и список того, что добавится', () => {
    const preview = readGraphPreview(
      '{"documents":3,"chunks_estimate":41,"not_indexed":1,' +
        '"adds":[{"path":"tasks/ЭОМ","kind":"folder","added_at":"x"}],' +
        '"entries":[{"path":"tasks/ЭОМ","kind":"folder","added_at":"x"}],"index_missing":false}'
    )

    expect(preview.documents).toBe(3)
    expect(preview.chunks_estimate).toBe(41)
    expect(preview.not_indexed).toBe(1)
    expect(preview.adds.map((entry) => entry.path)).toEqual(['tasks/ЭОМ'])
    expect(preview.index_missing).toBe(false)
  })

  it('видит отсутствие индекса отдельным ответом, а не нулями', () => {
    const preview = readGraphPreview(
      '{"documents":0,"chunks_estimate":0,"not_indexed":0,"adds":[],"entries":[],' +
        '"index_missing":true}'
    )

    expect(preview.index_missing).toBe(true)
  })

  it('отказывается читать ответ без чисел прогноза', () => {
    // Показать подтверждение по непрочитанным числам значило бы спросить
    // согласия на «неизвестно».
    expect(() => readGraphPreview('{"adds":[]}')).toThrow(/чисел прогноза/)
    expect(() => readGraphPreview('не json')).toThrow(/разобрать/)
  })
})

const started =
  '{"progress":{"stage":"started","done":0,"total":2,"source_id":"","rel_path":"","chunks":0,"error":""}}'
const one =
  '{"progress":{"stage":"graph","done":1,"total":2,"source_id":"tasks","rel_path":"ЭОМ/задание.pdf","chunks":7,"error":""}}'
const report =
  '{"documents_added":2,"chunks":12,"failed":0,"errors":[],"forecast":{"documents":2,"chunks_estimate":12,"not_indexed":0}}'

describe('readGraphLines', () => {
  it('читает прогресс и итог прогона', () => {
    const result = readGraphLines(`${started}\n${one}\n${report}\n`)

    expect(result.progress.map((event) => event.done)).toEqual([0, 1])
    expect(result.report?.documents_added).toBe(2)
    expect(result.report?.forecast.chunks_estimate).toBe(12)
  })

  it('не принимает отчёт ingest за свой', () => {
    // Обе команды печатают поток одной формы, и спутать итоги значило бы
    // сказать «граф построен» там, где прошла бесплатная индексация.
    const ingestReport =
      '{"files_total":2,"files_ingested":2,"files_skipped":0,"files_failed":0,"chunks":12,"removed_chunks":0,"errors":[]}'
    const result = readGraphLines(`${ingestReport}\n`)

    expect(result.report).toBeUndefined()
  })

  it('держит хвост строки до следующего чтения', () => {
    const first = readGraphLines(one.slice(0, 30))
    const second = readGraphLines(first.rest + one.slice(30) + '\n')

    expect(first.progress).toEqual([])
    expect(second.progress[0].rel_path).toBe('ЭОМ/задание.pdf')
  })
})
