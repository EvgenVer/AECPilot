// Task 3J.9: the stop that runs out of grace says which file loses its text pass.
// The python process is replaced by an event emitter — what is under test is the
// runner's bookkeeping, not aec-rag.

import { EventEmitter } from 'node:events'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

class FakeProc extends EventEmitter {
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  stdin = Object.assign(new EventEmitter(), { write: vi.fn() })
  kill = vi.fn(() => {
    this.emit('close', 1)
    return true
  })
}

let proc: FakeProc

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => proc)
}))

const { IngestStoppedError, STOP_GRACE_MS, runIngest } = await import('./ingest-runner')
const { RunFailedError } = await import('./ingest-progress-pure')

const line = (stage: string, rel_path: string): Buffer =>
  Buffer.from(
    JSON.stringify({
      progress: { chunks: 0, done: 0, error: '', rel_path, source_id: 'tasks', stage, total: 2 }
    }) + '\n'
  )

describe('runIngest — остановка (3H.16, 3J.9)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    proc = new FakeProc()
  })
  afterEach(() => vi.useRealTimers())

  it('гашение по истечении ожидания посреди файла называет этот файл', async () => {
    const abort = new AbortController()
    const run = runIngest('D:/vault', () => undefined, { signal: abort.signal })
    proc.stdout.emit('data', line('reading', 'а.pdf'))
    proc.stdout.emit('data', line('file', 'а.pdf'))
    proc.stdout.emit('data', line('reading', 'Изыскания/отчёт.pdf'))

    abort.abort()
    expect(proc.stdin.write).toHaveBeenCalledWith('stop\n')
    vi.advanceTimersByTime(STOP_GRACE_MS)

    const error = await run.catch((e: unknown) => e)
    expect(error).toBeInstanceOf(IngestStoppedError)
    expect((error as InstanceType<typeof IngestStoppedError>).interrupted).toEqual({
      rel_path: 'Изыскания/отчёт.pdf',
      source_id: 'tasks'
    })
  })

  it('остановка на границе файла — никто не теряет работу', async () => {
    const abort = new AbortController()
    const run = runIngest('D:/vault', () => undefined, { signal: abort.signal })
    proc.stdout.emit('data', line('reading', 'а.pdf'))

    abort.abort()
    proc.stdout.emit('data', line('file', 'а.pdf'))
    proc.emit('close', 1)

    const error = await run.catch((e: unknown) => e)
    expect((error as InstanceType<typeof IngestStoppedError>).interrupted).toBeNull()
  })
})

describe('runIngest — прогон без отчёта говорит причину кодом (3J.11)', () => {
  beforeEach(() => {
    proc = new FakeProc()
  })

  it('строка fatal от aec-rag — её код и её текст', async () => {
    const run = runIngest('D:/vault', () => undefined)
    proc.stdout.emit(
      'data',
      Buffer.from('{"fatal": {"code": "provider_key", "detail": "Incorrect API key"}}\n')
    )
    proc.emit('close', 1)

    const error = await run.catch((e: unknown) => e)
    expect(error).toBeInstanceOf(RunFailedError)
    expect((error as InstanceType<typeof RunFailedError>).failure).toEqual({
      code: 'provider_key',
      detail: 'Incorrect API key'
    })
  })

  it('ноль на выходе без отчёта — no_report, ненулевой без fatal — exit', async () => {
    const quiet = runIngest('D:/vault', () => undefined)
    proc.emit('close', 0)
    const first = await quiet.catch((e: unknown) => e)
    expect((first as InstanceType<typeof RunFailedError>).failure.code).toBe('no_report')

    proc = new FakeProc()
    const crashed = runIngest('D:/vault', () => undefined)
    proc.stderr.emit('data', Buffer.from('Traceback ...'))
    proc.emit('close', 1)
    const second = await crashed.catch((e: unknown) => e)
    expect((second as InstanceType<typeof RunFailedError>).failure.code).toBe('exit')
    expect((second as Error).message).toContain('Traceback')
  })
})
