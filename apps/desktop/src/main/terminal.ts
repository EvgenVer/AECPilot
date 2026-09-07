// Живая оболочка терминала (задача 3E.8, UR30; отменённый SPEC HX7).
//
// ЦЕНА ЭТОГО КАНАЛА НАЗВАНА В САМОМ HX7 И НЕ ИСЧЕЗЛА С ЕГО ОТМЕНОЙ: это
// «выполнить что угодно» в обход проверки команд. Ответ на неё — не запрет
// здесь, а R21: разрушающее подтверждает человек (задача 3E.7). Разница
// принципиальная и её стоит понимать: `detect_dangerous_command` смотрит
// команды АГЕНТА, а этот канал — руки ЧЕЛОВЕКА. Человек в своём терминале не
// нуждается в подтверждении от нас, он и есть тот, кто подтверждает.
//
// ЧТО ЗДЕСЬ ЕСТЬ И ЧЕГО НЕТ. Есть ровно шесть глаголов их контракта
// (`global.d.ts::terminal`) и два потока событий. Нет ни разбора вывода, ни
// истории, ни своих команд: разбирать поток умеет их же `xterm`, уже
// перенесённый вместе с панелью.
//
// СЕССИЯ ПРИНАДЛЕЖИТ ОКНУ, А НЕ ПРИЛОЖЕНИЮ. Закрыли окно — оболочки этого окна
// убиты. Иначе после закрытия остались бы живые `cmd.exe`, о которых никто не
// знает и которые никто не остановит: это не «фоновая работа», это утечка
// процессов, и на второй день их там десяток.

import { randomUUID } from 'node:crypto'
import { homedir, platform } from 'node:os'

import type { IPty } from 'node-pty'
import type { WebContents } from 'electron'

export interface TerminalSession {
  cwd: string
  id: string
  shell: string
}

interface Live {
  pty: IPty
  owner: number
  cwd: string
  shell: string
}

const sessions = new Map<string, Live>()

/** Оболочка по умолчанию. Читается из окружения, потому что человек мог
 * выбрать свою; запасной путь — системная, а не наша любимая. */
export function defaultShell(env: NodeJS.ProcessEnv = process.env, host = platform()): string {
  if (host === 'win32') return env.COMSPEC || 'cmd.exe'
  return env.SHELL || '/bin/bash'
}

/** Размер окна терминала. Ноль и мусор недопустимы: `node-pty` на нуле строк
 * ведёт себя непредсказуемо, а число приходит из окна, то есть с недоверенной
 * стороны. */
export function clampSize(cols: unknown, rows: unknown): { cols: number; rows: number } {
  const fit = (value: unknown, fallback: number): number => {
    const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback
    return Math.min(500, Math.max(1, n))
  }

  return { cols: fit(cols, 80), rows: fit(rows, 24) }
}

/** Куда открывать оболочку. Папка проекта, если она есть, иначе домашняя: в
 * корне диска человек оказывается там, где ему ничего не нужно. */
export function startingCwd(requested: unknown, projectPath: string | undefined): string {
  if (typeof requested === 'string' && requested.trim() !== '') return requested
  return projectPath && projectPath !== '' ? projectPath : homedir()
}

export interface TerminalDeps {
  spawn: typeof import('node-pty').spawn
}

let deps: TerminalDeps | undefined

/** Подменяется в тестах; нативный модуль в узловом наборе не поднимается. */
export function configureTerminal(value: TerminalDeps): void {
  deps = value
}

async function pty(): Promise<TerminalDeps> {
  if (!deps) deps = (await import('node-pty')) as unknown as TerminalDeps
  return deps
}

export async function startTerminal(
  sender: WebContents,
  options: { cols?: unknown; rows?: unknown; cwd?: unknown } | undefined,
  projectPath: string | undefined
): Promise<TerminalSession> {
  const { spawn } = await pty()
  const shell = defaultShell()
  const cwd = startingCwd(options?.cwd, projectPath)
  const { cols, rows } = clampSize(options?.cols, options?.rows)
  const id = randomUUID()

  const child = spawn(shell, [], {
    name: 'xterm-color',
    cols,
    rows,
    cwd,
    env: process.env as Record<string, string>
  })

  sessions.set(id, { pty: child, owner: sender.id, cwd, shell })

  child.onData((chunk) => {
    if (!sender.isDestroyed()) sender.send('terminal:data', { id, chunk })
  })

  child.onExit(({ exitCode, signal }) => {
    sessions.delete(id)
    if (!sender.isDestroyed()) {
      sender.send('terminal:exit', { id, code: exitCode ?? null, signal: signal ?? null })
    }
  })

  return { id, cwd, shell }
}

/** Все три глагола ниже отвечают `false` на незнакомый номер, а не бросают:
 * окно может дописать в оболочку, которая только что умерла сама, и это не
 * ошибка приложения, а обычная гонка. */
export function writeTerminal(id: unknown, data: unknown): boolean {
  const live = sessions.get(String(id))
  if (!live || typeof data !== 'string') return false
  live.pty.write(data)
  return true
}

export function resizeTerminal(
  id: unknown,
  size: { cols?: unknown; rows?: unknown } | undefined
): boolean {
  const live = sessions.get(String(id))
  if (!live) return false
  const { cols, rows } = clampSize(size?.cols, size?.rows)
  try {
    live.pty.resize(cols, rows)
    return true
  } catch {
    return false
  }
}

export function disposeTerminal(id: unknown): boolean {
  const live = sessions.get(String(id))
  if (!live) return false
  sessions.delete(String(id))
  try {
    live.pty.kill()
  } catch {
    // Уже умерла — цель достигнута.
  }
  return true
}

/**
 * Текущая папка оболочки.
 *
 * НА WINDOWS ОТВЕТ `null`, И ЭТО ИХ ЖЕ КОНТРАКТ («POSIX only; null on Windows
 * or when unavailable»). Узнать её там можно только опросом процесса-потомка;
 * врать папкой, в которой оболочка ЗАПУСТИЛАСЬ, хуже, чем не ответить: вкладка
 * открылась бы не там, где человек работал, и он бы этого не заметил.
 */
export function terminalCwd(id: unknown): string | null {
  const live = sessions.get(String(id))
  if (!live || platform() === 'win32') return null
  try {
    return live.pty.process || null
  } catch {
    return null
  }
}

/** Окно закрылось — его оболочки закрываются вместе с ним. */
export function disposeTerminalsOfWindow(webContentsId: number): void {
  for (const [id, live] of sessions) {
    if (live.owner !== webContentsId) continue
    sessions.delete(id)
    try {
      live.pty.kill()
    } catch {
      // Уже умерла.
    }
  }
}

/** Выход из приложения — то же самое для всех окон сразу. */
export function disposeAllTerminals(): void {
  for (const [id, live] of sessions) {
    sessions.delete(id)
    try {
      live.pty.kill()
    } catch {
      // Уже умерла.
    }
  }
}

/** Для тестов: сколько оболочек живо. */
export function liveTerminalCount(): number {
  return sessions.size
}
