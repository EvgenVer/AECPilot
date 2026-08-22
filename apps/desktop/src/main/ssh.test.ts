// Задача 3.12, вторая половина (SPEC UR20). Здесь проверяется то, что обычно
// проверяют только руками у живого сервера: куда ушёл токен, что осталось после
// отказа и что бывает, когда соединение умирает уже после успеха.
//
// Сам `ssh` не запускается — вместо него поддельный процесс. Предмет проверки
// не «работает ли ssh» (он работает), а наше поведение вокруг него.

import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { activeSshTunnel, configureSsh, probeSsh, startSshTunnel, stopSshTunnel } from './ssh'
import type { SshTarget } from './ssh-pure'

const TARGET: SshTarget = {
  host: 'build.example.org',
  user: 'ivan',
  port: null,
  identityFile: '',
  remoteHermesPath: '',
  remoteProfile: ''
}

class FakeSsh extends EventEmitter {
  stdinWrites: string[] = []
  killed: string[] = []
  exitCode: number | null = null
  signalCode: string | null = null

  stderr = new EventEmitter()
  stdout = new EventEmitter()
  stdin = {
    write: (chunk: string) => this.stdinWrites.push(chunk),
    end: () => undefined
  }

  kill(signal?: string): boolean {
    this.killed.push(signal ?? 'SIGTERM')
    return true
  }

  /** Процесс закончился — как это увидел бы Node. */
  die(code = 255): void {
    this.exitCode = code
    this.emit('exit', code, null)
  }

  fail(text: string): void {
    this.stderr.emit('data', Buffer.from(text, 'utf-8'))
  }

  say(text: string): void {
    this.stdout.emit('data', Buffer.from(text, 'utf-8'))
  }
}

let spawned: FakeSsh[] = []
let args: string[][] = []
let probeAnswers: boolean[] = []
let script: Array<() => void> = []
let clock = 0

function setup(options: { probe?: (url: string) => Promise<boolean> } = {}): void {
  spawned = []
  args = []
  script = []
  clock = 0

  configureSsh({
    spawnSsh: (argv) => {
      args.push(argv)
      const proc = new FakeSsh()
      spawned.push(proc)
      return proc as unknown as ChildProcess
    },
    probe: options.probe ?? (async () => probeAnswers.shift() ?? false),
    freePort: async () => 45123,
    // Время идёт от ожидания — иначе тест на «не дождались» шёл бы 45 секунд.
    // Здесь же разыгрывается сценарий: что происходит на той стороне, пока мы
    // ждём.
    wait: async (ms) => {
      clock += ms
      script.shift()?.()
    },
    now: () => clock
  })
}

beforeEach(() => {
  probeAnswers = []
  setup()
})

afterEach(async () => {
  await stopSshTunnel()
})

describe('успешное подключение', () => {
  it('токен уходит в стандартный ввод, а не в аргументы', async () => {
    probeAnswers = [true]

    const result = await startSshTunnel(TARGET)

    expect(result.ok).toBe(true)

    const token = spawned[0].stdinWrites.join('').trim()
    expect(token, 'токен назначаем мы — новый на каждое подключение').toHaveLength(48)
    expect(args[0].join(' '), 'вот это и есть обещание').not.toContain(token)
    expect(activeSshTunnel()).toEqual({ baseUrl: 'http://127.0.0.1:45123', token })
  })

  it('токен не повторяется между подключениями', async () => {
    probeAnswers = [true]
    await startSshTunnel(TARGET)
    const first = activeSshTunnel()?.token

    probeAnswers = [true]
    await startSshTunnel(TARGET)

    expect(activeSshTunnel()?.token).not.toBe(first)
  })

  it('второе подключение не оставляет первого — иначе туннелей станет двое', async () => {
    probeAnswers = [true]
    await startSshTunnel(TARGET)

    probeAnswers = [true]
    await startSshTunnel(TARGET)

    expect(spawned[0].killed.length, 'старую сессию закрыли').toBeGreaterThan(0)
    expect(spawned).toHaveLength(2)
  })

  it('ядро отвечает не сразу — ждём, а не сдаёмся на первой попытке', async () => {
    probeAnswers = [false, false, true]

    expect((await startSshTunnel(TARGET)).ok).toBe(true)
    expect(clock, 'между попытками была пауза').toBeGreaterThan(0)
  })
})

