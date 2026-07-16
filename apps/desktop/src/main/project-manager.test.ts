// Unit tests for task 1.3's createProject (validate name + read template +
// generateVault behind project:create) and task 1.4's openProject
// (read + validate an existing vault's project.json behind project:open).

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { validateProjectConfig } from '../project/project-config'
import { generateVault } from '../project/vault-generator'
import {
  addSourceToProject,
  createProject,
  getScanIntervalSeconds,
  getSourceStatusResult,
  getSourceTreeResult,
  openProject
} from './project-manager'

// Fix-iteration 1 (review minor): lets the "write failure" test below make a
// single `writeFileSync` call throw without affecting any other test in
// this file — same technique as vault-generator.test.ts's mock (see its
// comment for why `vi.spyOn` doesn't work on this ESM module namespace).
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, writeFileSync: vi.fn(actual.writeFileSync) }
})

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

const AGENTS_TEMPLATE = '# AGENTS.md — {{PROJECT_NAME}}\n\nПлейсхолдер задачи 1.5.\n'

describe('createProject — success', () => {
  let parent: string
  let templatePath: string

  beforeEach(() => {
    parent = makeTempDir('aecpilot-create-project-')
    templatePath = path.join(parent, 'AGENTS.template.md')
    fs.writeFileSync(templatePath, AGENTS_TEMPLATE)
  })

  afterEach(() => {
    fs.rmSync(parent, { recursive: true, force: true })
  })

  it('generates the vault and returns the created project (name trimmed)', () => {
    const vaultPath = path.join(parent, 'vault')

    const result = createProject(vaultPath, '  Объект-X  ', templatePath)

    expect(result).toEqual({ ok: true, project: { name: 'Объект-X', vaultPath } })

    const agentsContent = fs.readFileSync(path.join(vaultPath, 'AGENTS.md'), 'utf-8')
    expect(agentsContent).toContain('Объект-X')

    const projectJson = JSON.parse(
      fs.readFileSync(path.join(vaultPath, '.aecpilot', 'project.json'), 'utf-8')
    )
    expect(validateProjectConfig(projectJson).ok).toBe(true)
  })
})

describe('createProject — blank name', () => {
  it('rejects before touching the filesystem', () => {
    const parent = makeTempDir('aecpilot-create-project-blank-')
    try {
      const templatePath = path.join(parent, 'AGENTS.template.md')
      fs.writeFileSync(templatePath, AGENTS_TEMPLATE)
      const vaultPath = path.join(parent, 'vault')

      const result = createProject(vaultPath, '   ', templatePath)

      expect(result).toEqual({ ok: false, error: expect.stringContaining('пустым') })
      expect(fs.existsSync(vaultPath)).toBe(false)
    } finally {
      fs.rmSync(parent, { recursive: true, force: true })
    }
  })
})

describe('createProject — unreadable template', () => {
  it('returns a human-readable error and creates nothing', () => {
    const parent = makeTempDir('aecpilot-create-project-notemplate-')
    try {
      const vaultPath = path.join(parent, 'vault')
      const missingTemplatePath = path.join(parent, 'does-not-exist.md')

      const result = createProject(vaultPath, 'Объект-X', missingTemplatePath)

      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toContain('AGENTS.md')
      expect(fs.existsSync(vaultPath)).toBe(false)
    } finally {
      fs.rmSync(parent, { recursive: true, force: true })
    }
  })
})

describe('createProject — non-empty target directory', () => {
  it('maps generateVault error to a Russian, UI-friendly message, leaving the directory untouched', () => {
    const parent = makeTempDir('aecpilot-create-project-nonempty-')
    try {
      const templatePath = path.join(parent, 'AGENTS.template.md')
      fs.writeFileSync(templatePath, AGENTS_TEMPLATE)
      const vaultPath = path.join(parent, 'vault')
      fs.mkdirSync(vaultPath)
      fs.writeFileSync(path.join(vaultPath, 'existing.txt'), 'pre-existing content')

      const result = createProject(vaultPath, 'Объект-X', templatePath)

      expect(result).toEqual({ ok: false, error: 'Папка не пуста — выберите пустую папку' })
      expect(fs.readdirSync(vaultPath)).toEqual(['existing.txt'])
    } finally {
      fs.rmSync(parent, { recursive: true, force: true })
    }
  })
})

