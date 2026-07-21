// Pure unit tests for task 1.5.D1's tool label guard — the regression net
// for the old task 1.5.2 (unlabeled empty tool cards).

import { describe, expect, it } from 'vitest'
import { FALLBACK_TOOL_LABEL, hasToolDetails, toolDisplayName } from './tool-label-pure'

describe('toolDisplayName', () => {
  it('keeps a real tool name as-is', () => {
    expect(toolDisplayName('read_file')).toBe('read_file')
    expect(toolDisplayName('mcp_aec_sources_sources_tree')).toBe('mcp_aec_sources_sources_tree')
  })

  it('trims surrounding whitespace', () => {
    expect(toolDisplayName('  read_file  ')).toBe('read_file')
  })

  // --- the 1.5.2 guarantee: never a label-less card, whatever arrives ---
  it('falls back for an empty or whitespace-only name', () => {
    expect(toolDisplayName('')).toBe(FALLBACK_TOOL_LABEL)
    expect(toolDisplayName('   ')).toBe(FALLBACK_TOOL_LABEL)
    expect(toolDisplayName('\n\t')).toBe(FALLBACK_TOOL_LABEL)
  })

  it('falls back for a missing name', () => {
    expect(toolDisplayName(undefined)).toBe(FALLBACK_TOOL_LABEL)
  })

  it('falls back for a non-string sneaking through a loose payload', () => {
    expect(toolDisplayName(null as unknown as string)).toBe(FALLBACK_TOOL_LABEL)
    expect(toolDisplayName(42 as unknown as string)).toBe(FALLBACK_TOOL_LABEL)
  })

  it('never returns an empty string for any input', () => {
    const inputs = ['', '   ', undefined, null as unknown as string, 0 as unknown as string]
    for (const input of inputs) {
      expect(toolDisplayName(input).length).toBeGreaterThan(0)
    }
  })
})

describe('hasToolDetails', () => {
  it('is false for a card with neither args nor result', () => {
    expect(hasToolDetails({})).toBe(false)
  })

  it('is true once there are args or a result', () => {
    expect(hasToolDetails({ args: { path: 'x' } })).toBe(true)
    expect(hasToolDetails({ result: 'done' })).toBe(true)
  })

  it('treats an empty-string result as present (the tool did answer)', () => {
    expect(hasToolDetails({ result: '' })).toBe(true)
  })
})
