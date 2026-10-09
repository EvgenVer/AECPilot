// Отметка документов в граф из проводника — решения, отделённые от процесса
// (задача 5.15, SPECIFICATION UR24).
//
// ПОЧЕМУ ПУТЬ СОБИРАЕТ ГЛАВНЫЙ ПРОЦЕСС, А НЕ ОКНО. Путь области графа —
// `<source_id>/<rel>`, и он уезжает в `project.json`, то есть в конфигурацию
// проекта. Окно называет источник и запись в его дереве, строку складывают
// здесь — тот же порядок, что у `sources:get-entry-path`: рендерер не строит
// путей, даже когда они выглядят безобидно.
//
// ЧТО ЗДЕСЬ ПРОВЕРЯЕТСЯ НАСТОЯЩЕЙ ПРОВЕРКОЙ. Что источник существует, что вид
// записи один из двух, и что в пути нет выхода наружу. Последнее не про
// файловую систему — этот путь сравнивается со строками из индекса, а не
// открывается, — а про то, что попадёт в список «что входит в граф» и будет
// показано человеку как его выбор.

import { PROJECT_SOURCE_ID } from '../shared/source-name'
import type {
  GraphPreview,
  GraphRunReport,
  GraphScopeEntry,
  GraphScopeKind,
  IngestProgressEvent,
  RunFailure
} from '../shared/ipc'

import { isProgress, readFatal, readJsonLines } from './ingest-progress-pure'

export const PARENT_SEGMENT_ERROR = 'Путь в граф не может выходить за корень источника'
export const UNKNOWN_SOURCE_ERROR = 'Источник не найден'
export { PROJECT_SOURCE_ID }
export const BAD_KIND_ERROR = 'Вид записи в граф может быть только папкой или файлом'

export type GraphMarkDecision =
  { error: string; ok: false } | { kind: GraphScopeKind; ok: true; path: string }

function isScopeKind(value: unknown): value is GraphScopeKind {
  return value === 'file' || value === 'folder'
}

/** Склеивает путь области графа. Пустой `rel` — корень источника: он тоже
 *  единица выбора, и для него путь это один идентификатор источника. */
export function graphScopePath(sourceId: string, rel: string): string {
  const parts = rel.split('/').filter((part) => part.length > 0 && part !== '.')
  return parts.length === 0 ? sourceId : [sourceId, ...parts].join('/')
}

/** Разбирает то, что прислало окно: источник, запись в нём и вид. Отказ —
 *  значение, а не исключение: окно обязано показать его словами. */
export function decideGraphMark(payload: unknown, sourceIds: string[]): GraphMarkDecision {
  if (typeof payload !== 'object' || payload === null) {
    return { error: 'invalid payload', ok: false }
  }
  const { sourceId, rel, kind } = payload as Record<string, unknown>
  if (typeof sourceId !== 'string' || sourceId.length === 0) {
    return { error: 'sourceId must be a non-empty string', ok: false }
  }
  if (typeof rel !== 'string') return { error: 'rel must be a string', ok: false }
  if (!isScopeKind(kind)) return { error: BAD_KIND_ERROR, ok: false }
  if (sourceId !== PROJECT_SOURCE_ID && !sourceIds.includes(sourceId)) {
    return { error: UNKNOWN_SOURCE_ERROR, ok: false }
  }
  if (rel.split('/').includes('..')) return { error: PARENT_SEGMENT_ERROR, ok: false }

  return { kind, ok: true, path: graphScopePath(sourceId, rel.trim()) }
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function asEntries(value: unknown): GraphScopeEntry[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (entry): entry is GraphScopeEntry =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as GraphScopeEntry).path === 'string'
  )
}

/** Разбирает ответ `graph-preview`. Непонятный ответ — отказ: показать прогноз
 *  по непрочитанным числам значило бы спросить согласия на «неизвестно». */
export function readGraphPreview(stdout: string): GraphPreview {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    throw new Error('не удалось разобрать ответ aec-rag graph-preview')
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('aec-rag graph-preview ответил не объектом')
  }
  const record = parsed as Record<string, unknown>
  if (!isNumber(record.documents) || !isNumber(record.chunks_estimate)) {
    throw new Error('в ответе aec-rag graph-preview нет чисел прогноза')
  }

  return {
    adds: asEntries(record.adds),
    chunks_estimate: record.chunks_estimate,
    documents: record.documents,
    entries: asEntries(record.entries),
    index_missing: record.index_missing === true,
    not_indexed: isNumber(record.not_indexed) ? record.not_indexed : 0
  }
}

export interface GraphLines {
  /** Task 3J.7: the run could not start, and said why. */
  fatal?: RunFailure
  progress: IngestProgressEvent[]
  report?: GraphRunReport
  /** Хвост после последнего перевода строки — ещё не строка, ещё не разобран. */
  rest: string
}

function isGraphReport(
  value: Record<string, unknown>
): value is GraphRunReport & Record<string, unknown> {
  return isNumber(value.documents_added) && isNumber(value.chunks)
}

/** Читает поток `graph-add`: события прогресса и итог последней строкой. */
export function readGraphLines(buffered: string): GraphLines {
  const { records, rest } = readJsonLines(buffered)

  const progress: IngestProgressEvent[] = []
  let report: GraphRunReport | undefined
  let fatal: RunFailure | undefined

  for (const record of records) {
    if (isProgress(record.progress)) {
      progress.push(record.progress)
      continue
    }
    fatal = readFatal(record) ?? fatal
    if (isGraphReport(record)) report = record
  }

  return { fatal, progress, report, rest }
}
