import { describe, expect, it } from 'vitest'
import type { StoredMessageRow } from '../../../shared/ipc'
import {
  contentToText,
  scanArtifacts,
  toArtifactMessages,
  type ArtifactApi
} from './artifact-source'

function api(
  sessions: { id: string; title?: string; started_at?: number }[],
  transcripts: Record<string, StoredMessageRow[] | Error>
): ArtifactApi {
  return {
    listSessions: async () => ({ sessions }),
    getSessionMessages: async (id) => {
      const found = transcripts[id]
      if (found instanceof Error) throw found
      return { messages: found ?? [] }
    }
  }
}

describe('contentToText', () => {
  it('passes a plain string through', () => {
    expect(contentToText('D:\\out\\plan.md')).toBe('D:\\out\\plan.md')
  })

  // Their `_decode_content` gives back a decoded structure for a multimodal
  // message. Stringifying it would double every backslash, and a Windows path
  // with doubled backslashes is a path that does not exist.
  it('takes the text parts of a multimodal message without escaping them', () => {
    expect(
      contentToText([
        { type: 'text', text: 'записал D:\\out\\plan.md' },
        { type: 'image_url', image_url: { url: 'https://example.com/x.png' } }
      ])
    ).toBe('записал D:\\out\\plan.md')
  })

  it('answers empty for anything without text', () => {
    expect(contentToText(null)).toBe('')
    expect(contentToText(42)).toBe('')
  })
})

describe('toArtifactMessages', () => {
  it('maps role, content, tool calls and the epoch-seconds timestamp', () => {
    const [message] = toArtifactMessages([
      {
        role: 'assistant',
        content: 'готово',
        tool_calls: [{ path: '/a.md' }],
        timestamp: 1_780_000_000.7
      }
    ])
    expect(message).toEqual({
      role: 'assistant',
      text: 'готово',
      toolCalls: [{ path: '/a.md' }],
      timestamp: 1_780_000_001
    })
  })

  it('omits a timestamp that is missing rather than inventing one', () => {
    expect(toArtifactMessages([{ role: 'tool', content: 'x' }])[0]).not.toHaveProperty('timestamp')
  })
})

describe('scanArtifacts', () => {
  it('collects artifacts across sessions, newest first, tagged with their session', async () => {
    const scan = await scanArtifacts(
      api(
        [
          { id: 's1', title: 'Смета', started_at: 1_780_000_000 },
          { id: 's2', title: 'Отчёт', started_at: 1_780_100_000 }
        ],
        {
          s1: [{ role: 'assistant', content: 'см. /out/old.md', timestamp: 1_780_000_100 }],
          s2: [{ role: 'assistant', content: 'см. /out/new.md', timestamp: 1_780_100_100 }]
        }
      )
    )
    expect(scan.error).toBeUndefined()
    expect(scan.scanned).toBe(2)
    expect(scan.artifacts.map((record) => record.value)).toEqual(['/out/new.md', '/out/old.md'])
    expect(scan.artifacts[0]?.sessionTitle).toBe('Отчёт')
  })

  // Required by the task: an unreadable database must explain itself, not show
  // an empty list — "нашли ноль" and "не смогли посмотреть" are different
  // answers.
  it('reports an error instead of an empty list when no session could be read', async () => {
    const scan = await scanArtifacts(
      api([{ id: 's1', title: 'Смета' }], { s1: new Error('database is locked') })
    )
    expect(scan.artifacts).toEqual([])
    expect(scan.error).toContain('database is locked')
  })

  it('reports an error when the session list itself fails', async () => {
    const scan = await scanArtifacts({
      listSessions: async () => {
        throw new Error('gateway is not connected')
      },
      getSessionMessages: async () => ({ messages: [] })
    })
    expect(scan.error).toContain('gateway is not connected')
    expect(scan.scanned).toBe(0)
  })

  // One bad session does not take the other nine down with it.
  it('keeps the artifacts it did read and names the session it could not', async () => {
    const scan = await scanArtifacts(
      api(
        [
          { id: 's1', title: 'Смета' },
          { id: 's2', title: 'Битая' }
        ],
        {
          s1: [{ role: 'assistant', content: '/out/plan.md' }],
          s2: new Error('Session not found')
        }
      )
    )
    expect(scan.error).toBeUndefined()
    expect(scan.artifacts).toHaveLength(1)
    expect(scan.skipped).toEqual([{ id: 's2', title: 'Битая', error: 'Session not found' }])
  })

  // No sessions at all is a legitimate empty result, not a failure.
  it('answers an empty scan without an error when the project has no sessions', async () => {
    const scan = await scanArtifacts(api([], {}))
    expect(scan).toEqual({ artifacts: [], skipped: [], scanned: 0 })
  })
})
