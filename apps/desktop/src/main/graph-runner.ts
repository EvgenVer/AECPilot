// Запуск `aec-rag graph-preview` и `aec-rag graph-add` (задача 5.15) — та же
// форма, что у `ingest-runner.ts`, и по той же причине: движок у приложения
// свой, и отметка в граф не должна зависеть от живой сессии агента.
//
// КОМАНД ДВЕ, И ЭТО НЕ ДЕЛЕНИЕ РАДИ ДЕЛЕНИЯ. Предпросмотр отвечает за секунды и
// не пишет ничего; прогон стоит вызова модели на каждый фрагмент и идёт
// минутами. Между ними стоит человек — одной командой их звать нельзя.

import { spawn } from 'node:child_process'
import { join } from 'node:path'

import type {
  GraphExport,
  GraphPreview,
  GraphRunReport,
  GraphScopeKind,
  IngestProgressEvent
} from '../shared/ipc'

import { readGraphLines, readGraphPreview } from './graph-scope-pure'
import { RunFailedError, watchSilence } from './ingest-progress-pure'
import { runOneShot } from './ingest-runner'

// TODO(Phase 6 / task 6.2): та же оговорка про упакованное приложение, что у
// scan-runner и ingest-runner — путь к venv репозитория.
// Python пишет stderr в кодировке консоли Windows, а читаем мы UTF-8 — без этого
// русский отказ `aec-rag` доходит до человека кракозябрами (замер 3G.50).
const AEC_RAG_UTF8 = { PYTHONIOENCODING: 'utf-8' }

function aecRagBinPath(): string {
  const repoRoot = join(__dirname, '../../../../')
  return process.platform === 'win32'
    ? join(repoRoot, '.venv', 'Scripts', 'aec-rag.exe')
    : join(repoRoot, '.venv', 'bin', 'aec-rag')
}

export const DEFAULT_PREVIEW_TIMEOUT_MS = 60 * 1000

// Задача 3J.11 (как D-183 у индексации): прогон кончается, когда замолчал, а не
// когда долго идёт. Прежний потолок в двенадцать часов держал зависший процесс
// полдня с индикатором «идёт». Строка вывода — каждый документ (и журнал
// LightRAG в stderr); полчаса тишины перекрывают один большой документ при
// 1,97 с на фрагмент (замер 2.9a) и параллельных вызовах модели.
export const DEFAULT_GRAPH_SILENCE_MS = 30 * 60 * 1000

function args(command: string, vaultPath: string, path: string, kind: GraphScopeKind): string[] {
  return [command, '--project', vaultPath, '--path', path, '--kind', kind]
}

/** Сколько работы будет, если отметить `path`. Ничего не пишет — это свойство
 *  самой команды (`run_graph_preview`), а не обещание вызывающего. */
export function runGraphPreview(
  vaultPath: string,
  path: string,
  kind: GraphScopeKind,
  timeoutMs = DEFAULT_PREVIEW_TIMEOUT_MS
): Promise<GraphPreview> {
  return new Promise((resolve, reject) => {
    const proc = spawn(aecRagBinPath(), args('graph-preview', vaultPath, path, kind), {
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
  path: string,
  kind: GraphScopeKind,
  onProgress: (progress: IngestProgressEvent) => void,
  extraEnv: Record<string, string> = {},
  silenceMs = DEFAULT_GRAPH_SILENCE_MS
): Promise<GraphRunReport> {
  return new Promise((resolve, reject) => {
    const proc = spawn(aecRagBinPath(), args('graph-add', vaultPath, path, kind), {
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
