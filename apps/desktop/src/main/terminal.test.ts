// Задача 3E.8 (UR30, отменённый HX7). Настоящая оболочка здесь не поднимается —
// проверяется НАШЕ поведение вокруг неё: что за нами не остаётся процессов,
// что число из окна не уезжает в нативный модуль как есть, и что незнакомый
// номер получает ответ, а не исключение.

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WebContents } from 'electron'

import {
  clampSize,
  configureTerminal,
  defaultShell,
  disposeAllTerminals,
  disposeTerminal,
  disposeTerminalsOfWindow,
  liveTerminalCount,
  resizeTerminal,
  startTerminal,
  startingCwd,
  writeTerminal
} from './terminal'

class FakePty {
  written: string[] = []
  killed = 0
  resized: Array<[number, number]> = []
  process = '/tmp/where'
  private dataCb: ((chunk: string) => void) | undefined
  private exitCb: ((event: { exitCode: number; signal?: number }) => void) | undefined

  onData(cb: (chunk: string) => void): void {
    this.dataCb = cb
  }

  onExit(cb: (event: { exitCode: number; signal?: number }) => void): void {
    this.exitCb = cb
  }

  write(data: string): void {
    this.written.push(data)
  }

  resize(cols: number, rows: number): void {
    this.resized.push([cols, rows])
  }

  kill(): void {
    this.killed += 1
  }

  say(chunk: string): void {
    this.dataCb?.(chunk)
  }

  die(code = 0): void {
    this.exitCb?.({ exitCode: code })
  }
}

let spawned: Array<{ pty: FakePty; options: Record<string, unknown> }> = []

function harness(): { sender: WebContents; sent: Array<[string, unknown]> } {
  spawned = []
  configureTerminal({
    spawn: ((_shell: string, _args: string[], options: Record<string, unknown>) => {
      const pty = new FakePty()
      spawned.push({ pty, options })
      return pty
    }) as never
  })

  const sent: Array<[string, unknown]> = []
  const sender = {
    id: 1,
    isDestroyed: () => false,
    send: (channel: string, payload: unknown) => sent.push([channel, payload])
  } as unknown as WebContents

  return { sender, sent }
}

afterEach(() => {
  disposeAllTerminals()
  vi.restoreAllMocks()
})

describe('размер окна терминала', () => {
  it('ноль и мусор не уезжают в нативный модуль', () => {
    // Число приходит из окна — с недоверенной стороны, а `node-pty` на нуле
    // строк ведёт себя непредсказуемо.
    expect(clampSize(0, 0)).toEqual({ cols: 1, rows: 1 })
    expect(clampSize('80', null)).toEqual({ cols: 80, rows: 24 })
    // NaN и Infinity — оба «не конечное число», оба уходят к умолчанию, а не
    // к потолку: подставлять 500 строк по бесконечности значило бы принять
    // мусор за просьбу.
    expect(clampSize(NaN, Infinity)).toEqual({ cols: 80, rows: 24 })
    expect(clampSize(99999, 40)).toEqual({ cols: 500, rows: 40 })
  })
})

describe('где открывается оболочка', () => {
  it('в папке проекта, когда она есть', () => {
    expect(startingCwd(undefined, 'D:/проект')).toBe('D:/проект')
  })

  it('запрошенная папка сильнее проекта', () => {
    expect(startingCwd('D:/другое', 'D:/проект')).toBe('D:/другое')
  })

  it('без проекта — домашняя, а не корень диска', () => {
    // В корне человек оказывается там, где ему ничего не нужно.
    expect(startingCwd(undefined, undefined)).not.toBe('')
    expect(startingCwd('   ', undefined)).not.toBe('   ')
  })
})

describe('оболочка по умолчанию', () => {
  it('на windows берётся из окружения', () => {
    expect(defaultShell({ COMSPEC: 'C:/W/pwsh.exe' } as NodeJS.ProcessEnv, 'win32')).toBe(
      'C:/W/pwsh.exe'
    )
  })

  it('человек выбрал свою — берём её, а не любимую', () => {
    expect(defaultShell({ SHELL: '/usr/bin/fish' } as NodeJS.ProcessEnv, 'linux')).toBe(
      '/usr/bin/fish'
    )
  })
})

describe('жизнь сессии', () => {
  it('поток вывода уезжает в ОКНО, а номер сессии едет с ним', async () => {
    const { sender, sent } = harness()
    const session = await startTerminal(sender, { cols: 100, rows: 30 }, 'D:/проект')

    spawned[0].pty.say('привет')

    expect(sent).toEqual([['terminal:data', { id: session.id, chunk: 'привет' }]])
    expect(spawned[0].options).toMatchObject({ cols: 100, rows: 30, cwd: 'D:/проект' })
  })

  it('оболочка умерла — окно узнаёт об этом, и сессия исчезает', async () => {
    const { sender, sent } = harness()
    const session = await startTerminal(sender, undefined, undefined)

    spawned[0].pty.die(1)

    expect(sent.at(-1)).toEqual(['terminal:exit', { id: session.id, code: 1, signal: null }])
    expect(liveTerminalCount()).toBe(0)
    // Дописать в мёртвую — обычная гонка, а не ошибка приложения.
    expect(writeTerminal(session.id, 'ls')).toBe(false)
  })

  it('незнакомый номер получает ответ, а не исключение', () => {
    harness()
    expect(writeTerminal('нет такой', 'ls')).toBe(false)
    expect(resizeTerminal('нет такой', { cols: 10, rows: 10 })).toBe(false)
    expect(disposeTerminal('нет такой')).toBe(false)
  })

  it('закрыли окно — его оболочки убиты', async () => {
    const { sender } = harness()
    await startTerminal(sender, undefined, undefined)
    await startTerminal(sender, undefined, undefined)

    disposeTerminalsOfWindow(1)

    // Иначе после закрытия остались бы живые оболочки, о которых никто не
    // знает: не «фоновая работа», а утечка процессов.
    expect(spawned.map((s) => s.pty.killed)).toEqual([1, 1])
    expect(liveTerminalCount()).toBe(0)
  })

  it('чужое окно свои оболочки не теряет', async () => {
    const { sender } = harness()
    await startTerminal(sender, undefined, undefined)

    disposeTerminalsOfWindow(2)

    expect(spawned[0].pty.killed).toBe(0)
    expect(liveTerminalCount()).toBe(1)
  })
})
