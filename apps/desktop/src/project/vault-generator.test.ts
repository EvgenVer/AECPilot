// Unit tests for task 1.2's vault structure/starter-file generator.

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { validateProjectConfig } from './project-config'
import { generateVault } from './vault-generator'

// Real `fs.writeFileSync` behind a `vi.fn` wrapper, so the "partial-state
// cleanup" test below can make a specific call throw while every other test
// in this file (and every other `fs` function) keeps its real behavior. A
// direct `vi.spyOn(fs, 'writeFileSync')` doesn't work here — ESM module
// namespace objects aren't configurable (confirmed against this vitest
// version), so overriding the export requires `vi.mock` instead.
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, writeFileSync: vi.fn(actual.writeFileSync) }
})

// Known environment quirk (precedent: task 1.9): the system TEMP dir can be
// unwritable under this session's permissions. If so, TMP/TEMP are pointed
// at the scratchpad dir before this file is loaded, and `os.tmpdir()` picks
// that up.
function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

const AGENTS_TEMPLATE = '# AGENTS.md — {{PROJECT_NAME}}\n\nПлейсхолдер задачи 1.5.\n'
const NOW_ISO = '2026-07-14T12:00:00.000Z'

describe('generateVault — successful generation', () => {
  let vaultPath: string

  beforeEach(() => {
    vaultPath = makeTempDir('aecpilot-vault-')
  })

  afterEach(() => {
    fs.rmSync(vaultPath, { recursive: true, force: true })
  })

  it('creates every required directory', () => {
    generateVault({
      vaultPath,
      projectName: 'Объект-X',
      agentsTemplate: AGENTS_TEMPLATE,
      nowIso: NOW_ISO
    })

    for (const dir of ['wiki', 'workspace', 'templates', '.aecpilot', '.aecpilot/logs']) {
      expect(fs.statSync(path.join(vaultPath, dir)).isDirectory()).toBe(true)
    }
  })

  it('does not create a checklists/ directory', () => {
    generateVault({
      vaultPath,
      projectName: 'Объект-X',
      agentsTemplate: AGENTS_TEMPLATE,
      nowIso: NOW_ISO
    })

    expect(fs.existsSync(path.join(vaultPath, 'checklists'))).toBe(false)
  })

  it('writes AGENTS.md with the {{PROJECT_NAME}} placeholder substituted', () => {
    generateVault({
      vaultPath,
      projectName: 'Объект-X',
      agentsTemplate: AGENTS_TEMPLATE,
      nowIso: NOW_ISO
    })

    const content = fs.readFileSync(path.join(vaultPath, 'AGENTS.md'), 'utf-8')
    expect(content).toContain('Объект-X')
    expect(content).not.toContain('{{PROJECT_NAME}}')
  })

  it('writes .aecpilot/project.json that parses and passes validateProjectConfig', () => {
    generateVault({
      vaultPath,
      projectName: 'Объект-X',
      agentsTemplate: AGENTS_TEMPLATE,
      nowIso: NOW_ISO
    })

    const raw = fs.readFileSync(path.join(vaultPath, '.aecpilot', 'project.json'), 'utf-8')
    expect(raw.endsWith('\n')).toBe(true)
    const parsed = JSON.parse(raw)
    const result = validateProjectConfig(parsed)
    expect(result).toEqual({
      ok: true,
      value: {
        schema_version: 1,
        name: 'Объект-X',
        created_at: NOW_ISO,
        sources: [],
        settings: { wiki_lang: 'auto', scan_interval_s: 300, embedding_model: '' }
      }
    })
  })

  it('.aecpilot contains exactly logs/ and project.json (guard against future lancedb/memory/index.db)', () => {
    generateVault({
      vaultPath,
      projectName: 'Объект-X',
      agentsTemplate: AGENTS_TEMPLATE,
      nowIso: NOW_ISO
    })

    const entries = fs.readdirSync(path.join(vaultPath, '.aecpilot')).sort()
    expect(entries).toEqual(['logs', 'project.json'])
  })
})

describe('generateVault — non-empty target directory', () => {
  it('throws before writing anything', () => {
    const vaultPath = makeTempDir('aecpilot-vault-nonempty-')
    try {
      fs.writeFileSync(path.join(vaultPath, 'existing.txt'), 'pre-existing content')

      expect(() =>
        generateVault({
          vaultPath,
          projectName: 'Объект-X',
          agentsTemplate: AGENTS_TEMPLATE,
          nowIso: NOW_ISO
        })
      ).toThrow()

      expect(fs.readdirSync(vaultPath)).toEqual(['existing.txt'])
    } finally {
      fs.rmSync(vaultPath, { recursive: true, force: true })
    }
  })
})

