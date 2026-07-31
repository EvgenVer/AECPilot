import { describe, expect, it } from 'vitest'
import { disableWarning, MCP_STATUS_LABELS, toMcpRows, type McpRowStatus } from './mcp-pure'
import type { McpServerSummary } from '../../../shared/ipc'

const configured: McpServerSummary[] = [
  {
    name: 'aec-sources',
    transport: 'stdio',
    command: 'aec-sources.exe',
    args: ['--project', 'x'],
    enabled: true,
    envNames: ['AEC_TOKEN']
  },
  { name: 'remote', transport: 'http', url: 'https://example.test/mcp', enabled: false }
]

describe('toMcpRows', () => {
  it('merges configuration with live status into one row per server', () => {
    const rows = toMcpRows(configured, [
      { name: 'aec-sources', status: 'connected', connected: true, tools: 4 }
    ])
    expect(rows).toHaveLength(2)
    expect(rows[0].status).toBe('connected')
    expect(rows[0].toolCount).toBe(4)
    expect(rows[1].status).toBe('disabled')
  })

  // Configured-but-never-started is not a failure; saying "failed" would
  // invent an error the gateway never reported.
  it('reads a configured server with no live row as "not connected yet"', () => {
    const rows = toMcpRows(configured, [])
    expect(rows[0].status).toBe('configured')
    expect(rows[0].toolCount).toBeUndefined()
  })

  it('keeps a live server that is missing from the configuration', () => {
    const rows = toMcpRows([], [{ name: 'ghost', status: 'connected', tools: 1 }])
    expect(rows).toHaveLength(1)
    expect(rows[0].liveOnly).toBe(true)
    expect(rows[0].status).toBe('connected')
  })

  it('separates a disabled server from a failed one', () => {
    const rows = toMcpRows(
      [
        { name: 'a', transport: 'stdio', command: 'a', enabled: false },
        { name: 'b', transport: 'stdio', command: 'b', enabled: true }
      ],
      [
        { name: 'a', status: 'disabled', disabled: true },
        { name: 'b', status: 'failed', error: 'spawn ENOENT' }
      ]
    )
    expect(rows[0].status).toBe('disabled')
    expect(rows[1].status).toBe('failed')
    expect(rows[1].error).toBe('spawn ENOENT')
  })

  it('marks our own sources server', () => {
    const rows = toMcpRows(configured, [])
    expect(rows[0].ours).toBe(true)
    expect(rows[1].ours).toBe(false)
  })

  it('infers the transport when the field is missing', () => {
    const rows = toMcpRows(
      [
        { name: 'h', transport: '', url: 'https://x', enabled: true },
        { name: 's', transport: '', command: 'run', enabled: true }
      ],
      []
    )
    expect(rows[0].transport).toBe('http')
    expect(rows[1].transport).toBe('stdio')
  })

  it('falls back for an unrecognised live status instead of dropping the row', () => {
    const rows = toMcpRows(
      [{ name: 'a', transport: 'stdio', enabled: true }],
      [{ name: 'a', status: 'quantum' }]
    )
    expect(rows[0].status).toBe('configured')
  })

  // The screen must be able to show WHICH variables a server defines without
  // ever seeing what they hold.
  it('carries env names only — there is no field for a value', () => {
    const rows = toMcpRows(configured, [])
    expect(rows[0].envNames).toEqual(['AEC_TOKEN'])
    expect(JSON.stringify(rows)).not.toContain('env"')
  })

  it('survives empty inputs', () => {
    expect(toMcpRows([], [])).toEqual([])
    expect(toMcpRows(undefined, undefined)).toEqual([])
  })
})

describe('MCP_STATUS_LABELS', () => {
  it('labels all five states', () => {
    const all: McpRowStatus[] = ['connected', 'connecting', 'failed', 'disabled', 'configured']
    for (const status of all) expect(MCP_STATUS_LABELS[status]).toBeTruthy()
  })
})

describe('disableWarning', () => {
  it('warns only for our own sources server', () => {
    const [ours, other] = toMcpRows(configured, [])
    expect(disableWarning(ours)).toContain('источник')
    expect(disableWarning(other)).toBeUndefined()
  })
})
