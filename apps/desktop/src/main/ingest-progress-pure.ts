// Reading `aec-rag ingest`'s stdout (task 2.15).
//
// The CLI writes one JSON object per line while it runs — `{"progress": {…}}`
// for each step — and its final report as the last line. Everything about
// turning that stream into events lives here, away from the child process, so
// the awkward parts have tests: a line split across two reads, a partial line
// at the end, and a line that is not ours at all.

export type IngestProgress = {
  chunks: number
  done: number
  error: string
  rel_path: string
  source_id: string
  stage: string
  total: number
}

export type IngestReport = {
  chunks: number
  errors: { error: string; rel_path: string; source_id: string }[]
  files_failed: number
  files_ingested: number
  files_skipped: number
  files_total: number
  removed_chunks: number
}

export type IngestLines = {
  progress: IngestProgress[]
  report?: IngestReport
  /** The tail after the last newline — not yet a line, so not yet parsed. */
  rest: string
}

/** Splits `buffered` into complete lines and reads what each one says.
 *
 * A line that is not JSON, or is JSON of a shape we do not know, is skipped
 * rather than thrown on: python warnings and library chatter do reach stdout,
 * and one stray line must not abort an ingest that is otherwise fine.
 */
export function readIngestLines(buffered: string): IngestLines {
  const newline = buffered.lastIndexOf('\n')
  if (newline === -1) return { progress: [], rest: buffered }

  const complete = buffered.slice(0, newline)
  const rest = buffered.slice(newline + 1)

  const progress: IngestProgress[] = []
  let report: IngestReport | undefined

  for (const line of complete.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue

    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      continue
    }
    if (typeof parsed !== 'object' || parsed === null) continue

    const record = parsed as Record<string, unknown>
    if (isProgress(record.progress)) {
      progress.push(record.progress)
      continue
    }
    if (isReport(record)) report = record
  }

  return { progress, report, rest }
}

function isProgress(value: unknown): value is IngestProgress {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.stage === 'string' && typeof record.done === 'number'
}

function isReport(value: Record<string, unknown>): value is IngestReport {
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