describe('generateVault — non-existent target directory', () => {
  it('creates it recursively', () => {
    const parent = makeTempDir('aecpilot-vault-parent-')
    try {
      const vaultPath = path.join(parent, 'nested', 'vault')

      generateVault({
        vaultPath,
        projectName: 'Объект-X',
        agentsTemplate: AGENTS_TEMPLATE,
        nowIso: NOW_ISO
      })

      expect(fs.statSync(path.join(vaultPath, 'wiki')).isDirectory()).toBe(true)
    } finally {
      fs.rmSync(parent, { recursive: true, force: true })
    }
  })
})

describe('generateVault — template without the placeholder', () => {
  it('copies the template as-is', () => {
    const vaultPath = makeTempDir('aecpilot-vault-noplaceholder-')
    try {
      const template = '# AGENTS.md\n\nNo placeholder here.\n'
      generateVault({
        vaultPath,
        projectName: 'Объект-X',
        agentsTemplate: template,
        nowIso: NOW_ISO
      })

      const content = fs.readFileSync(path.join(vaultPath, 'AGENTS.md'), 'utf-8')
      expect(content).toBe(template)
    } finally {
      fs.rmSync(vaultPath, { recursive: true, force: true })
    }
  })
})

describe('generateVault — target path is a file', () => {
  it('throws a clear error instead of a raw ENOTDIR', () => {
    const parent = makeTempDir('aecpilot-vault-file-target-')
    try {
      const vaultPath = path.join(parent, 'vault')
      fs.writeFileSync(vaultPath, 'not a directory')

      expect(() =>
        generateVault({
          vaultPath,
          projectName: 'Объект-X',
          agentsTemplate: AGENTS_TEMPLATE,
          nowIso: NOW_ISO
        })
      ).toThrow(/target path is a file, not a directory/)
    } finally {
      fs.rmSync(parent, { recursive: true, force: true })
    }
  })
})

describe('generateVault — blank projectName', () => {
  it('throws before creating anything', () => {
    const parent = makeTempDir('aecpilot-vault-blank-name-')
    try {
      const vaultPath = path.join(parent, 'vault')

      expect(() =>
        generateVault({
          vaultPath,
          projectName: '   ',
          agentsTemplate: AGENTS_TEMPLATE,
          nowIso: NOW_ISO
        })
      ).toThrow(/projectName must be a non-empty string/)

      expect(fs.existsSync(vaultPath)).toBe(false)
    } finally {
      fs.rmSync(parent, { recursive: true, force: true })
    }
  })
})

describe('generateVault — partial-state cleanup on a mid-way write failure', () => {
  it('removes the vault directory it created, then re-throws the original error', () => {
    const parent = makeTempDir('aecpilot-vault-cleanup-')
    const vaultPath = path.join(parent, 'vault')
    const writeFileSyncMock = vi.mocked(fs.writeFileSync)
    const realWriteFileSync = writeFileSyncMock.getMockImplementation()!

    let callCount = 0
    writeFileSyncMock.mockImplementation((...args: Parameters<typeof fs.writeFileSync>) => {
      callCount++
      // First call writes AGENTS.md (succeeds); second writes project.json
      // — simulate that one failing partway through generation.
      if (callCount === 2) throw new Error('simulated write failure')
      return realWriteFileSync(...args)
    })

    try {
      expect(() =>
        generateVault({
          vaultPath,
          projectName: 'Объект-X',
          agentsTemplate: AGENTS_TEMPLATE,
          nowIso: NOW_ISO
        })
      ).toThrow('simulated write failure')

      // vaultPath didn't exist before the call, so on failure it must be
      // removed entirely — no partial vault left behind.
      expect(fs.existsSync(vaultPath)).toBe(false)
    } finally {
      writeFileSyncMock.mockImplementation(realWriteFileSync)
      writeFileSyncMock.mockClear()
      fs.rmSync(parent, { recursive: true, force: true })
    }
  })
})

describe('generateVault — real runtime/templates/AGENTS.md guard', () => {
  it('exists and is non-empty', () => {
    const dirname = path.dirname(fileURLToPath(import.meta.url))
    const templatePath = path.resolve(
      dirname,
      '..',
      '..',
      '..',
      '..',
      'runtime',
      'templates',
      'AGENTS.md'
    )

    const content = fs.readFileSync(templatePath, 'utf-8')
    expect(content.trim().length).toBeGreaterThan(0)
  })
})
