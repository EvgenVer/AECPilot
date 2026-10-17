// Task T21.2: the main process starts `aec-rag` with the staged MCP Python when the
// tree carries one (installed, or a working copy after setup.mjs), else with the uv
// workspace's console script.

import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { aecRagArgs, aecRagCommand, stagedMcpPython } from './aec-rag-command'

const root = join('D:', 'AECPilot')

describe('aecRagCommand / aecRagArgs', () => {
  it('runs the module form on the staged interpreter when it is there', () => {
    const exists = (file: string): boolean => file === stagedMcpPython(root)

    expect(aecRagCommand(root, exists)).toBe(stagedMcpPython(root))
    expect(stagedMcpPython(root).startsWith(join(root, 'runtime', 'mcp', 'python'))).toBe(true)
    expect(aecRagArgs(['scan', '--project', 'v'], root, exists)).toEqual([
      '-s',
      '-m',
      'aec_rag',
      'scan',
      '--project',
      'v'
    ])
  })

  it("falls back to the workspace's console script without a staged runtime", () => {
    const exists = (): boolean => false

    expect(aecRagCommand(root, exists).startsWith(join(root, '.venv'))).toBe(true)
    expect(aecRagArgs(['scan'], root, exists)).toEqual(['scan'])
  })
})
