// Unit tests for the vendored agent-terminal stream (task 1.6.B6.11).
//
// The module keeps its buffers in module-level maps, exactly as the donor does,
// so every test uses its OWN process id instead of a reset hook: adding a
// production function that exists only to make tests independent would change
// the island. `forgetAgentTerminal` is the one addition, and it is tested as
// the behaviour it is (a closed tab must not keep 256 KB alive), not used as a
// fixture teardown.

import { describe, expect, it } from 'vitest'
import {
  agentTerminalBacklog,
  forgetAgentTerminal,
  registerAgentTerminalWriter,
  seedAgentTerminalCommand,
  syncAgentTerminalSnapshot,
  TERMINAL_RESET,
  writeAgentTerminalChunk
} from './agent-terminal-stream'

describe('agent terminal stream', () => {
  it('writes a chunk to a mounted tab', () => {
    const written: string[] = []
    registerAgentTerminalWriter('p-write', (chunk) => written.push(chunk))
    writeAgentTerminalChunk('p-write', 'hello\r\n')

    expect(written).toEqual(['hello\r\n'])
  })

  it('replays the whole backlog into a tab opened mid-stream', () => {
    writeAgentTerminalChunk('p-late', 'first\r\n')
    writeAgentTerminalChunk('p-late', 'second\r\n')

    const written: string[] = []
    registerAgentTerminalWriter('p-late', (chunk) => written.push(chunk))

    expect(written).toEqual(['first\r\nsecond\r\n'])
  })

  it('keeps buffering with no tab mounted', () => {
    writeAgentTerminalChunk('p-headless', 'output')
    expect(agentTerminalBacklog('p-headless')).toBe('output')
  })

  it('caps the backlog at 256 000 characters, keeping the tail', () => {
    writeAgentTerminalChunk('p-cap', 'A'.repeat(200_000))
    writeAgentTerminalChunk('p-cap', 'B'.repeat(100_000))

    const buffered = agentTerminalBacklog('p-cap')
    expect(buffered).toHaveLength(256_000)
    // The end survives, the beginning is what gets dropped.
    expect(buffered.endsWith('B'.repeat(100_000))).toBe(true)
    expect(buffered.startsWith('A')).toBe(true)
  })

  it('unregisters idempotently and leaves a later writer alone', () => {
    const first: string[] = []
    const second: string[] = []
    const unregisterFirst = registerAgentTerminalWriter('p-swap', (chunk) => first.push(chunk))
    unregisterFirst()
    registerAgentTerminalWriter('p-swap', (chunk) => second.push(chunk))
    // The stale unregister must not remove the tab that replaced it.
    unregisterFirst()

    writeAgentTerminalChunk('p-swap', 'after')
    expect(first).toEqual([])
    expect(second).toEqual(['after'])
  })

  it('seeds the command once, so a tab never opens as an empty void', () => {
    seedAgentTerminalCommand('p-seed', ' npm run dev ')
    seedAgentTerminalCommand('p-seed', 'npm run dev')

    expect(agentTerminalBacklog('p-seed')).toBe('$ npm run dev\r\n')
  })

  it('seeds an empty buffer from a snapshot, then appends only the delta', () => {
    const written: string[] = []
    registerAgentTerminalWriter('p-delta', (chunk) => written.push(chunk))

    syncAgentTerminalSnapshot('p-delta', 'line one\n')
    syncAgentTerminalSnapshot('p-delta', 'line one\nline two\n')

    expect(written).toEqual(['line one\n', 'line two\n'])
    expect(agentTerminalBacklog('p-delta')).toBe('line one\nline two\n')
  })

  // MEASURED, not assumed: the donor compares a snapshot against the PREVIOUS
  // SNAPSHOT before it compares against the buffer, and with no previous
  // snapshot every string "extends" the empty one — so a first snapshot landing
  // on top of streamed output is appended whole and the output shows twice.
  // Left as theirs (this file is an island) and handled where it belongs: the
  // view syncs a snapshot only into an EMPTY buffer. This test is why that rule
  // cannot be dropped as superfluous.
  it('duplicates a first snapshot over streamed output — the reason the view guards it', () => {
    writeAgentTerminalChunk('p-dup', 'line one\n')
    syncAgentTerminalSnapshot('p-dup', 'line one\nline two\n')

    expect(agentTerminalBacklog('p-dup')).toBe('line one\nline one\nline two\n')
  })

  it('ignores a snapshot that is already contained in the buffer', () => {
    const written: string[] = []
    registerAgentTerminalWriter('p-same', (chunk) => written.push(chunk))
    writeAgentTerminalChunk('p-same', 'already here\n')

    syncAgentTerminalSnapshot('p-same', 'already here\n')

    expect(written).toEqual(['already here\n'])
  })

  it('resets the tab completely when the snapshot diverged from the buffer', () => {
    const written: string[] = []
    registerAgentTerminalWriter('p-reset', (chunk) => written.push(chunk))
    syncAgentTerminalSnapshot('p-reset', 'stale output\n')

    // The registry's rolling tail slid: what it reports no longer continues
    // what we hold. The whole buffer is rewritten behind the terminal-reset
    // marker, which the view must act on before parsing (see the module doc).
    syncAgentTerminalSnapshot('p-reset', 'completely different\n')

    expect(written.at(-1)).toBe(`${TERMINAL_RESET}completely different\n`)
    expect(agentTerminalBacklog('p-reset')).toBe('completely different\n')
  })

  it('keeps the command header when it resets to a diverged snapshot', () => {
    const written: string[] = []
    registerAgentTerminalWriter('p-reset-header', (chunk) => written.push(chunk))
    seedAgentTerminalCommand('p-reset-header', 'npm test')
    syncAgentTerminalSnapshot('p-reset-header', 'stale\n')

    syncAgentTerminalSnapshot('p-reset-header', 'diverged\n')

    expect(agentTerminalBacklog('p-reset-header')).toBe('$ npm test\r\ndiverged\n')
    expect(written.at(-1)).toBe(`${TERMINAL_RESET}$ npm test\r\ndiverged\n`)
  })

  it('ignores empty ids, empty chunks and empty snapshots', () => {
    const written: string[] = []
    registerAgentTerminalWriter('p-empty', (chunk) => written.push(chunk))

    writeAgentTerminalChunk('', 'nowhere')
    writeAgentTerminalChunk('p-empty', '')
    syncAgentTerminalSnapshot('p-empty', '')

    expect(written).toEqual([])
    expect(agentTerminalBacklog('p-empty')).toBe('')
  })

  it('forgets a process so a closed tab stops holding its buffer', () => {
    writeAgentTerminalChunk('p-forget', 'output')
    expect(agentTerminalBacklog('p-forget')).toBe('output')

    forgetAgentTerminal('p-forget')
    expect(agentTerminalBacklog('p-forget')).toBe('')
  })
})
