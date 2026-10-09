// Reading `aec-rag ingest`'s stdout (task 2.15).
//
// The CLI writes one JSON object per line while it runs — `{"progress": {…}}`
// for each step — and its final report as the last line. Everything about
// turning that stream into events lives here, away from the child process, so
// the awkward parts have tests: a line split across two reads, a partial line
// at the end, and a line that is not ours at all.

import type { IngestFileRow, IngestProgressEvent, IngestRunReport, RunFailure } from '../shared/ipc'

export type IngestProgress = IngestProgressEvent

export type IngestReport = IngestRunReport

export type IngestLines = {
  /** Task 3J.7: the run could not start, and said why. */
  fatal?: RunFailure
  progress: IngestProgress[]
  report?: IngestReport
  /** The tail after the last newline — not yet a line, so not yet parsed. */
  rest: string
}

/** Splits `buffered` into complete lines and parses the JSON objects among them.
 *
 * A line that is not JSON, or is not an object, is skipped rather than thrown
 * on: python warnings and library chatter do reach stdout, and one stray line
 * must not abort a run that is otherwise fine.
 *
 * Shared with the graph runner (task 5.15), which reads a stream of the same
 * shape but a report of its own. The awkward parts — a line split across two
 * reads, a partial line at the end, a line that is not ours at all — are what
 * this file exists for, and a second copy of them would be a second set of
 * bugs.
 */
export function readJsonLines(buffered: string): {
  records: Record<string, unknown>[]
  rest: string
} {
  const newline = buffered.lastIndexOf('\n')
  if (newline === -1) return { records: [], rest: buffered }

  const records: Record<string, unknown>[] = []
  for (const line of buffered.slice(0, newline).split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      continue
    }
    if (typeof parsed === 'object' && parsed !== null) {
      records.push(parsed as Record<string, unknown>)
    }
  }

  return { records, rest: buffered.slice(newline + 1) }
}

/** Reads what an ingest run's lines say: progress events and the final report. */
export function readIngestLines(buffered: string): IngestLines {
  const { records, rest } = readJsonLines(buffered)

  const progress: IngestProgress[] = []
  let report: IngestReport | undefined
  let fatal: RunFailure | undefined

  for (const record of records) {
    if (isProgress(record.progress)) {
      progress.push(record.progress)
      continue
    }
    fatal = readFatal(record) ?? fatal
    if (isReport(record)) report = record
  }

  return { fatal, progress, report, rest }
}

/** Task 3J.7: `{"fatal": {code, detail}}` — the line `aec-rag` prints when a
 *  run cannot start. */
export function readFatal(record: Record<string, unknown>): RunFailure | undefined {
  const fatal = record.fatal
  if (typeof fatal !== 'object' || fatal === null) return undefined
  const { code, detail } = fatal as Record<string, unknown>
  if (typeof code !== 'string') return undefined
  return { code, detail: typeof detail === 'string' ? detail : '' }
}

/** Task 3J.11: a run that ended without its report, carrying the reason as a
 *  code. The message stays the raw text — logs and the tooltip read it. */
export class RunFailedError extends Error {
  readonly failure: RunFailure

  constructor(code: string, detail: string) {
    super(detail)
    this.name = 'RunFailedError'
    this.failure = { code, detail }
  }
}

/** The failure to publish for whatever a run rejected with. */
export function failureOf(error: unknown): RunFailure {
  if (error instanceof RunFailedError) return error.failure
  return { code: 'exit', detail: error instanceof Error ? error.message : String(error) }
}

export function isProgress(value: unknown): value is IngestProgress {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.stage === 'string' && typeof record.done === 'number'
}

function isReport(value: Record<string, unknown>): value is Record<string, unknown> & IngestReport {
  return typeof value.files_total === 'number' && typeof value.files_ingested === 'number'
}

/** What the indicator says while a run is in flight. `null` once it finishes —
 *  the numbers to show then come from the report, not from the last event. */
export function describeProgress(progress: IngestProgress | null): null | string {
  if (!progress) return null
  if (progress.stage === 'started') return `0 / ${progress.total}`
  if (progress.stage === 'finished') return null
  return `${progress.done} / ${progress.total}`
}

/** The run's files as the Index page lists them (task 3H.19), updated by one
 *  progress event. A new run (`started` of the text pass) starts the list over;
 *  every other event updates the row of its file, adding it on first sight. */
export function applyIngestEvent(rows: IngestFileRow[], event: IngestProgress): IngestFileRow[] {
  const ocr = event.phase === 'ocr'
  if (event.stage === 'started') return ocr ? rows : []
  if (!event.rel_path) return rows

  const index = rows.findIndex(
    (row) => row.source_id === event.source_id && row.rel_path === event.rel_path
  )
  const row: IngestFileRow =
    index === -1
      ? {
          error: '',
          pagesDone: 0,
          pagesWaiting: 0,
          rel_path: event.rel_path,
          source_id: event.source_id,
          state: 'read'
        }
      : rows[index]

  let next: IngestFileRow = row
  if (ocr) {
    const pages = event.pages ?? 0
    const page = event.page ?? 0
    next = {
      ...row,
      error: event.stage === 'failed' ? event.error : row.error,
      pagesDone: page,
      pagesWaiting: pages,
      state: page >= pages ? 'done' : 'recognizing'
    }
  } else if (event.stage === 'reading') {
    next = { ...row, state: 'reading' }
  } else if (event.stage === 'file') {
    const waiting = event.pages ?? 0
    next = { ...row, pagesWaiting: waiting, state: waiting > 0 ? 'waiting' : 'read' }
  } else if (event.stage === 'failed') {
    next = { ...row, error: event.error, state: 'failed' }
  } else if (event.stage === 'skipped') {
    next = { ...row, error: event.error, state: 'skipped' }
  }

  if (index === -1) return [...rows, next]
  return rows.map((current, position) => (position === index ? next : current))
}

/** Task 3J.9: the file whose text pass began (`reading`) and never ended —
 *  no `file`, `failed` or `skipped` after it. `null` when every file that was
 *  started also finished. Only the text pass counts: recognition is stored
 *  page by page and loses nothing to a stop. */
export function interruptedFile(
  events: IngestProgress[]
): null | { rel_path: string; source_id: string } {
  let open: null | { rel_path: string; source_id: string } = null
  for (const event of events) {
    if (event.phase === 'ocr') continue
    if (event.stage === 'reading') {
      open = { rel_path: event.rel_path, source_id: event.source_id }
    } else if (
      open &&
      event.source_id === open.source_id &&
      event.rel_path === open.rel_path &&
      (event.stage === 'file' || event.stage === 'failed' || event.stage === 'skipped')
    ) {
      open = null
    }
  }
  return open
}

/** D-183: a run is ended when it goes quiet, not when it gets long. A project
 *  of scanned reports recognises for hours and reports every page; a wedged
 *  process says nothing. `poke` on every line of output; `onSilent` fires once
 *  if `limitMs` pass without one. */
export function watchSilence(
  limitMs: number,
  onSilent: () => void
): { poke: () => void; stop: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null
  const arm = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      onSilent()
    }, limitMs)
  }
  arm()
  return {
    poke: arm,
    stop: () => {
      if (timer) clearTimeout(timer)
      timer = null
    }
  }
}
