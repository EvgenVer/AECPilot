// Unit tests for task 1.14's aec-rag spawn wrapper (review fix-iteration 1,
// minor 6d) — mocks node:child_process's `spawn` with a fake ChildProcess
// (a plain EventEmitter with stdout/stderr sub-emitters and a `kill` spy) so
// every error branch (non-zero exit, malformed stdout, missing binary,
// timeout) can be driven deterministically without a real aec-rag.exe.

import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const spawnMock = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({ spawn: spawnMock }))

// The development layout whatever lies on disk (task T21.2): a staged `runtime/mcp`
// adds the `-s -m aec_rag` prefix — `aec-rag-command.test.ts` covers that form.
vi.mock('./aec-rag-command', () => ({
  aecRagCommand: () => 'aec-rag',
  aecRagArgs: (rest: string[]) => rest
}))

import {
  DEFAULT_DETACH_TIMEOUT_MS,
  DEFAULT_SCAN_TIMEOUT_MS,
  runDetach,
  runScan
} from './scan-runner'

class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  kill = vi.fn()
}

let proc: FakeChildProcess

beforeEach(() => {
  proc = new FakeChildProcess()
  spawnMock.mockReset().mockReturnValue(proc)
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('runScan', () => {
  it('resolves with the parsed JSON report on a clean exit', async () => {
    const promise = runScan('C:/vault')
    proc.stdout.emit('data', Buffer.from('{"sources":{}}', 'utf8'))
    proc.emit('close', 0)

    await expect(promise).resolves.toEqual({ sources: {} })
  })

  it('decodes stdout correctly even when a multi-byte UTF-8 character is split across chunks', async () => {
    const report = { sources: { src: { added: ['привет.txt'], root_unavailable: false } } }
    const full = Buffer.from(JSON.stringify(report), 'utf8')
    // Split in the middle of "привет"'s first Cyrillic character (2 UTF-8
    // bytes each) — find its byte offset and cut one byte into it.
    const splitAt = full.indexOf(Buffer.from('привет', 'utf8')) + 1

    const promise = runScan('C:/vault')
    proc.stdout.emit('data', full.subarray(0, splitAt))
    proc.stdout.emit('data', full.subarray(splitAt))
    proc.emit('close', 0)

    await expect(promise).resolves.toEqual(report)
  })

  it('rejects with a message including stderr on a non-zero exit', async () => {
    const promise = runScan('C:/vault')
    proc.stderr.emit('data', Buffer.from('aec-rag: project.json not found\n', 'utf8'))
    proc.emit('close', 1)

    await expect(promise).rejects.toThrow(/aec-rag: project.json not found/)
  })

  it('rejects on malformed JSON stdout', async () => {
    const promise = runScan('C:/vault')
    proc.stdout.emit('data', Buffer.from('not json', 'utf8'))
    proc.emit('close', 0)

    await expect(promise).rejects.toThrow(/не удалось разобрать отчёт/)
  })

  it('rejects when the binary is missing (spawn error)', async () => {
    const promise = runScan('C:/vault')
    proc.emit('error', new Error('ENOENT'))

    await expect(promise).rejects.toThrow(/не удалось запустить aec-rag scan/)
  })

  it('kills the process and rejects if it hangs past the timeout', async () => {
    const promise = runScan('C:/vault', 1000)
    // Ignore the unhandled-rejection-before-assertion window: attach the
    // rejection expectation before advancing fake timers.
    const assertion = expect(promise).rejects.toThrow(/принудительно остановлен/)

    await vi.advanceTimersByTimeAsync(1000)

    await assertion
    expect(proc.kill).toHaveBeenCalledTimes(1)
  })

  it('does not reject twice if close fires after the timeout already settled it', async () => {
    const promise = runScan('C:/vault', 1000)
    const assertion = expect(promise).rejects.toThrow(/принудительно остановлен/)

    await vi.advanceTimersByTimeAsync(1000)
    // A late close event (the killed process finally exiting) must be a
    // no-op — the promise already settled.
    proc.emit('close', 0)

    await assertion
  })

  it('clears the timeout timer on a normal close (no dangling timer)', async () => {
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')
    const promise = runScan('C:/vault', DEFAULT_SCAN_TIMEOUT_MS)
    proc.stdout.emit('data', Buffer.from('{"sources":{}}', 'utf8'))
    proc.emit('close', 0)

    await promise
    expect(clearTimeoutSpy).toHaveBeenCalled()
  })
})

// Task 1.16: same spawn wrapper shape as `runScan` above, against
// `aec-rag detach` instead — reuses the same fake-ChildProcess/fake-timers
// setup (`proc`, `beforeEach`/`afterEach` above).
describe('runDetach', () => {
  it('resolves with the parsed JSON report on a clean exit', async () => {
    const promise = runDetach('C:/vault', 'src-1')
    proc.stdout.emit('data', Buffer.from('{"source_id":"src-1","detached":2}', 'utf8'))
    proc.emit('close', 0)

    await expect(promise).resolves.toEqual({ source_id: 'src-1', detached: 2 })
    expect(spawnMock).toHaveBeenCalledWith(
      expect.any(String),
      ['detach', '--project', 'C:/vault', '--source', 'src-1'],
      expect.objectContaining({ windowsHide: true })
    )
  })

  it('rejects with a message including stderr on a non-zero exit', async () => {
    const promise = runDetach('C:/vault', 'src-1')
    proc.stderr.emit('data', Buffer.from('aec-rag: project.json not found\n', 'utf8'))
    proc.emit('close', 1)

    await expect(promise).rejects.toThrow(/aec-rag: project.json not found/)
  })

  it('rejects when the binary is missing (spawn error)', async () => {
    const promise = runDetach('C:/vault', 'src-1')
    proc.emit('error', new Error('ENOENT'))

    await expect(promise).rejects.toThrow(/не удалось запустить aec-rag detach/)
  })

  it('kills the process and rejects if it hangs past the (short) timeout', async () => {
    const promise = runDetach('C:/vault', 'src-1', 1000)
    const assertion = expect(promise).rejects.toThrow(/принудительно остановлен/)

    await vi.advanceTimersByTimeAsync(1000)

    await assertion
    expect(proc.kill).toHaveBeenCalledTimes(1)
  })

  it('uses a much shorter default timeout than a full scan', () => {
    expect(DEFAULT_DETACH_TIMEOUT_MS).toBeLessThan(DEFAULT_SCAN_TIMEOUT_MS)
  })
})
