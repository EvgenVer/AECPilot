import { describe, expect, it } from 'vitest'
import {
  describeConfigureOutcome,
  describeEnableConfirmation,
  toToolsetRows
} from './toolsets-pure'
import type { ToolsConfigureResult, ToolsetInfo } from '../../../shared/gateway/types'

describe('toToolsetRows', () => {
  it('maps the gateway shape to rows', () => {
    const rows = toToolsetRows({
      toolsets: [
        {
          name: 'files',
          description: 'File operations',
          tool_count: 2,
          enabled: true,
          tools: ['read_file', 'write_file']
        }
      ]
    })
    expect(rows).toEqual([
      {
        name: 'files',
        description: 'File operations',
        toolCount: 2,
        enabled: true,
        tools: ['read_file', 'write_file']
      }
    ])
  })

  // Their rule is `name in enabled if enabled else True` — an empty enabled
  // set means "no restriction", i.e. everything on. Reading a missing signal
  // as "off" would draw a fully working agent as having no tools.
  it('treats a missing enabled flag as enabled, not as disabled', () => {
    const rows = toToolsetRows({
      toolsets: [{ name: 'files' } as unknown as ToolsetInfo]
    })
    expect(rows[0].enabled).toBe(true)
  })

  it('honours an explicit false', () => {
    const rows = toToolsetRows({
      toolsets: [{ name: 'shell', description: '', tool_count: 1, enabled: false, tools: ['bash'] }]
    })
    expect(rows[0].enabled).toBe(false)
  })

  it('falls back to counting tools when tool_count is absent', () => {
    const rows = toToolsetRows({
      toolsets: [
        {
          name: 'web',
          description: '',
          tools: ['fetch', 'search']
        } as unknown as ToolsetInfo
      ]
    })
    expect(rows[0].toolCount).toBe(2)
  })

  it('drops nameless entries rather than rendering blank rows', () => {
    const rows = toToolsetRows({
      toolsets: [
        { name: '', description: '', tool_count: 0, enabled: true, tools: [] },
        { name: 'files', description: '', tool_count: 0, enabled: true, tools: [] }
      ]
    })
    expect(rows.map((row) => row.name)).toEqual(['files'])
  })

  it('survives an empty or missing answer', () => {
    expect(toToolsetRows({ toolsets: [] })).toEqual([])
    expect(toToolsetRows(undefined)).toEqual([])
  })
})

describe('describeEnableConfirmation', () => {
  it('names the tools the agent will get', () => {
    expect(
      describeEnableConfirmation({
        name: 'shell',
        description: '',
        toolCount: 2,
        enabled: false,
        tools: ['bash', 'process']
      })
    ).toContain('bash, process')
  })

  it('falls back to a count when the tool list is unknown', () => {
    expect(
      describeEnableConfirmation({
        name: 'shell',
        description: '',
        toolCount: 7,
        enabled: false,
        tools: []
      })
    ).toContain('7')
  })
})

describe('describeConfigureOutcome', () => {
  function result(over: Partial<ToolsConfigureResult>): ToolsConfigureResult {
    return {
      changed: [],
      enabled_toolsets: [],
      missing_servers: [],
      unknown: [],
      reset: false,
      ...over
    }
  }

  it('reports a plain success', () => {
    const outcome = describeConfigureOutcome(result({ changed: ['files'] }), 'enable')
    expect(outcome.applied).toBe(true)
    expect(outcome.message).toContain('включены: files')
  })

  it('uses the right verb for disabling', () => {
    expect(describeConfigureOutcome(result({ changed: ['files'] }), 'disable').message).toContain(
      'выключены'
    )
  })

  it('says "not found" when only unknown came back', () => {
    const outcome = describeConfigureOutcome(result({ unknown: ['nope'] }), 'enable')
    expect(outcome.applied).toBe(false)
    expect(outcome.message).toContain('не знает')
    expect(outcome.message).not.toContain('включены:')
  })

  it('names the disconnected MCP servers separately from unknown names', () => {
    const outcome = describeConfigureOutcome(result({ missing_servers: ['aec-sources'] }), 'enable')
    expect(outcome.message).toContain('не подключены')
    expect(outcome.message).toContain('aec-sources')
  })

  it('keeps all three apart when all three came back', () => {
    const outcome = describeConfigureOutcome(
      result({ changed: ['files'], unknown: ['nope'], missing_servers: ['srv'] }),
      'enable'
    )
    expect(outcome.applied).toBe(true)
    expect(outcome.message).toContain('files')
    expect(outcome.message).toContain('nope')
    expect(outcome.message).toContain('srv')
  })

  it('says something even when the gateway reported nothing at all', () => {
    const outcome = describeConfigureOutcome(result({}), 'enable')
    expect(outcome.applied).toBe(false)
    expect(outcome.message).not.toBe('')
  })

  it('surfaces the live-agent rebuild as its own flag', () => {
    expect(
      describeConfigureOutcome(result({ changed: ['x'], reset: true }), 'enable').agentReset
    ).toBe(true)
    expect(describeConfigureOutcome(result({ changed: ['x'] }), 'enable').agentReset).toBe(false)
  })
})
