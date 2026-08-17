// Pure unit tests for task 1.15's change-detection notification model — no
// DOM, no React (see chat-state.test.ts for the same convention).

import { describe, expect, it } from 'vitest'
import { buildScanNotification, hasWikiPages, reportHasChanges } from './scan-notification-pure'
import type { ScanReport, SourceScanReport } from '../../../../shared/ipc'

function source(overrides: Partial<SourceScanReport> = {}): SourceScanReport {
  return {
    added: [],
    changed: [],
    deleted: [],
    unchanged: 0,
    root_unavailable: false,
    ...overrides
  }
}

describe('reportHasChanges', () => {
  it('is false when every source only has unchanged files', () => {
    const report: ScanReport = { sources: { a: source({ unchanged: 12 }) } }
    expect(reportHasChanges(report)).toBe(false)
  })

  it('is false for a report with no sources', () => {
    expect(reportHasChanges({ sources: {} })).toBe(false)
  })

  it('is false when a source is only root_unavailable (no changes of its own)', () => {
    const report: ScanReport = { sources: { a: source({ root_unavailable: true }) } }
    expect(reportHasChanges(report)).toBe(false)
  })

  it('is true when any source has an added/changed/deleted file', () => {
    expect(reportHasChanges({ sources: { a: source({ added: ['x.txt'] }) } })).toBe(true)
    expect(reportHasChanges({ sources: { a: source({ changed: ['x.txt'] }) } })).toBe(true)
    expect(reportHasChanges({ sources: { a: source({ deleted: ['x.txt'] }) } })).toBe(true)
  })
})

describe('buildScanNotification', () => {
  it('returns null for an unchanged-only report', () => {
    const report: ScanReport = { sources: { a: source({ unchanged: 3 }) } }
    expect(buildScanNotification(report)).toBeNull()
  })

  it('omits sources with no changes and not unavailable, keeps the changed one', () => {
    const report: ScanReport = {
      sources: {
        a: source({ unchanged: 5 }),
        b: source({ added: ['new.docx'] })
      }
    }
    const model = buildScanNotification(report)
    expect(model?.sources.map((s) => s.sourceId)).toEqual(['b'])
  })

  it('keeps an unavailable source alongside a changed one, flagging it, not as a change', () => {
    const report: ScanReport = {
      sources: {
        a: source({ root_unavailable: true }),
        b: source({ changed: ['spec.docx'] })
      }
    }
    const model = buildScanNotification(report)
    expect(model?.sources).toEqual([
      { sourceId: 'a', label: 'a', added: [], changed: [], deleted: [], unavailable: true },
      {
        sourceId: 'b',
        label: 'b',
        added: [],
        changed: ['spec.docx'],
        deleted: [],
        unavailable: false
      }
    ])
  })

  it('resolves a display label from sourceLabels, falling back to the raw id', () => {
    const report: ScanReport = { sources: { 'uuid-1': source({ deleted: ['old.pdf'] }) } }
    const withLabel = buildScanNotification(report, { 'uuid-1': '\\\\server\\tasks' })
    expect(withLabel?.sources[0].label).toBe('\\\\server\\tasks')

    const withoutLabel = buildScanNotification(report)
    expect(withoutLabel?.sources[0].label).toBe('uuid-1')
  })

  it('passes through full added/changed/deleted arrays unchanged', () => {
    const report: ScanReport = {
      sources: { a: source({ added: ['1.txt', '2.txt'], changed: ['3.txt'], deleted: ['4.txt'] }) }
    }
    const model = buildScanNotification(report)
    expect(model?.sources[0]).toEqual({
      sourceId: 'a',
      label: 'a',
      added: ['1.txt', '2.txt'],
      changed: ['3.txt'],
      deleted: ['4.txt'],
      unavailable: false
    })
  })

  it('flags unavailable: true alongside non-empty changes when a source is both root_unavailable and has changes', () => {
    // Edge case per aec_rag's scan_source contract (shared/ipc.ts's
    // SourceScanReport doc comment): root_unavailable normally means every
    // other field stays at its default, but this model must not assume
    // that — it just reflects whatever the report says.
    const report: ScanReport = {
      sources: { a: source({ root_unavailable: true, added: ['new.docx'] }) }
    }
    const model = buildScanNotification(report)
    expect(model?.sources[0]).toEqual({
      sourceId: 'a',
      label: 'a',
      added: ['new.docx'],
      changed: [],
      deleted: [],
      unavailable: true
    })
  })

  it('resolves labels independently per source — one found in sourceLabels, one falling back', () => {
    const report: ScanReport = {
      sources: {
        'uuid-1': source({ added: ['new.docx'] }),
        'uuid-2': source({ changed: ['spec.docx'] })
      }
    }
    const model = buildScanNotification(report, { 'uuid-1': '\\\\server\\tasks' })
    expect(model?.sources.map((s) => ({ sourceId: s.sourceId, label: s.label }))).toEqual([
      { sourceId: 'uuid-1', label: '\\\\server\\tasks' },
      { sourceId: 'uuid-2', label: 'uuid-2' }
    ])
  })
})

describe('есть ли построенная вики (задача 4.13)', () => {
  const dir = (path: string, children: unknown[]) => ({
    children,
    name: path.split('/').pop() ?? path,
    path,
    type: 'dir' as const
  })
  const file = (path: string) => ({
    name: path.split('/').pop() ?? path,
    path,
    type: 'file' as const
  })

  it('пустой vault — вики нет', () => {
    expect(hasWikiPages([])).toBe(false)
  })

  it('один скелет — ещё не вики', () => {
    // index.md, log.md и SCHEMA.md появляются вместе с папками, а страниц нет:
    // кнопка «обновить» здесь предлагала бы обновить пустоту.
    const tree = [
      dir('wiki', [
        file('wiki/index.md'),
        file('wiki/log.md'),
        file('wiki/SCHEMA.md'),
        dir('wiki/entities', []),
        dir('wiki/raw', [file('wiki/raw/README.md')])
      ])
    ]

    expect(hasWikiPages(tree)).toBe(false)
  })

  it('снимок в raw/ страницей не считается', () => {
    const tree = [dir('wiki', [dir('wiki/raw', [file('wiki/raw/tasks__задание.pdf.md')])])]

    expect(hasWikiPages(tree)).toBe(false)
  })

  it('одна содержательная страница — вики есть', () => {
    const tree = [dir('wiki', [dir('wiki/entities', [file('wiki/entities/ТП-1.md')])])]

    expect(hasWikiPages(tree)).toBe(true)
  })

  it('markdown вне wiki/ не считается', () => {
    // В vault полно .md помимо вики — заметки, AGENTS.md, черновики.
    const tree = [dir('workspace', [file('workspace/заметки.md')]), file('AGENTS.md')]

    expect(hasWikiPages(tree)).toBe(false)
  })
})