describe('соединение оборвалось', () => {
  it('умершая сессия убирает цель — запросы не должны уходить в закрытый порт', async () => {
    probeAnswers = [true]
    await startSshTunnel(TARGET)
    expect(activeSshTunnel()).toBeDefined()

    spawned[0].die(0)

    expect(activeSshTunnel()).toBeUndefined()
  })

  it('остановка закрывает сессию', async () => {
    probeAnswers = [true]
    await startSshTunnel(TARGET)

    await stopSshTunnel()

    expect(spawned[0].killed).toContain('SIGTERM')
    expect(activeSshTunnel()).toBeUndefined()
  })

  it('не закрывшуюся сессию добиваем — иначе останется висеть', async () => {
    probeAnswers = [true]
    await startSshTunnel(TARGET)

    await stopSshTunnel()

    expect(spawned[0].killed).toEqual(['SIGTERM', 'SIGKILL'])
  })
})

describe('сервер не пустил', () => {
  it('причина называется своим именем, а цели не появляется', async () => {
    setup({
      probe: async () => {
        spawned[0].fail('ivan@build.example.org: Permission denied (publickey).')
        spawned[0].die()
        return false
      }
    })

    const result = await startSshTunnel(TARGET)

    expect(result.ok).toBe(false)
    expect(result.sshError).toBe('auth-failed')
    expect(result.error, 'человеку нужно действие, а не код').toContain('по ключу')
    expect(activeSshTunnel()).toBeUndefined()
  })

  it('изменившийся ключ хоста не выдаётся за «что-то пошло не так»', async () => {
    setup({
      probe: async () => {
        spawned[0].fail('@@@ WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED! @@@')
        spawned[0].die()
        return false
      }
    })

    expect((await startSshTunnel(TARGET)).sshError).toBe('host-key-changed')
  })

  it('отсутствие самого ssh — это ответ, а не падение приложения', async () => {
    setup({
      probe: async () => {
        spawned[0].emit('error', new Error('spawn ssh ENOENT'))
        return false
      }
    })

    const result = await startSshTunnel(TARGET)

    expect(result.ok).toBe(false)
    expect(result.sshError).toBe('unknown')
  })

  it('не дождались — сессию за собой закрываем', async () => {
    setup({ probe: async () => false })

    const result = await startSshTunnel(TARGET)

    expect(result.sshError).toBe('timeout')
    expect(spawned[0].killed.length, 'иначе за нами остался бы процесс').toBeGreaterThan(0)
    expect(activeSshTunnel()).toBeUndefined()
  })
})

describe('проверка подключения', () => {
  const NL = String.fromCharCode(10)

  it('находит ядро и говорит, где оно и какое', async () => {
    script = [
      () => {
        spawned[0].say(['path=/usr/local/bin/hermes', 'platform=Linux', 'version=0.20.0'].join(NL))
        spawned[0].die(0)
      }
    ]

    const result = await probeSsh(TARGET)

    expect(result).toEqual({
      ok: true,
      host: 'build.example.org',
      remoteHermesPath: '/usr/local/bin/hermes',
      remoteHermesVersion: '0.20.0',
      remotePlatform: 'Linux'
    })
  })

  it('живому подключению не мешает — она ничего не занимает', async () => {
    probeAnswers = [true]
    await startSshTunnel(TARGET)
    const live = activeSshTunnel()

    script = [
      () => {
        spawned[1].say('path=/usr/bin/hermes')
        spawned[1].die(0)
      }
    ]
    await probeSsh(TARGET)

    expect(activeSshTunnel(), 'подключение осталось прежним').toEqual(live)
  })

  it('сервер пустил, а ядра нет — это отдельный ответ с отдельным действием', async () => {
    script = [
      () => {
        spawned[0].say(['path=', 'platform=Linux', 'version='].join(NL))
        spawned[0].die(0)
      }
    ]

    const result = await probeSsh(TARGET)

    expect(result.ok).toBe(false)
    expect(result.sshError).toBe('hermes-not-found')
    expect(result.remotePlatform, 'что удалось узнать — говорим').toBe('Linux')
    expect(result.error).toContain('путь')
  })

  it('не пустил — причина называется, а не прячется за «не получилось»', async () => {
    script = [
      () => {
        spawned[0].fail('ivan@build: Permission denied (publickey).')
        spawned[0].die(255)
      }
    ]

    const result = await probeSsh(TARGET)

    expect(result.ok).toBe(false)
    expect(result.sshError).toBe('auth-failed')
  })

  it('молчание не длится вечно', async () => {
    const result = await probeSsh(TARGET)

    expect(result.sshError).toBe('timeout')
    expect(spawned[0].killed.length, 'за нами не остаётся процесса').toBeGreaterThan(0)
  })
})
