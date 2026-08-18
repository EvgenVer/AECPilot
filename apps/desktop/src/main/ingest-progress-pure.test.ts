// Tests for reading `aec-rag ingest`'s stdout (task 2.15).

import { describe, expect, it } from 'vitest'

import { describeProgress, readIngestLines } from './ingest-progress-pure'

const started =
  '{"progress":{"stage":"started","done":0,"total":2,"source_id":"","rel_path":"","chunks":0,"error":""}}'
const file =
  '{"progress":{"stage":"file","done":1,"total":2,"source_id":"tasks","rel_path":"ЭОМ/задание.pdf","chunks":7,"error":""}}'
const report =
  '{"files_total":2,"files_ingested":2,"files_skipped":0,"files_failed":0,"chunks":12,"removed_chunks":0,"errors":[]}'

describe('readIngestLines', () => {
  it('reads every complete line and keeps the tail for the next read', () => {
    const result = readIngestLines(`${started}\n${file}\n{"progr`)

    expect(result.progress.map((event) => event.stage)).toEqual(['started', 'file'])
    expect(result.rest).toBe('{"progr')
    expect(result.report).toBeUndefined()
  })

  it('joins a line split across two reads', () => {
    const first = readIngestLines(file.slice(0, 30))
    const second = readIngestLines(first.rest + file.slice(30) + '\n')

    expect(first.progress).toEqual([])
    expect(second.progress[0].rel_path).toBe('ЭОМ/задание.pdf')
    expect(second.progress[0].chunks).toBe(7)
  })

  it('recognises the final report', () => {
    const result = readIngestLines(`${file}\n${report}\n`)

    expect(result.report?.files_ingested).toBe(2)
    expect(result.report?.chunks).toBe(12)
  })

  it('skips a line that is not ours instead of failing the run', () => {
    // Library chatter and python warnings do reach stdout; one stray line must
    // not abort an ingest that is otherwise fine.
    const result = readIngestLines(`DeprecationWarning: something\n${file}\n{"other":1}\n`)

    expect(result.progress).toHaveLength(1)
    expect(result.report).toBeUndefined()
  })

  it('has nothing to say about a buffer with no newline yet', () => {
    expect(readIngestLines('half a line')).toEqual({ progress: [], rest: 'half a line' })
  })
})

describe('describeProgress', () => {
  it('counts files while the run is in flight', () => {
    expect(describeProgress(readIngestLines(`${file}\n`).progress[0])).toBe('1 / 2')
  })

  it('says nothing once the run has finished — the report speaks then', () => {
    const finished = readIngestLines(
      '{"progress":{"stage":"finished","done":2,"total":2,"source_id":"","rel_path":"","chunks":0,"error":""}}\n'
    )

    expect(describeProgress(finished.progress[0])).toBeNull()
    expect(describeProgress(null)).toBeNull()
  })
})
