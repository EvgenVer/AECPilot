import { describe, expect, it } from 'vitest'
import {
  artifactKind,
  artifactLabel,
  collectArtifacts,
  dedupKey,
  looksLikeArtifact,
  type ArtifactMessage,
  type ArtifactSession
} from './artifact-extract'

const SESSION: ArtifactSession = { id: 's1', title: 'Смета', startedAt: 1_780_000_000 }

function assistant(text: string, timestamp?: number): ArtifactMessage {
  return { role: 'assistant', text, ...(timestamp ? { timestamp } : {}) }
}

function values(messages: ArtifactMessage[], session: ArtifactSession = SESSION): string[] {
  return collectArtifacts(session, messages).map((record) => record.value)
}

describe('looksLikeArtifact', () => {
  it('accepts http(s) urls and data-image urls', () => {
    expect(looksLikeArtifact('https://example.com/report')).toBe(true)
    expect(looksLikeArtifact('data:image/png;base64,AAAA')).toBe(true)
  })

  it('accepts posix and windows paths with a known extension', () => {
    expect(looksLikeArtifact('/tmp/out/report.pdf')).toBe(true)
    expect(looksLikeArtifact('./docs/plan.md')).toBe(true)
    expect(looksLikeArtifact('D:\\project\\smeta.xlsx')).toBe(true)
    expect(looksLikeArtifact('\\\\nas\\share\\скан.pdf')).toBe(true)
  })

  // The donor's "an absolute path with a dot is a file" fallback, narrowed to
  // the last segment: a dot in a PARENT directory says nothing about the leaf.
  it('rejects a directory whose parent merely contains a dot', () => {
    expect(looksLikeArtifact('D:\\project.v2\\src')).toBe(false)
    expect(looksLikeArtifact('D:\\project.v2\\src\\main.qqq')).toBe(true)
  })

  // Negative required by the task: an e-mail address is not a link.
  it('rejects an e-mail address, bare or as a mailto link', () => {
    expect(looksLikeArtifact('ivanov@example.com')).toBe(false)
    expect(looksLikeArtifact('mailto:ivanov@example.com')).toBe(false)
  })

  // Negative required by the task: a bare number is not a path.
  it('rejects bare numbers and plain words', () => {
    expect(looksLikeArtifact('1.5')).toBe(false)
    expect(looksLikeArtifact('12345')).toBe(false)
    expect(looksLikeArtifact('smeta.xlsx')).toBe(false) // no root — just a word
  })
})

describe('artifactKind', () => {
  it('separates image, file and link', () => {
    expect(artifactKind('/out/plan.png')).toBe('image')
    expect(artifactKind('data:image/png;base64,AAAA')).toBe('image')
    expect(artifactKind('D:\\out\\plan.md')).toBe('file')
    expect(artifactKind('file:///out/plan.md')).toBe('file')
    expect(artifactKind('https://example.com/page')).toBe('link')
  })

  // An image URL is an image first: the tab groups by what it can preview, not
  // by where the bytes live.
  it('calls a remote image an image, not a link', () => {
    expect(artifactKind('https://example.com/photo.jpg')).toBe('image')
  })
})

describe('artifactLabel', () => {
  it('takes the last segment of a url or a path, either slash', () => {
    expect(artifactLabel('https://example.com/a/b/report.pdf')).toBe('report.pdf')
    expect(artifactLabel('D:\\my program\\smeta.xlsx')).toBe('smeta.xlsx')
    expect(artifactLabel('/tmp/out/plan.md')).toBe('plan.md')
  })
})

describe('dedupKey', () => {
  // Windows is case-insensitive and takes both slashes; two spellings of one
  // file must not become two rows.
  it('folds case and slash direction for paths but not for urls', () => {
    expect(dedupKey('D:\\Out\\Plan.md')).toBe(dedupKey('d:/out/plan.md'))
    expect(dedupKey('https://example.com/A')).not.toBe(dedupKey('https://example.com/a'))
  })
})

