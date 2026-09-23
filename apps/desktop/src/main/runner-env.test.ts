// D-115: индексация и построение графа запускают `aec-rag` отдельным процессом,
// и эмбеддинги в нём берут ключ провайдера из окружения. Ключ человека лежит в
// нашем зашифрованном хранилище, поэтому раннер обязан передать его в `env`
// процесса — поверх окружения приложения, а не вместо него.

import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const spawnMock = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({ spawn: spawnMock }))

import { runGraphAdd } from './graph-runner'
import { runIngest } from './ingest-runner'

class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  kill = vi.fn()
}

const KEY_ENV = { OPENAI_API_KEY: 'test-placeholder-not-a-key' }

function spawnedEnv(): Record<string, string | undefined> {
  const options = spawnMock.mock.calls[0][2] as { env?: Record<string, string | undefined> }
  return options.env ?? {}
}

beforeEach(() => {
  spawnMock.mockReset().mockReturnValue(new FakeChildProcess())
})

describe('ключ провайдера доезжает до aec-rag (D-115)', () => {
  it('runIngest кладёт переданное окружение поверх окружения приложения', () => {
    void runIngest('C:/vault', () => {}, { extraEnv: KEY_ENV }).catch(() => {})
    const env = spawnedEnv()
    expect(env.OPENAI_API_KEY).toBe(KEY_ENV.OPENAI_API_KEY)
    expect(env.PATH ?? env.Path).toBe(process.env.PATH ?? process.env.Path)
  })

  it('runGraphAdd — так же', () => {
    void runGraphAdd('C:/vault', 'docs', 'folder', () => {}, KEY_ENV).catch(() => {})
    const env = spawnedEnv()
    expect(env.OPENAI_API_KEY).toBe(KEY_ENV.OPENAI_API_KEY)
    expect(env.PATH ?? env.Path).toBe(process.env.PATH ?? process.env.Path)
  })
})
