// Журнал приложения — сторона диска (задача 3.29).
//
// ЧТО В НЁМ ОКАЗЫВАЕТСЯ. Всё, что главный процесс и так писал в консоль, плюс
// падения рендерера, которые до сих пор не переживали закрытия окна. Консоль
// перехватывается целиком, а не заменяется вызовами журнала по одному месту:
// строки вроде «gateway did not answer after resume» уже расставлены там, где
// они нужны, и переписывать их ради журнала значило бы трогать всё.
//
// СИНХРОННАЯ ЗАПИСЬ — НАМЕРЕННО. Журнал нужен ровно в тот момент, когда
// приложение падает. Отложенная запись теряет последнюю строку — ту самую.
// Объём мал (десятки строк за запуск), цена синхронности — нулевая.
//
// РЕКУРСИЯ. Внутри перехватчика зовётся СОХРАНЁННАЯ консоль, а не текущая:
// иначе ошибка записи в журнал попыталась бы записаться в журнал.

import { appendFileSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'

import {
  formatLine,
  formatRendererError,
  LOG_MAX_BYTES,
  RECENT_LINES,
  tailLines,
  textOfArgs,
  type RendererErrorReport
} from './app-log-pure'

let logFile: string | undefined
let logDir: string | undefined

type ConsoleMethod = 'log' | 'warn' | 'error'
const original: Partial<Record<ConsoleMethod, (...args: unknown[]) => void>> = {}

/** Прежний файл уезжает в `.1` — один шаг ротации, не архив. Двух файлов
 * хватает: журнал читают по свежим следам, а не за прошлый месяц. */
function rotateIfNeeded(file: string): void {
  try {
    if (statSync(file).size < LOG_MAX_BYTES) return
    renameSync(file, `${file}.1`)
  } catch {
    // файла ещё нет — ротировать нечего
  }
}

export function appendLog(level: string, text: string): void {
  if (!logFile) return
  try {
    rotateIfNeeded(logFile)
    appendFileSync(logFile, formatLine(level, text, new Date().toISOString()), 'utf-8')
  } catch (error: unknown) {
    original.error?.('aecpilot: could not write the app log', error)
  }
}

/**
 * Заводит журнал и подменяет консоль. Зовётся первым делом при старте: всё, что
 * записано раньше, в файл не попадёт.
 *
 * Возвращает путь к файлу — его показывают человеку.
 */
export function installAppLog(directory: string): string {
  logDir = directory
  logFile = join(directory, 'desktop.log')

  mkdirSync(directory, { recursive: true })

  for (const level of ['log', 'warn', 'error'] as ConsoleMethod[]) {
    const previous = console[level].bind(console) as (...args: unknown[]) => void
    original[level] = previous
    console[level] = (...args: unknown[]): void => {
      previous(...args)
      appendLog(level, textOfArgs(args))
    }
  }

  appendLog('log', '— запуск —')
  return logFile
}

/** Хвост журнала для их экрана восстановления после неудачного старта. */
export function recentLogs(): { path: string; lines: string[] } {
  if (!logFile) return { path: '', lines: [] }
  try {
    return { path: logFile, lines: tailLines(readFileSync(logFile, 'utf-8'), RECENT_LINES) }
  } catch {
    return { path: logFile, lines: [] }
  }
}

/** Падение рендерера. Единственная запись, которая приходит СНАРУЖИ главного
 * процесса, поэтому и разбирается пуристой функцией: поля идут из окна. */
export function logRendererError(report: unknown): void {
  const line = formatRendererError(report as RendererErrorReport | undefined)
  if (line) appendLog('error', line)
}

export function logDirectory(): string {
  return logDir ?? ''
}
