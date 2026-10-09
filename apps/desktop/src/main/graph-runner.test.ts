// Task 3J.11: a graph run is ended when it goes quiet, and every way it ends
// without a report carries a code. The python process is an event emitter.

import { EventEmitter } from 'node:events'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

class FakeProc extends EventEmitter {
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  kill = vi.fn(() => true)
}

let proc: FakeProc

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => proc)
}))

const { runGraphAdd } = await import('./graph-runner')
const { RunFailedError } = await import('./ingest-progress-pure')

const failureOf = async (run: Promise<unknown>): Promise<unknown> =>
  run.then(
    () => null,
    (error: unknown) => (error instanceof RunFailedError ? error.failure.code : error)
  )

describe('runGraphAdd — сторож тишины и причины кодом (3J.11)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    proc = new FakeProc()
  })
  afterEach(() => vi.useRealTimers())

  it('замолчал — остановлен с кодом silent; каждая строка вывода отодвигает срок', async () => {
    const run = runGraphAdd('D:/vault', 'tasks', 'folder', () => undefined, {}, 1000)
    vi.advanceTimersByTime(900)
    proc.stderr.emit('data', Buffer.from('INFO: Chunk 3 of 40 extracted\n'))
    vi.advanceTimersByTime(900)
    expect(proc.kill).not.toHaveBeenCalled()

    vi.advanceTimersByTime(200)
    expect(proc.kill).toHaveBeenCalledTimes(1)
    expect(await failureOf(run)).toBe('silent')
  })

  it('строка fatal даёт свой код, выход без отчёта — no_report', async () => {
    const refused = runGraphAdd('D:/vault', 'tasks', 'folder', () => undefined, {}, 1000)
    proc.stdout.emit(
      'data',
      Buffer.from('{"fatal": {"code": "provider_key", "detail": "Incorrect API key"}}\n')
    )
    proc.emit('close', 1)
    expect(await failureOf(refused)).toBe('provider_key')

    proc = new FakeProc()
    const silent = runGraphAdd('D:/vault', 'tasks', 'folder', () => undefined, {}, 1000)
    proc.emit('close', 0)
    expect(await failureOf(silent)).toBe('no_report')
  })
})