describe('createProject — target path is a file', () => {
  it('maps generateVault error to a Russian, UI-friendly message', () => {
    const parent = makeTempDir('aecpilot-create-project-file-target-')
    try {
      const templatePath = path.join(parent, 'AGENTS.template.md')
      fs.writeFileSync(templatePath, AGENTS_TEMPLATE)
      const vaultPath = path.join(parent, 'vault')
      fs.writeFileSync(vaultPath, 'not a directory')

      const result = createProject(vaultPath, 'Объект-X', templatePath)

      expect(result).toEqual({ ok: false, error: 'Указанный путь — файл, а не папка' })
    } finally {
      fs.rmSync(parent, { recursive: true, force: true })
    }
  })
})

describe('openProject', () => {
  let parent: string

  beforeEach(() => {
    parent = makeTempDir('aecpilot-open-project-')
  })

  afterEach(() => {
    fs.rmSync(parent, { recursive: true, force: true })
  })

  it('opens a valid vault (fixture via generateVault), taking the name from project.json — not the folder name', () => {
    const vaultPath = path.join(parent, 'some-folder-name')
    generateVault({ vaultPath, projectName: 'Объект-Y', agentsTemplate: AGENTS_TEMPLATE })

    const result = openProject(vaultPath)

    expect(result).toEqual({ ok: true, project: { name: 'Объект-Y', vaultPath } })
  })

  it('rejects a folder with no .aecpilot/project.json', () => {
    const vaultPath = path.join(parent, 'not-a-vault')
    fs.mkdirSync(vaultPath)

    const result = openProject(vaultPath)

    expect(result).toEqual({ ok: false, error: 'Папка не является проектом AECPilot' })
  })

  it('rejects a corrupt (non-JSON) project.json', () => {
    const vaultPath = path.join(parent, 'broken-json-vault')
    fs.mkdirSync(path.join(vaultPath, '.aecpilot'), { recursive: true })
    fs.writeFileSync(path.join(vaultPath, '.aecpilot', 'project.json'), '{ not valid json')

    const result = openProject(vaultPath)

    expect(result).toEqual({
      ok: false,
      error: 'Файл .aecpilot/project.json повреждён (невалидный JSON)'
    })
  })

  it('rejects a schema-invalid project.json, listing the errors', () => {
    const vaultPath = path.join(parent, 'invalid-config-vault')
    fs.mkdirSync(path.join(vaultPath, '.aecpilot'), { recursive: true })
    fs.writeFileSync(
      path.join(vaultPath, '.aecpilot', 'project.json'),
      JSON.stringify({ schema_version: 1, name: '' })
    )

    const result = openProject(vaultPath)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Некорректный project.json')
      expect(result.error).toContain('name')
    }
  })
})

