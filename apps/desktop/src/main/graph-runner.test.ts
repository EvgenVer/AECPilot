// Task 3J.11: a graph run is ended when it goes quiet, and every way it ends
// without a report carries a code. The python process is an event emitter.

import { EventEmitter } from 'node:events'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

class FakeProc extends EventEmitter {
  stdin = null
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  kill = vi.fn(() => true)
}

let proc: FakeProc

const spawn = vi.fn((..._args: unknown[]) => proc)
vi.mock('node:child_process', () => ({ spawn }))

const { runDocumentMapExport, runGraphAdd, runGraphExport, runGraphPreview } =
  await import('./graph-runner')
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

describe('runGraphExport (3J.14)', () => {
  beforeEach(() => {
    proc = new FakeProc()
  })

  it('документ уходит аргументом --document, ответ — разобранный JSON', async () => {
    const run = runGraphExport('D:/vault', 'tasks/ИГИ/отчёт.pdf')
    proc.stdout.emit('data', Buffer.from('{"graph_exists": false, "nodes": []}'))
    proc.emit('close', 0)

    expect(await run).toMatchObject({ graph_exists: false })
    expect(spawn.mock.calls.at(-1)?.[1]).toEqual([
      'graph-export',
      '--project',
      'D:/vault',
      '--document',
      'tasks/ИГИ/отчёт.pdf'
    ])
  })
})

describe('«Перестроить граф» (3L.7)', () => {
  beforeEach(() => {
    proc = new FakeProc()
  })

  it('без пути обе команды уходят с --rebuild и без --path', () => {
    void runGraphPreview('D:/vault', null, 'folder')
    expect(spawn.mock.calls.at(-1)?.[1]).toEqual([
      'graph-preview',
      '--project',
      'D:/vault',
      '--rebuild'
    ])
    void runGraphAdd('D:/vault', null, 'folder', () => undefined).catch(() => undefined)
    expect(spawn.mock.calls.at(-1)?.[1]).toEqual([
      'graph-add',
      '--project',
      'D:/vault',
      '--rebuild'
    ])
  })
})

describe('runDocumentMapExport (3L.9)', () => {
  beforeEach(() => {
    proc = new FakeProc()
  })

  it('уходит с --view documents, ответ — разобранный JSON', async () => {
    const run = runDocumentMapExport('D:/vault')
    proc.stdout.emit('data', Buffer.from('{"view": "documents", "nodes": [], "edges": []}'))
    proc.emit('close', 0)

    expect(await run).toMatchObject({ view: 'documents' })
    expect(spawn.mock.calls.at(-1)?.[1]).toEqual([
      'graph-export',
      '--project',
      'D:/vault',
      '--view',
      'documents'
    ])
  })
})
