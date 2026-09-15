// Запуск задач по расписанию — сторона процессов (задача 3.6а).
//
// Что это за процесс и почему он вообще нужен — в шапке `cron-runner-pure.ts`.
// Здесь только жизненный цикл: поднять, уронить, пережить неожиданный выход.
//
// ТРИ ПРАВИЛА, КОТОРЫЕ ЗДЕСЬ ДЕРЖАТСЯ.
//
// 1. ПАДЕНИЕ ЭТОГО ПРОЦЕССА НЕ РОНЯЕТ ПРИЛОЖЕНИЕ. Он вспомогательный: без него
//    не работают расписания, всё остальное работает. Поэтому неожиданный выход
//    — это запись в журнал и снятый флаг «работает», а не исключение наверх.
//
// 2. ВЫКЛЮЧЕНО — ЗНАЧИТ ПРОЦЕССА НЕТ. Не «спит», не «висит в фоне»: человек,
//    выключивший расписания, вправе увидеть в диспетчере задач на один питон
//    меньше.
//
// 3. ВЫХОД ИЗ ПРИЛОЖЕНИЯ УБИВАЕТ ЕГО. Осиротевший фоновый процесс, продолжающий
//    запускать задачи агента после закрытия окна, — это не «работает в фоне»,
//    это потеря контроля.

import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { parseCronRunnerPref, serializeCronRunnerPref } from './cron-runner-pure'

export interface CronRunnerState {
  /** Выбор человека. Переживает перезапуск приложения. */
  enabled: boolean
  /** Живёт ли процесс прямо сейчас. Может отличаться от `enabled`: включено, но
   * не поднялось — это разные вещи, и человеку показывается именно это. */
  running: boolean
}

export interface CronRunnerEnv {
  /** Путь к их исполняемому файлу (`hermes`). */
  binary: string
  /** Их домашний каталог — тот же, в котором живёт наш шлюз. */
  homeDir: string
  /** Куда класть файл выбора. */
  userDataDir: string
}

let child: ChildProcess | undefined
let enabled = false
let env: CronRunnerEnv | undefined
let notify: ((state: CronRunnerState) => void) | undefined

function prefPath(): string {
  return join(env?.userDataDir ?? '', 'cron-runner.json')
}

export function cronRunnerState(): CronRunnerState {
  return { enabled, running: child !== undefined && child.exitCode === null }
}

function announce(): void {
  notify?.(cronRunnerState())
}

function launch(): void {
  if (!env || child) return

  // `gateway run` — их же способ поднять шлюз в переднем плане. Платформы не
  // настроены, поэтому наружу он не ходит; в лог он это и пишет.
  // Память в этом процессе живёт по тем же правилам, что в `hermes serve`
  // (runtime/memory-config.mjs, задача 5.1а и D-85): телеметрия mem0 выключена,
  // её файлы — в профиле, а не в `~/.mem0`. Обе переменные читаются при импорте.
  const proc = spawn(env.binary, ['gateway', 'run'], {
    env: {
      ...process.env,
      HERMES_HOME: env.homeDir,
      MEM0_TELEMETRY: 'false',
      MEM0_DIR: join(env.homeDir, 'mem0')
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })

  // Вывод уходит в наш журнал (задача 3.29) через обычный console — там он
  // проходит вырезание секретов и переживает окно.
  proc.stdout.on('data', (chunk: Buffer) => console.log(`cron-runner: ${chunk.toString().trim()}`))
  proc.stderr.on('data', (chunk: Buffer) => console.log(`cron-runner: ${chunk.toString().trim()}`))

  proc.on('exit', (code) => {
    child = undefined
    console.warn(`aecpilot: cron runner exited with code ${code}`)
    announce()
  })

  proc.on('error', (error: unknown) => {
    child = undefined
    console.error('aecpilot: cron runner failed to start', error)
    announce()
  })

  child = proc
}

function halt(): void {
  const proc = child
  child = undefined
  if (proc && proc.exitCode === null) proc.kill()
}

/** Читает сохранённый выбор и, если он «включено», поднимает процесс.
 * Зовётся один раз при старте, после того как шлюз уже поднят. */
export function restoreCronRunner(environment: CronRunnerEnv): CronRunnerState {
  env = environment

  try {
    enabled = existsSync(prefPath())
      ? parseCronRunnerPref(readFileSync(prefPath(), 'utf-8'))
      : false
  } catch {
    enabled = false
  }

  if (enabled) launch()
  return cronRunnerState()
}

export function onCronRunnerChanged(callback: (state: CronRunnerState) => void): void {
  notify = callback
}

export function setCronRunner(on: unknown): CronRunnerState {
  enabled = on === true

  try {
    writeFileSync(prefPath(), serializeCronRunnerPref(enabled), 'utf-8')
  } catch (error: unknown) {
    console.error('aecpilot: could not save the cron runner preference', error)
  }

  if (enabled) launch()
  else halt()

  const state = cronRunnerState()
  announce()
  return state
}

/** Выход из приложения. Флаг НЕ трогается: человек включил расписания, и в
 * следующий запуск они должны включиться сами. */
export function stopCronRunner(): void {
  halt()
}