describe('addSourceToProject', () => {
  let parent: string
  let vaultPath: string

  beforeEach(() => {
    parent = makeTempDir('aecpilot-add-source-')
    vaultPath = path.join(parent, 'vault')
    generateVault({
      vaultPath,
      projectName: 'Объект-X',
      agentsTemplate: AGENTS_TEMPLATE,
      nowIso: '2026-07-14T12:00:00.000Z'
    })
  })

  afterEach(() => {
    fs.rmSync(parent, { recursive: true, force: true })
  })

  it('adds a source, re-reads and re-validates project.json, and returns the updated list', () => {
    const sourceDir = path.join(parent, 'source-a')
    fs.mkdirSync(sourceDir)

    const result = addSourceToProject(vaultPath, sourceDir, {
      nowIso: '2026-07-15T09:00:00.000Z',
      idFactory: () => 'fixed-id-1'
    })

    expect(result).toEqual({
      ok: true,
      sources: [{ id: 'fixed-id-1', root_path: sourceDir, added_at: '2026-07-15T09:00:00.000Z' }]
    })

    const raw = fs.readFileSync(path.join(vaultPath, '.aecpilot', 'project.json'), 'utf-8')
    expect(raw.endsWith('\n')).toBe(true)
    const parsed = JSON.parse(raw)
    const validated = validateProjectConfig(parsed)
    expect(validated.ok).toBe(true)
    if (validated.ok) {
      expect(validated.value.sources).toEqual([
        { id: 'fixed-id-1', root_path: sourceDir, added_at: '2026-07-15T09:00:00.000Z' }
      ])
    }
  })

  it('rejects re-adding the exact same path (already connected), leaving project.json untouched', () => {
    const sourceDir = path.join(parent, 'source-b')
    fs.mkdirSync(sourceDir)

    const first = addSourceToProject(vaultPath, sourceDir, { idFactory: () => 'id-1' })
    expect('ok' in first && first.ok).toBe(true)

    const before = fs.readFileSync(path.join(vaultPath, '.aecpilot', 'project.json'), 'utf-8')
    const second = addSourceToProject(vaultPath, sourceDir, { idFactory: () => 'id-2' })
    const after = fs.readFileSync(path.join(vaultPath, '.aecpilot', 'project.json'), 'utf-8')

    expect(second).toEqual({ ok: false, errors: ['Этот путь уже подключён как источник'] })
    expect(after).toBe(before)
  })

  it('rejects a source nested inside the vault, without writing anything', () => {
    const before = fs.readFileSync(path.join(vaultPath, '.aecpilot', 'project.json'), 'utf-8')

    const result = addSourceToProject(vaultPath, path.join(vaultPath, 'wiki'))

    expect('ok' in result && result.ok).toBe(false)
    const after = fs.readFileSync(path.join(vaultPath, '.aecpilot', 'project.json'), 'utf-8')
    expect(after).toBe(before)
  })

  it('returns needsConfirm for an inaccessible (non-existent) path, writing nothing until confirmed', () => {
    const missingDir = path.join(parent, 'does-not-exist')

    const result = addSourceToProject(vaultPath, missingDir)

    expect(result).toEqual({
      needsConfirm: ['Путь сейчас недоступен — источник будет добавлен как недоступный']
    })

    const confirmed = addSourceToProject(vaultPath, missingDir, {
      confirmed: true,
      idFactory: () => 'id-missing'
    })
    expect(confirmed).toEqual({
      ok: true,
      sources: [expect.objectContaining({ id: 'id-missing', root_path: missingDir })]
    })
  })

  it('returns needsConfirm for an overlap with an existing source, then adds it once confirmed', () => {
    const parentDir = path.join(parent, 'overlap-parent')
    fs.mkdirSync(parentDir)
    const addFirst = addSourceToProject(vaultPath, parentDir, { idFactory: () => 'id-parent' })
    expect('ok' in addFirst && addFirst.ok).toBe(true)

    const nestedDir = path.join(parentDir, 'nested')
    fs.mkdirSync(nestedDir)

    const result = addSourceToProject(vaultPath, nestedDir)
    expect('needsConfirm' in result).toBe(true)
    if ('needsConfirm' in result) {
      expect(result.needsConfirm[0]).toContain(parentDir)
    }

    const confirmed = addSourceToProject(vaultPath, nestedDir, {
      confirmed: true,
      idFactory: () => 'id-nested'
    })
    expect('ok' in confirmed && confirmed.ok).toBe(true)
    if ('ok' in confirmed && confirmed.ok) expect(confirmed.sources).toHaveLength(2)
  })

  it('rejects when the vault has no project.json', () => {
    const notAVault = path.join(parent, 'not-a-vault')
    fs.mkdirSync(notAVault)

    const result = addSourceToProject(notAVault, path.join(parent, 'source-c'))

    expect('ok' in result && result.ok).toBe(false)
    if ('ok' in result && !result.ok) expect(result.errors[0]).toContain('Папка недоступна')
  })

  it('returns {ok:false} on a write failure instead of throwing, leaving project.json untouched', () => {
    const sourceDir = path.join(parent, 'source-write-fail')
    fs.mkdirSync(sourceDir)

    const writeFileSyncMock = vi.mocked(fs.writeFileSync)
    const realWriteFileSync = writeFileSyncMock.getMockImplementation()!
    writeFileSyncMock.mockImplementationOnce(() => {
      throw new Error('simulated disk failure')
    })

    const before = fs.readFileSync(path.join(vaultPath, '.aecpilot', 'project.json'), 'utf-8')
    let result: ReturnType<typeof addSourceToProject>
    try {
      result = addSourceToProject(vaultPath, sourceDir)
    } finally {
      writeFileSyncMock.mockImplementation(realWriteFileSync)
    }
    const after = fs.readFileSync(path.join(vaultPath, '.aecpilot', 'project.json'), 'utf-8')

    expect('ok' in result && result.ok).toBe(false)
    if ('ok' in result && !result.ok) {
      expect(result.errors[0]).toContain('Не удалось сохранить project.json')
    }
    expect(after).toBe(before)
  })
})

