// The staged MCP copy follows our sources in development (technical debt 2026-11-18):
// a stale copy is refreshed before the app starts, a fresh one is left alone.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  MCP_PACKAGES,
  ensureFresh,
  readStamp,
  sourcesFingerprint,
  stagedPython,
  writeStamp
} from './payload/mcp-fresh.mjs'

let tmp
let repo
let runtimeDir

function write(rel, text) {
  const file = path.join(repo, rel)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-fresh-'))
  repo = path.join(tmp, 'repo')
  runtimeDir = path.join(repo, 'runtime')
  for (const pkg of MCP_PACKAGES) {
    const mod = pkg.split('/').pop()
    write(`${pkg}/pyproject.toml`, `[project]\nname = "${mod}"\n`)
    write(`${pkg}/src/${mod}/__init__.py`, '')
    write(`${pkg}/src/${mod}/server.py`, 'x = 1\n')
  }
  fs.mkdirSync(runtimeDir, { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

function stagePython() {
  const python = stagedPython(runtimeDir)
  fs.mkdirSync(path.dirname(python), { recursive: true })
  fs.writeFileSync(python, '')
  if (process.platform !== 'win32') {
    fs.mkdirSync(path.join(runtimeDir, 'mcp', 'python', 'lib', 'python3.12', 'site-packages'), {
      recursive: true
    })
  }
  return python
}

function recorder() {
  const calls = []
  const recorded = []
  return {
    calls,
    recorded,
    opts: {
      repo,
      runtimeDir,
      uv: () => 'uv',
      run: (command, args) => calls.push([command, ...args]),
      record: async (name) => {
        recorded.push(name)
      }
    }
  }
}

describe('sourcesFingerprint', () => {
  it('changes when a source file changes and ignores bytecode caches', () => {
    const before = sourcesFingerprint(repo)
    write('mcp/aec_rag/src/aec_rag/__pycache__/server.cpython-312.pyc', 'junk')
    write('mcp/aec_rag/tests/test_x.py', 'def test(): pass\n')
    expect(sourcesFingerprint(repo)).toBe(before)
    write('mcp/aec_rag/src/aec_rag/server.py', 'x = 2\n')
    expect(sourcesFingerprint(repo)).not.toBe(before)
  })

  it('changes when a package gains a file', () => {
    const before = sourcesFingerprint(repo)
    write('mcp/aec_sources/src/aec_sources/guard.py', '')
    expect(sourcesFingerprint(repo)).not.toBe(before)
  })
})

describe('ensureFresh', () => {
  it('does nothing without a staged copy (the app runs .venv)', async () => {
    const r = recorder()
    expect(await ensureFresh(r.opts)).toBe('no-payload')
    expect(r.calls).toEqual([])
    expect(readStamp(runtimeDir)).toBeNull()
  })

  it('refreshes a copy whose stamp is older than the sources, then stamps it', async () => {
    const python = stagePython()
    writeStamp('stale', runtimeDir)
    const scripts = path.join(path.dirname(python), 'Scripts')
    fs.mkdirSync(scripts, { recursive: true })
    const r = recorder()

    expect(await ensureFresh(r.opts)).toBe('refreshed')

    expect(r.calls[0]).toEqual([
      'uv',
      'pip',
      'install',
      '--python',
      python,
      '--no-deps',
      '--reinstall',
      ...MCP_PACKAGES
    ])
    expect(
      r.calls.some((call) => call[0] === python && call.join(' ').includes('UNCHECKED_HASH'))
    ).toBe(true)
    for (const mod of ['aec_sources', 'aec_rag', 'aec_roster']) {
      expect(r.calls).toContainEqual([
        python,
        '-I',
        '-c',
        `import ${mod}.server; print('${mod} ok')`
      ])
    }
    expect(r.recorded).toEqual(['mcp'])
    expect(readStamp(runtimeDir)).toBe(sourcesFingerprint(repo))
    if (process.platform === 'win32') expect(fs.existsSync(scripts)).toBe(false)
  })

  it('refreshes a copy that was never stamped', async () => {
    stagePython()
    const r = recorder()
    expect(await ensureFresh(r.opts)).toBe('refreshed')
  })

  it('leaves a fresh copy alone', async () => {
    stagePython()
    writeStamp(sourcesFingerprint(repo), runtimeDir)
    const r = recorder()
    expect(await ensureFresh(r.opts)).toBe('fresh')
    expect(r.calls).toEqual([])
    expect(r.recorded).toEqual([])
  })

  it('does not stamp when the reinstall fails, so the next start tries again', async () => {
    stagePython()
    writeStamp('stale', runtimeDir)
    const r = recorder()
    r.opts.run = () => {
      throw new Error('uv exited with code 2')
    }
    await expect(ensureFresh(r.opts)).rejects.toThrow('uv exited')
    expect(readStamp(runtimeDir)).toBe('stale')
  })
})