describe('collectArtifacts — text', () => {
  it('finds a markdown image, a markdown link and a bare url', () => {
    expect(
      values([
        assistant(
          'Готово: ![схема](/out/scheme.png), [смета](/out/smeta.xlsx) и https://example.com/a.pdf'
        )
      ])
    ).toEqual(['/out/scheme.png', '/out/smeta.xlsx', 'https://example.com/a.pdf'])
  })

  it('finds a windows path with spaces inside backticks', () => {
    expect(values([assistant('Записал в `D:\\my program\\AECPilot\\out\\smeta.xlsx`.')])).toEqual([
      'D:\\my program\\AECPilot\\out\\smeta.xlsx'
    ])
  })

  it('drops the trailing sentence punctuation, not part of the name', () => {
    expect(values([assistant('Смотри /out/plan.md.')])).toEqual(['/out/plan.md'])
  })

  // Negative required by the task, second half: prose full of numbers and
  // addresses produces nothing.
  it('finds nothing in prose without paths', () => {
    expect(
      values([assistant('Площадь 1.5 м², пишите на ivanov@example.com, версия 12345.')])
    ).toEqual([])
  })

  // `_history_to_messages` hands tool arguments over as an 80-character label
  // ending in `...` (agent/display.py:182). Stripping the dots would invent a
  // path that does not exist.
  it('rejects a value the core truncated at 80 characters', () => {
    const truncated = `Reading D:\\project\\${'a'.repeat(50)}\\repo...`
    expect(values([{ role: 'tool', context: truncated }])).toEqual([])
  })
})

describe('collectArtifacts — tool calls and results', () => {
  it('reads a path out of json tool arguments under a hinting key', () => {
    expect(
      values([
        {
          role: 'assistant',
          toolCalls: [
            { function: { name: 'write_file', arguments: '' }, path: 'D:\\out\\report.pdf' }
          ]
        }
      ])
    ).toEqual(['D:\\out\\report.pdf'])
  })

  it('ignores a path-shaped string under a key that hints at nothing', () => {
    expect(values([{ role: 'assistant', toolCalls: [{ note: 'D:\\out\\report.pdf' }] }])).toEqual(
      []
    )
  })

  // A relative path with no root reaches the list only from a place that has
  // already vouched for it — a hinting JSON key here, a markdown link below.
  // No free-text rule produces such a candidate at all.
  it('reads a relative path out of a json tool result', () => {
    expect(values([{ role: 'tool', text: '{"output_path": "out/report.pdf"}' }])).toEqual([
      'out/report.pdf'
    ])
  })

  it('reads a relative path out of a markdown link but not out of running prose', () => {
    expect(values([assistant('готово: [смета](out/smeta.xlsx)')])).toEqual(['out/smeta.xlsx'])
    expect(values([assistant('раздел 3/4 второй редакции')])).toEqual([])
  })
})

describe('collectArtifacts — records', () => {
  // Negative required by the task: the same file mentioned twice is one row.
  it('gives one record for the same file seen in two messages', () => {
    const records = collectArtifacts(SESSION, [
      assistant('Читаю D:\\out\\plan.md'),
      assistant('Записал `d:/out/plan.md`')
    ])
    expect(records).toHaveLength(1)
    expect(records[0]?.value).toBe('D:\\out\\plan.md') // first spelling wins
  })

  it('keeps the same file from another session as its own record', () => {
    const a = collectArtifacts(SESSION, [assistant('/out/plan.md')])
    const b = collectArtifacts({ id: 's2', title: 'Вторая' }, [assistant('/out/plan.md')])
    expect(a[0]?.id).not.toBe(b[0]?.id)
    expect(b[0]?.sessionTitle).toBe('Вторая')
  })

  it('stamps the message time when there is one and the session start when there is not', () => {
    const [withTime, withoutTime] = collectArtifacts(SESSION, [
      assistant('/out/a.md', 1_780_000_500),
      assistant('/out/b.md')
    ])
    expect(withTime?.timestamp).toBe(1_780_000_500)
    expect(withoutTime?.timestamp).toBe(SESSION.startedAt)
  })

  // No clock inside: an undated artifact in an undated session gets 0, and the
  // UI shows no date rather than "now".
  it('never invents a time', () => {
    const [record] = collectArtifacts({ id: 's3' }, [assistant('/out/a.md')])
    expect(record?.timestamp).toBe(0)
    expect(record?.sessionTitle).toBe('Без названия')
  })

  it('reads assistant and tool messages only', () => {
    expect(
      values([
        { role: 'user', text: 'посмотри /out/user.md' },
        { role: 'system', text: '/out/system.md' },
        assistant('/out/assistant.md')
      ])
    ).toEqual(['/out/assistant.md'])
  })
})