// Task 1.8: core of BDD "Недоступный источник" — one source's root becomes
// unreachable (mocked here as "never existed"/"removed after being added"),
// the other's tree still builds normally, and neither ever throws.
describe('getSourceTreeResult', () => {
  let parent: string
  let vaultPath: string
  let okSourceDir: string
  let missingSourceDir: string

  beforeEach(() => {
    parent = makeTempDir('aecpilot-source-tree-result-')
    vaultPath = path.join(parent, 'vault')
    generateVault({
      vaultPath,
      projectName: 'Объект-X',
      agentsTemplate: AGENTS_TEMPLATE,
      nowIso: '2026-07-14T12:00:00.000Z'
    })

    okSourceDir = path.join(parent, 'source-ok')
    fs.mkdirSync(okSourceDir)
    fs.writeFileSync(path.join(okSourceDir, 'note.txt'), 'hi')

    missingSourceDir = path.join(parent, 'source-missing')
    fs.mkdirSync(missingSourceDir) // must exist when added — nesting/duplicate checks require it
  })

  afterEach(() => {
    fs.rmSync(parent, { recursive: true, force: true })
  })

  it('returns the tree for a reachable source', () => {
    const added = addSourceToProject(vaultPath, okSourceDir, { idFactory: () => 'src-ok' })
    expect('ok' in added && added.ok).toBe(true)

    const result = getSourceTreeResult(vaultPath, 'src-ok')

    expect(result).toEqual({
      ok: true,
      status: 'ok',
      tree: [{ name: 'note.txt', path: 'note.txt', type: 'file' }]
    })
  })

  it('returns {ok:false} for an unknown sourceId', () => {
    expect(getSourceTreeResult(vaultPath, 'no-such-id')).toEqual({
      ok: false,
      error: 'Источник не найден'
    })
  })

  it('reports unavailable (never throws) once the source root is removed, isolated from an ok source', () => {
    const addedOk = addSourceToProject(vaultPath, okSourceDir, { idFactory: () => 'src-ok' })
    expect('ok' in addedOk && addedOk.ok).toBe(true)
    const addedMissing = addSourceToProject(vaultPath, missingSourceDir, {
      idFactory: () => 'src-missing'
    })
    expect('ok' in addedMissing && addedMissing.ok).toBe(true)

    // Mocks "the network path became unreachable" (specs/workspace-sources.md
    // "Недоступный источник") — removing the folder after it was connected.
    fs.rmSync(missingSourceDir, { recursive: true, force: true })

    const okResult = getSourceTreeResult(vaultPath, 'src-ok')
    const missingResult = getSourceTreeResult(vaultPath, 'src-missing')

    expect(okResult).toEqual({
      ok: true,
      status: 'ok',
      tree: [{ name: 'note.txt', path: 'note.txt', type: 'file' }]
    })
    expect(missingResult).toEqual({ ok: true, status: 'unavailable' })
  })
})

