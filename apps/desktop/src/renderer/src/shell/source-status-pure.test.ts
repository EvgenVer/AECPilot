// Pure unit tests for task 1.5.5's `mergeScanStatuses` — no DOM, no React,
// no IPC (see scan-notification-pure.test.ts for the same convention). This
// is the direct regression test for the owner Block 7 bugfix (a scan report
// must flip a known source's badge live, without a remount).

import { describe, expect, it } from 'vitest'
import { mergeScanStatuses, type SourceStatus } from './source-status-pure'
import type { ScanReportEnvelope, SourceScanReport } from '../../../shared/ipc'

function sourceReport(overrides: Partial<SourceScanReport> = {}): SourceScanReport {
  return {
    added: [],
    changed: [],
    deleted: [],
    unchanged: 0,
    root_unavailable: false,
    ...overrides
  }
}

function envelope(
  vaultPath: string,
  sources: Record<string, SourceScanReport>
): ScanReportEnvelope {
  return { vaultPath, report: { sources } }
}

const VAULT = 'C:\\projects\\object-x'

describe('mergeScanStatuses', () => {
  it('(a) ignores an envelope tagged for a different project (vaultPath !== current)', () => {
    const prev: Record<string, SourceStatus> = { a: 'ok' }
    const env = envelope('C:\\projects\\other-project', {
      a: sourceReport({ root_unavailable: true })
    })
    expect(mergeScanStatuses(prev, env, VAULT, new Set(['a']))).toBe(prev)
  })

  it('(a) ignores every envelope when no project is open (currentVaultPath: null)', () => {
    const prev: Record<string, SourceStatus> = { a: 'ok' }
    const env = envelope(VAULT, { a: sourceReport({ root_unavailable: true }) })
    expect(mergeScanStatuses(prev, env, null, new Set(['a']))).toBe(prev)
  })

  it('(b) ignores a source id absent from knownIds (e.g. a stale/detached source)', () => {
    const prev: Record<string, SourceStatus> = { a: 'ok' }
    const env = envelope(VAULT, { ghost: sourceReport({ root_unavailable: true }) })
    const result = mergeScanStatuses(prev, env, VAULT, new Set(['a']))
    expect(result).toEqual({ a: 'ok' })
    expect(result.ghost).toBeUndefined()
  })

  it('(c) preserves neighboring statuses untouched by this envelope', () => {
    const prev: Record<string, SourceStatus> = { a: 'ok', b: 'checking', c: 'error' }
    const env = envelope(VAULT, { a: sourceReport({ root_unavailable: true }) })
    const result = mergeScanStatuses(prev, env, VAULT, new Set(['a', 'b', 'c']))
    expect(result).toEqual({ a: 'unavailable', b: 'checking', c: 'error' })
  })

  it('(d) root_unavailable: true maps a known source to "unavailable"', () => {
    const prev: Record<string, SourceStatus> = { a: 'ok' }
    const env = envelope(VAULT, { a: sourceReport({ root_unavailable: true }) })
    expect(mergeScanStatuses(prev, env, VAULT, new Set(['a']))).toEqual({ a: 'unavailable' })
  })

  it('root_unavailable: false maps a known source to "ok" (recovery case)', () => {
    const prev: Record<string, SourceStatus> = { a: 'unavailable' }
    const env = envelope(VAULT, { a: sourceReport({ root_unavailable: false }) })
    expect(mergeScanStatuses(prev, env, VAULT, new Set(['a']))).toEqual({ a: 'ok' })
  })

  it('never mutates the prev object it was given', () => {
    const prev: Record<string, SourceStatus> = { a: 'ok' }
    const env = envelope(VAULT, { a: sourceReport({ root_unavailable: true }) })
    mergeScanStatuses(prev, env, VAULT, new Set(['a']))
    expect(prev).toEqual({ a: 'ok' })
  })

  it('applies multiple known sources from the same envelope in one merge', () => {
    const prev: Record<string, SourceStatus> = { a: 'checking', b: 'checking' }
    const env = envelope(VAULT, {
      a: sourceReport({ root_unavailable: true }),
      b: sourceReport({ root_unavailable: false })
    })
    const result = mergeScanStatuses(prev, env, VAULT, new Set(['a', 'b']))
    expect(result).toEqual({ a: 'unavailable', b: 'ok' })
  })
})
