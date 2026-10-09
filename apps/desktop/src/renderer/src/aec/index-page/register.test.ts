import { describe, expect, it } from 'vitest'

import type { GraphAddState, IngestState } from '../../../../shared/ipc'

import { hasRunProblem } from './register'

const ingest = (patch: Partial<IngestState> = {}): IngestState => ({
  error: null,
  failure: null,
  files: [],
  interrupted: null,
  lastReport: null,
  progress: null,
  running: false,
  stopping: false,
  ...patch
})
const graph = (patch: Partial<GraphAddState> = {}): GraphAddState => ({
  error: null,
  failure: null,
  lastReport: null,
  path: null,
  progress: null,
  running: false,
  ...patch
})

describe('hasRunProblem — значок строки «Индекс» (3J.11)', () => {
  it('спокойный проект — без значка', () => {
    expect(hasRunProblem(ingest(), graph())).toBe(false)
    expect(hasRunProblem(null, null)).toBe(false)
  })

  it('остановившийся прогон любого рода — значок', () => {
    expect(hasRunProblem(ingest({ failure: { code: 'silent', detail: '' } }), graph())).toBe(true)
    expect(hasRunProblem(ingest(), graph({ error: 'сломалось' }))).toBe(true)
  })

  it('файлы с ошибкой в последнем отчёте — значок', () => {
    const report = {
      chunks: 0,
      errors: [],
      files_failed: 2,
      files_ingested: 0,
      files_skipped: 0,
      files_total: 2,
      removed_chunks: 0
    }
    expect(hasRunProblem(ingest({ lastReport: report }), null)).toBe(true)
  })
})