// Task 1.8 fix-iteration 1: the cheap, tree-free status check the sidebar
// calls for every connected source on load (MAJOR fix — the "недоступен"
// badge must be visible without a manual expand). Same isolation guarantee
// as getSourceTreeResult, minus the directory read.
describe('getSourceStatusResult', () => {
  let parent: string
  let vaultPath: string
  let okSourceDir: string
  let missingSourceDir: string

  beforeEach(() => {
    parent = makeTempDir('aecpilot-source-status-result-')
    vaultPath = path.join(parent, 'vault')
    generateVault({
      vaultPath,
      projectName: 'Объект-X',
      agentsTemplate: AGENTS_TEMPLATE,
      nowIso: '2026-07-14T12:00:00.000Z'
    })

    okSourceDir = path.join(parent, 'source-ok')
    fs.mkdirSync(okSourceDir)

    missingSourceDir = path.join(parent, 'source-missing')
    fs.mkdirSync(missingSourceDir) // must exist when added — nesting/duplicate checks require it
  })

  afterEach(() => {
    fs.rmSync(parent, { recursive: true, force: true })
  })

  it('returns status "ok" for a reachable source', () => {
    const added = addSourceToProject(vaultPath, okSourceDir, { idFactory: () => 'src-ok' })
    expect('ok' in added && added.ok).toBe(true)

    expect(getSourceStatusResult(vaultPath, 'src-ok')).toEqual({ ok: true, status: 'ok' })
  })

  it('returns {ok:false} for an unknown sourceId', () => {
    expect(getSourceStatusResult(vaultPath, 'no-such-id')).toEqual({
      ok: false,
      error: 'Источник не найден'
    })
  })

  it('reports unavailable once the source root is removed, isolated from an ok source', () => {
    const addedOk = addSourceToProject(vaultPath, okSourceDir, { idFactory: () => 'src-ok' })
    expect('ok' in addedOk && addedOk.ok).toBe(true)
    const addedMissing = addSourceToProject(vaultPath, missingSourceDir, {
      idFactory: () => 'src-missing'
    })
    expect('ok' in addedMissing && addedMissing.ok).toBe(true)

    fs.rmSync(missingSourceDir, { recursive: true, force: true })

    expect(getSourceStatusResult(vaultPath, 'src-ok')).toEqual({ ok: true, status: 'ok' })
    expect(getSourceStatusResult(vaultPath, 'src-missing')).toEqual({
      ok: true,
      status: 'unavailable'
    })
  })
})

describe('getScanIntervalSeconds', () => {
  let parent: string
  let vaultPath: string

  beforeEach(() => {
    parent = makeTempDir('aecpilot-scan-interval-')
    vaultPath = path.join(parent, 'vault')
  })

  afterEach(() => {
    fs.rmSync(parent, { recursive: true, force: true })
  })

  it("reads generateVault's default (300s) from a freshly created vault", () => {
    generateVault({
      vaultPath,
      projectName: 'Объект-X',
      agentsTemplate: AGENTS_TEMPLATE,
      nowIso: '2026-07-14T12:00:00.000Z'
    })

    expect(getScanIntervalSeconds(vaultPath)).toBe(300)
  })

  it('reads a non-default configured value', () => {
    generateVault({
      vaultPath,
      projectName: 'Объект-X',
      agentsTemplate: AGENTS_TEMPLATE,
      nowIso: '2026-07-14T12:00:00.000Z'
    })
    const configPath = path.join(vaultPath, '.aecpilot', 'project.json')
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    config.settings.scan_interval_s = 60
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))

    expect(getScanIntervalSeconds(vaultPath)).toBe(60)
  })

  it('falls back to the 300s default when project.json is unreadable', () => {
    expect(getScanIntervalSeconds(vaultPath)).toBe(300)
  })
})
