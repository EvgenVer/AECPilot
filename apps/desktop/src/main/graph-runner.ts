// Запуск `aec-rag graph-preview` и `aec-rag graph-add` (задача 5.15) — та же
// форма, что у `ingest-runner.ts`, и по той же причине: движок у приложения
// свой, и отметка в граф не должна зависеть от живой сессии агента.
//
// КОМАНД ДВЕ, И ЭТО НЕ ДЕЛЕНИЕ РАДИ ДЕЛЕНИЯ. Предпросмотр отвечает за секунды и
// не пишет ничего; прогон стоит вызова модели на каждый фрагмент и идёт
// минутами. Между ними стоит человек — одной командой их звать нельзя.

import { spawn } from 'node:child_process'

import type {
  GraphDocumentMap,
  GraphExport,
  GraphPreview,
  GraphRunReport,
  GraphScopeKind,
  IngestProgressEvent
} from '../shared/ipc'

import { readGraphLines, readGraphPreview } from './graph-scope-pure'
import { RunFailedError, watchSilence } from './ingest-progress-pure'
import { runOneShot } from './ingest-runner'
import { aecRagArgs, aecRagCommand } from './aec-rag-command'

// Python пишет stderr в кодировке консоли Windows, а читаем мы UTF-8 — без этого
// русский отказ `aec-rag` доходит до человека кракозябрами (замер 3G.50).
const AEC_RAG_UTF8 = { PYTHONIOENCODING: 'utf-8' }

export const DEFAULT_PREVIEW_TIMEOUT_MS = 60 * 1000

// Задача 3J.11 (как D-183 у индексации): прогон кончается, когда замолчал, а не
// когда долго идёт. Прежний потолок в двенадцать часов держал зависший процесс
// полдня с индикатором «идёт». Строка вывода — каждый документ (и журнал
// LightRAG в stderr); полчаса тишины перекрывают один большой документ при
// 1,97 с на фрагмент (замер 2.9a) и параллельных вызовах модели.
export const DEFAULT_GRAPH_SILENCE_MS = 30 * 60 * 1000

/** `path` null — «Перестроить граф» (задача 3L.7): новых отметок нет, вся
 *  отмеченная область извлекается заново. */
function args(
  command: string,
  vaultPath: string,
  path: null | string,
  kind: GraphScopeKind
): string[] {
  return path === null
    ? [command, '--project', vaultPath, '--rebuild']
    : [command, '--project', vaultPath, '--path', path, '--kind', kind]
}

/** Сколько работы будет, если отметить `path`. Ничего не пишет — это свойство
 *  самой команды (`run_graph_preview`), а не обещание вызывающего. */
export function runGraphPreview(
  vaultPath: string,
  path: null | string,
  kind: GraphScopeKind,
  timeoutMs = DEFAULT_PREVIEW_TIMEOUT_MS
): Promise<GraphPreview> {
  return new Promise((resolve, reject) => {
    const proc = spawn(aecRagCommand(), aecRagArgs(args('graph-preview', vaultPath, path, kind)), {
      env: { ...process.env, ...AEC_RAG_UTF8 },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    })

    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    let settled = false

    const timeoutTimer = setTimeout(() => {
      if (settled) return
      settled = true
      proc.kill()
      reject(new Error('aec-rag graph-preview не ответил вовремя'))
    }, timeoutMs)

    proc.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk))
    proc.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk))

    proc.on('error', (error: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutTimer)
      reject(new Error(`не удалось запустить aec-rag graph-preview: ${error.message}`))
    })

    proc.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutTimer)
      if (code !== 0) {
        const stderr = Buffer.concat(stderrChunks).toString('utf8')
        reject(
          new Error(`aec-rag graph-preview завершился с ошибкой (код ${code}): ${stderr.trim()}`)
        )
        return
      }
      try {
        resolve(readGraphPreview(Buffer.concat(stdoutChunks).toString('utf8')))
      } catch (error: unknown) {
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  })
}

/** Отмечает `path` и строит по нему граф, сообщая о каждом документе. Зовётся
 *  ТОЛЬКО после согласия человека: деньги тратит именно эта функция. */
export function runGraphAdd(
  vaultPath: string,
  path: null | string,
  kind: GraphScopeKind,
  onProgress: (progress: IngestProgressEvent) => void,
  extraEnv: Record<string, string> = {},
  silenceMs = DEFAULT_GRAPH_SILENCE_MS,
  signal?: AbortSignal
): Promise<GraphRunReport> {
  return new Promise((resolve, reject) => {
    const proc = spawn(aecRagCommand(), aecRagArgs(args('graph-add', vaultPath, path, kind)), {
      // D-115: граф строится моделью и эмбеддингами провайдера — ключ человека
      // из нашего хранилища, как у индексации.
      env: { ...process.env, ...extraEnv, ...AEC_RAG_UTF8 },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    })

    const stderrChunks: Buffer[] = []
    let pending = ''
    let report: GraphRunReport | undefined
    let fatal: { code: string; detail: string } | undefined
    let settled = false

    const silence = watchSilence(silenceMs, () => {
      if (settled) return
      settled = true
      proc.kill()
      reject(
        new RunFailedError(
          'silent',
          `aec-rag graph-add молчал ${Math.round(silenceMs / 60000)} мин — процесс остановлен. ` +
            'Добавленные документы остаются в графе.'
        )
      )
    })

    // Задача 3M.5 (решение владельца 2026-10-14): «Остановить построение» —
    // сразу. Лаунчер `aec-rag.exe` уносит с собой свой python (замер 2026-10-07
    // у индексации). Готовые документы LightRAG уже записал; начатый остаётся у
    // него «в обработке», и следующий прогон извлекает его заново.
    const stop = (): void => {
      if (settled) return
      settled = true
      silence.stop()
      proc.kill()
      reject(new RunFailedError('stopped', 'Построение графа остановлено'))
    }
    if (signal?.aborted) stop()
    else signal?.addEventListener('abort', stop, { once: true })

    proc.stdout.on('data', (chunk: Buffer) => {
      silence.poke()
      const parsed = readGraphLines(pending + chunk.toString('utf8'))
      pending = parsed.rest
      for (const event of parsed.progress) onProgress(event)
      if (parsed.report) report = parsed.report
      if (parsed.fatal) fatal = parsed.fatal
    })

    proc.stderr.on('data', (chunk: Buffer) => {
      silence.poke()
      stderrChunks.push(chunk)
    })

    proc.on('error', (error: Error) => {
      if (settled) return
      settled = true
      silence.stop()
      reject(
        new RunFailedError('spawn', `не удалось запустить aec-rag graph-add: ${error.message}`)
      )
    })

    proc.on('close', (code) => {
      if (settled) return
      settled = true
      silence.stop()

      const tail = readGraphLines(pending + '\n')
      fatal = tail.fatal ?? fatal
      if (code !== 0) {
        const stderr = Buffer.concat(stderrChunks).toString('utf8')
        const detail = `aec-rag graph-add завершился с ошибкой (код ${code}): ${stderr.trim()}`
        reject(new RunFailedError(fatal?.code ?? 'exit', fatal?.detail || detail))
        return
      }
      const finalReport = tail.report ?? report
      if (!finalReport) {
        // Важно именно отказом: выбор к этому моменту УЖЕ записан, и молчаливое
        // «готово» после неизвестного результата показало бы папку в графе,
        // которой там может не быть.
        reject(new RunFailedError('no_report', 'aec-rag graph-add не отчитался о результате'))
        return
      }
      resolve(finalReport)
    })
  })
}

/** Задача 3J.14: граф для вкладки «Граф» — узлы с раскладкой, рёбра, документы.
 *  Только чтение; `document` — `<source>/<rel path>`, только его сущности. */
export function runGraphExport(
  vaultPath: string,
  document: null | string,
  timeoutMs = DEFAULT_PREVIEW_TIMEOUT_MS
): Promise<GraphExport> {
  const extra = document ? ['--document', document] : []
  return runOneShot<GraphExport>('graph-export', vaultPath, timeoutMs, extra)
}

/** Задача 3L.9: граф картой документов — `graph-export --view documents`. */
export function runDocumentMapExport(
  vaultPath: string,
  timeoutMs = DEFAULT_PREVIEW_TIMEOUT_MS
): Promise<GraphDocumentMap> {
  return runOneShot<GraphDocumentMap>('graph-export', vaultPath, timeoutMs, ['--view', 'documents'])
}
