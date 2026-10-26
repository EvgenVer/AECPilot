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
  listIndexExclude,
  listProjectIndex,
  listProjectSources,
  openProject,
  removeSourceFromProject,
  renameSource,
  updateProjectSettings
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

  it('generates the vault and returns the created project (name trimmed)', async () => {
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
  it('rejects before touching the filesystem', async () => {
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
  it('returns a human-readable error and creates nothing', async () => {
    const parent = makeTempDir('aecpilot-create-project-notemplate-')
    try {
      const vaultPath = path.join(parent, 'vault')
      const missingTemplatePath = path.join(parent, 'does-not-exist.md')

      const result = createProject(vaultPath, 'Объект-X', missingTemplatePath)

      expect('ok' in result && !result.ok).toBe(true)
      if ('ok' in result && !result.ok) expect(result.error).toContain('AGENTS.md')
      expect(fs.existsSync(vaultPath)).toBe(false)
    } finally {
      fs.rmSync(parent, { recursive: true, force: true })
    }
  })
})

// Task 1.5.4 — Obsidian-style init: a non-empty target directory is no
// longer rejected outright by createProject either.
describe('createProject — non-empty target directory, no naming conflict', () => {
  it('succeeds, leaving the existing file untouched and adding the missing vault structure', async () => {
    const parent = makeTempDir('aecpilot-create-project-nonempty-')
    try {
      const templatePath = path.join(parent, 'AGENTS.template.md')
      fs.writeFileSync(templatePath, AGENTS_TEMPLATE)
      const vaultPath = path.join(parent, 'vault')
      fs.mkdirSync(vaultPath)
      fs.writeFileSync(path.join(vaultPath, 'existing.txt'), 'pre-existing content')

      const result = createProject(vaultPath, 'Объект-X', templatePath)

      expect(result).toEqual({ ok: true, project: { name: 'Объект-X', vaultPath } })
      expect(fs.readFileSync(path.join(vaultPath, 'existing.txt'), 'utf-8')).toBe(
        'pre-existing content'
      )
      expect(fs.statSync(path.join(vaultPath, 'wiki')).isDirectory()).toBe(true)
      const projectJson = JSON.parse(
        fs.readFileSync(path.join(vaultPath, '.aecpilot', 'project.json'), 'utf-8')
      )
      expect(validateProjectConfig(projectJson).ok).toBe(true)
    } finally {
      fs.rmSync(parent, { recursive: true, force: true })
    }
  })
})

describe('createProject — non-empty target directory, AGENTS.md naming conflict', () => {
  it('returns needsConfirm without writing anything, then succeeds once confirmed (AGENTS.md preserved)', async () => {
    const parent = makeTempDir('aecpilot-create-project-conflict-')
    try {
      const templatePath = path.join(parent, 'AGENTS.template.md')
      fs.writeFileSync(templatePath, AGENTS_TEMPLATE)
      const vaultPath = path.join(parent, 'vault')
      fs.mkdirSync(vaultPath)
      fs.writeFileSync(path.join(vaultPath, 'AGENTS.md'), '# my own notes\n')

      const result = createProject(vaultPath, 'Объект-X', templatePath)

      expect(result).toEqual({ needsConfirm: [expect.stringContaining('AGENTS.md')] })
      expect(fs.readdirSync(vaultPath)).toEqual(['AGENTS.md'])

      const confirmed = createProject(vaultPath, 'Объект-X', templatePath, { confirmed: true })

      expect(confirmed).toEqual({ ok: true, project: { name: 'Объект-X', vaultPath } })
      expect(fs.readFileSync(path.join(vaultPath, 'AGENTS.md'), 'utf-8')).toBe('# my own notes\n')
      expect(fs.statSync(path.join(vaultPath, 'wiki')).isDirectory()).toBe(true)
    } finally {
      fs.rmSync(parent, { recursive: true, force: true })
    }
  })
})

describe('createProject — target directory already an AECPilot project', () => {
  it('returns a Russian error pointing at "Открыть проект", without touching project.json', async () => {
    const parent = makeTempDir('aecpilot-create-project-already-')
    try {
      const templatePath = path.join(parent, 'AGENTS.template.md')
      fs.writeFileSync(templatePath, AGENTS_TEMPLATE)
      const vaultPath = path.join(parent, 'vault')
      generateVault({ vaultPath, projectName: 'Объект-X', agentsTemplate: AGENTS_TEMPLATE })
      const before = fs.readFileSync(path.join(vaultPath, '.aecpilot', 'project.json'), 'utf-8')

      const result = createProject(vaultPath, 'Другое имя', templatePath)

      expect('ok' in result && !result.ok).toBe(true)
      if ('ok' in result && !result.ok) expect(result.error).toContain('Открыть проект')
      expect(fs.readFileSync(path.join(vaultPath, '.aecpilot', 'project.json'), 'utf-8')).toBe(
        before
      )
    } finally {
      fs.rmSync(parent, { recursive: true, force: true })
    }
  })

  // Review fix-iteration 1 (minor 1): a `.aecpilot/project.json` that exists
  // but is broken/invalid content is still "already a project" as far as
  // createProject/generateVault are concerned (existence-only check, see
  // vault-generator.ts's hasProjectJsonFile) — it's never clobbered or
  // "repaired" by (re-)creating over it. Recovering it is a separate,
  // deliberate, manual action; openProject is where the corrupt-JSON error
  // actually surfaces to the user.
  it('treats a broken (invalid JSON) project.json the same way — already-project, file untouched', async () => {
    const parent = makeTempDir('aecpilot-create-project-broken-json-')
    try {
      const templatePath = path.join(parent, 'AGENTS.template.md')
      fs.writeFileSync(templatePath, AGENTS_TEMPLATE)
      const vaultPath = path.join(parent, 'vault')
      fs.mkdirSync(path.join(vaultPath, '.aecpilot'), { recursive: true })
      fs.writeFileSync(path.join(vaultPath, '.aecpilot', 'project.json'), '{ not valid json')

      const result = createProject(vaultPath, 'Объект-X', templatePath)

      expect('ok' in result && !result.ok).toBe(true)
      if ('ok' in result && !result.ok) expect(result.error).toContain('Открыть проект')
      expect(fs.readFileSync(path.join(vaultPath, '.aecpilot', 'project.json'), 'utf-8')).toBe(
        '{ not valid json'
      )
    } finally {
      fs.rmSync(parent, { recursive: true, force: true })
    }
  })
})

describe('createProject — target path is a file', () => {
  it('maps generateVault error to a Russian, UI-friendly message', async () => {
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

  it('opens a valid vault (fixture via generateVault), taking the name from project.json — not the folder name', async () => {
    const vaultPath = path.join(parent, 'some-folder-name')
    generateVault({ vaultPath, projectName: 'Объект-Y', agentsTemplate: AGENTS_TEMPLATE })

    const result = openProject(vaultPath)

    expect(result).toEqual({ ok: true, project: { name: 'Объект-Y', vaultPath } })
  })

  // Task 1.5.4: a folder with no .aecpilot/project.json is no longer a flat
  // error — Obsidian-style, any folder can become a project, so the caller
  // (UI) gets a signal to offer initializing one here instead.
  it('returns needsInit (not an error) for a folder with no .aecpilot/project.json', async () => {
    const vaultPath = path.join(parent, 'not-a-vault')
    fs.mkdirSync(vaultPath)

    const result = openProject(vaultPath)

    expect(result).toEqual({ needsInit: true, suggestedName: 'not-a-vault' })
  })

  it('rejects a vaultPath that does not exist at all (not needsInit)', async () => {
    const vaultPath = path.join(parent, 'does-not-exist')

    const result = openProject(vaultPath)

    expect(result).toEqual({ ok: false, error: 'Папка не найдена' })
  })

  it('rejects a corrupt (non-JSON) project.json', async () => {
    const vaultPath = path.join(parent, 'broken-json-vault')
    fs.mkdirSync(path.join(vaultPath, '.aecpilot'), { recursive: true })
    fs.writeFileSync(path.join(vaultPath, '.aecpilot', 'project.json'), '{ not valid json')

    const result = openProject(vaultPath)

    expect(result).toEqual({
      ok: false,
      error: 'Файл .aecpilot/project.json повреждён (невалидный JSON)'
    })
  })

  it('rejects a schema-invalid project.json, listing the errors', async () => {
    const vaultPath = path.join(parent, 'invalid-config-vault')
    fs.mkdirSync(path.join(vaultPath, '.aecpilot'), { recursive: true })
    fs.writeFileSync(
      path.join(vaultPath, '.aecpilot', 'project.json'),
      JSON.stringify({ schema_version: 1, name: '' })
    )

    const result = openProject(vaultPath)

    expect('ok' in result && !result.ok).toBe(true)
    if ('ok' in result && !result.ok) {
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

  it('adds a source, re-reads and re-validates project.json, and returns the updated list', async () => {
    const sourceDir = path.join(parent, 'source-a')
    fs.mkdirSync(sourceDir)

    const result = await addSourceToProject(vaultPath, sourceDir, {
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

  it('rejects re-adding the exact same path (already connected), leaving project.json untouched', async () => {
    const sourceDir = path.join(parent, 'source-b')
    fs.mkdirSync(sourceDir)

    const first = await addSourceToProject(vaultPath, sourceDir, { idFactory: () => 'id-1' })
    expect('ok' in first && first.ok).toBe(true)

    const before = fs.readFileSync(path.join(vaultPath, '.aecpilot', 'project.json'), 'utf-8')
    const second = await addSourceToProject(vaultPath, sourceDir, { idFactory: () => 'id-2' })
    const after = fs.readFileSync(path.join(vaultPath, '.aecpilot', 'project.json'), 'utf-8')

    expect(second).toEqual({ ok: false, errors: ['Этот путь уже подключён как источник'] })
    expect(after).toBe(before)
  })

  it('rejects a source nested inside the vault, without writing anything', async () => {
    const before = fs.readFileSync(path.join(vaultPath, '.aecpilot', 'project.json'), 'utf-8')

    const result = await addSourceToProject(vaultPath, path.join(vaultPath, 'wiki'))

    expect('ok' in result && result.ok).toBe(false)
    const after = fs.readFileSync(path.join(vaultPath, '.aecpilot', 'project.json'), 'utf-8')
    expect(after).toBe(before)
  })

  it('returns needsConfirm for an inaccessible (non-existent) path, writing nothing until confirmed', async () => {
    const missingDir = path.join(parent, 'does-not-exist')

    const result = await addSourceToProject(vaultPath, missingDir)

    expect(result).toEqual({
      needsConfirm: ['Путь сейчас недоступен — источник будет добавлен как недоступный']
    })

    const confirmed = await addSourceToProject(vaultPath, missingDir, {
      confirmed: true,
      idFactory: () => 'id-missing'
    })
    expect(confirmed).toEqual({
      ok: true,
      sources: [expect.objectContaining({ id: 'id-missing', root_path: missingDir })]
    })
  })

  it('returns needsConfirm for an overlap with an existing source, then adds it once confirmed', async () => {
    const parentDir = path.join(parent, 'overlap-parent')
    fs.mkdirSync(parentDir)
    const addFirst = await addSourceToProject(vaultPath, parentDir, {
      idFactory: () => 'id-parent'
    })
    expect('ok' in addFirst && addFirst.ok).toBe(true)

    const nestedDir = path.join(parentDir, 'nested')
    fs.mkdirSync(nestedDir)

    const result = await addSourceToProject(vaultPath, nestedDir)
    expect('needsConfirm' in result).toBe(true)
    if ('needsConfirm' in result) {
      expect(result.needsConfirm[0]).toContain(parentDir)
    }

    const confirmed = await addSourceToProject(vaultPath, nestedDir, {
      confirmed: true,
      idFactory: () => 'id-nested'
    })
    expect('ok' in confirmed && confirmed.ok).toBe(true)
    if ('ok' in confirmed && confirmed.ok) expect(confirmed.sources).toHaveLength(2)
  })

  it('rejects when the vault has no project.json', async () => {
    const notAVault = path.join(parent, 'not-a-vault')
    fs.mkdirSync(notAVault)

    const result = await addSourceToProject(notAVault, path.join(parent, 'source-c'))

    expect('ok' in result && result.ok).toBe(false)
    if ('ok' in result && !result.ok) expect(result.errors[0]).toContain('Папка недоступна')
  })

  it('returns {ok:false} on a write failure instead of throwing, leaving project.json untouched', async () => {
    const sourceDir = path.join(parent, 'source-write-fail')
    fs.mkdirSync(sourceDir)

    const writeFileSyncMock = vi.mocked(fs.writeFileSync)
    const realWriteFileSync = writeFileSyncMock.getMockImplementation()!
    writeFileSyncMock.mockImplementationOnce(() => {
      throw new Error('simulated disk failure')
    })

    const before = fs.readFileSync(path.join(vaultPath, '.aecpilot', 'project.json'), 'utf-8')
    let result: Awaited<ReturnType<typeof addSourceToProject>>
    try {
      result = await addSourceToProject(vaultPath, sourceDir)
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

// Task 1.16: BDD "Отключение источника" — project.json is the source of
// truth for which sources are connected; this only removes the entry
// (marking index.db rows detached is a separate, best-effort step taken by
// the `sources:remove` IPC handler via `aec-rag detach`, out of scope here).
describe('removeSourceFromProject', () => {
  let parent: string
  let vaultPath: string

  beforeEach(() => {
    parent = makeTempDir('aecpilot-remove-source-')
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

  it('removes the source, re-reads and re-validates project.json, and returns the remaining list', async () => {
    const sourceDir = path.join(parent, 'source-a')
    fs.mkdirSync(sourceDir)
    const otherDir = path.join(parent, 'source-b')
    fs.mkdirSync(otherDir)
    await addSourceToProject(vaultPath, sourceDir, { idFactory: () => 'id-a' })
    await addSourceToProject(vaultPath, otherDir, { idFactory: () => 'id-b' })

    const result = removeSourceFromProject(vaultPath, 'id-a')

    expect(result).toEqual({
      ok: true,
      sources: [{ id: 'id-b', root_path: otherDir, added_at: expect.any(String) }]
    })

    const raw = fs.readFileSync(path.join(vaultPath, '.aecpilot', 'project.json'), 'utf-8')
    expect(raw.endsWith('\n')).toBe(true)
    const validated = validateProjectConfig(JSON.parse(raw))
    expect(validated.ok).toBe(true)
    if (validated.ok) {
      expect(validated.value.sources.map((s) => s.id)).toEqual(['id-b'])
    }
  })

  it('rejects an unknown sourceId, leaving project.json untouched', async () => {
    const sourceDir = path.join(parent, 'source-a')
    fs.mkdirSync(sourceDir)
    await addSourceToProject(vaultPath, sourceDir, { idFactory: () => 'id-a' })

    const before = fs.readFileSync(path.join(vaultPath, '.aecpilot', 'project.json'), 'utf-8')
    const result = removeSourceFromProject(vaultPath, 'no-such-id')
    const after = fs.readFileSync(path.join(vaultPath, '.aecpilot', 'project.json'), 'utf-8')

    expect(result).toEqual({ ok: false, error: 'Источник не найден' })
    expect(after).toBe(before)
  })

  it('returns {ok:false} on a write failure instead of throwing, leaving project.json untouched', async () => {
    const sourceDir = path.join(parent, 'source-a')
    fs.mkdirSync(sourceDir)
    await addSourceToProject(vaultPath, sourceDir, { idFactory: () => 'id-a' })

    const writeFileSyncMock = vi.mocked(fs.writeFileSync)
    const realWriteFileSync = writeFileSyncMock.getMockImplementation()!
    writeFileSyncMock.mockImplementationOnce(() => {
      throw new Error('simulated disk failure')
    })

    const before = fs.readFileSync(path.join(vaultPath, '.aecpilot', 'project.json'), 'utf-8')
    let result: ReturnType<typeof removeSourceFromProject>
    try {
      result = removeSourceFromProject(vaultPath, 'id-a')
    } finally {
      writeFileSyncMock.mockImplementation(realWriteFileSync)
    }
    const after = fs.readFileSync(path.join(vaultPath, '.aecpilot', 'project.json'), 'utf-8')

    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining('Не удалось сохранить project.json')
    })
    expect(after).toBe(before)
  })

  it('rejects when the vault has no project.json', async () => {
    const notAVault = path.join(parent, 'not-a-vault')
    fs.mkdirSync(notAVault)

    const result = removeSourceFromProject(notAVault, 'id-a')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('Папка недоступна')
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

  it('returns the tree for a reachable source', async () => {
    const added = await addSourceToProject(vaultPath, okSourceDir, { idFactory: () => 'src-ok' })
    expect('ok' in added && added.ok).toBe(true)

    const result = await getSourceTreeResult(vaultPath, 'src-ok')

    expect(result).toEqual({
      ok: true,
      status: 'ok',
      tree: [{ name: 'note.txt', path: 'note.txt', type: 'file' }]
    })
  })

  it('returns {ok:false} for an unknown sourceId', async () => {
    expect(await getSourceTreeResult(vaultPath, 'no-such-id')).toEqual({
      ok: false,
      error: 'Источник не найден'
    })
  })

  it('reports unavailable (never throws) once the source root is removed, isolated from an ok source', async () => {
    const addedOk = await addSourceToProject(vaultPath, okSourceDir, { idFactory: () => 'src-ok' })
    expect('ok' in addedOk && addedOk.ok).toBe(true)
    const addedMissing = await addSourceToProject(vaultPath, missingSourceDir, {
      idFactory: () => 'src-missing'
    })
    expect('ok' in addedMissing && addedMissing.ok).toBe(true)

    // Mocks "the network path became unreachable" (docs/history/specs/workspace-sources.md
    // "Недоступный источник") — removing the folder after it was connected.
    fs.rmSync(missingSourceDir, { recursive: true, force: true })

    const okResult = await getSourceTreeResult(vaultPath, 'src-ok')
    const missingResult = await getSourceTreeResult(vaultPath, 'src-missing')

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

  it('returns status "ok" for a reachable source', async () => {
    const added = await addSourceToProject(vaultPath, okSourceDir, { idFactory: () => 'src-ok' })
    expect('ok' in added && added.ok).toBe(true)

    expect(await getSourceStatusResult(vaultPath, 'src-ok')).toEqual({ ok: true, status: 'ok' })
  })

  it('returns {ok:false} for an unknown sourceId', async () => {
    expect(await getSourceStatusResult(vaultPath, 'no-such-id')).toEqual({
      ok: false,
      error: 'Источник не найден'
    })
  })

  it('reports unavailable once the source root is removed, isolated from an ok source', async () => {
    const addedOk = await addSourceToProject(vaultPath, okSourceDir, { idFactory: () => 'src-ok' })
    expect('ok' in addedOk && addedOk.ok).toBe(true)
    const addedMissing = await addSourceToProject(vaultPath, missingSourceDir, {
      idFactory: () => 'src-missing'
    })
    expect('ok' in addedMissing && addedMissing.ok).toBe(true)

    fs.rmSync(missingSourceDir, { recursive: true, force: true })

    expect(await getSourceStatusResult(vaultPath, 'src-ok')).toEqual({ ok: true, status: 'ok' })
    expect(await getSourceStatusResult(vaultPath, 'src-missing')).toEqual({
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

  it('reads a non-default configured value', async () => {
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

  it('falls back to the 300s default when project.json is unreadable', async () => {
    expect(getScanIntervalSeconds(vaultPath)).toBe(300)
  })
})

// Задача 5.14. `extraction_language` появился в схеме не ради полноты: до него
// это поле СТИРАЛОСЬ. Валидатор пересобирает `settings` из известных ему полей,
// а `updateProjectSettings` пишет обратно пересобранное — значит язык,
// проставленный руками, исчезал при первой же правке интервала через окно.
describe('updateProjectSettings — язык извлечения', () => {
  let parent: string
  let vaultPath: string

  beforeEach(() => {
    parent = makeTempDir('aecpilot-extraction-lang-')
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

  function onDisk(): Record<string, unknown> {
    const raw = fs.readFileSync(path.join(vaultPath, '.aecpilot', 'project.json'), 'utf-8')
    return (JSON.parse(raw) as { settings: Record<string, unknown> }).settings
  }

  it('переживает правку соседнего поля, а не исчезает вместе с ней', () => {
    expect(updateProjectSettings(vaultPath, { extraction_language: 'English' }).ok).toBe(true)
    expect(updateProjectSettings(vaultPath, { scan_interval_s: 60 }).ok).toBe(true)

    expect(onDisk().extraction_language).toBe('English')
    expect(onDisk().scan_interval_s).toBe(60)
  })

  it('пустая строка законна — это «не выбран», а не пустое значение', () => {
    // Отличие от wiki_lang: там пусто — ошибка, здесь пусто — это ответ,
    // и его читает `rag_index.load_settings`, подставляя своё умолчание.
    expect(updateProjectSettings(vaultPath, { extraction_language: '' }).ok).toBe(true)
  })

  it('пробелы по краям отклоняются: они уедут в отпечаток графа как есть', () => {
    const result = updateProjectSettings(vaultPath, { extraction_language: ' Russian' })

    expect(result.ok).toBe(false)
    // И, что важнее отказа, — на диск ничего не легло.
    expect(onDisk().extraction_language).toBe('')
  })
})

describe('renameSource (3J.5)', () => {
  let parent: string
  let vaultPath: string
  let sourceDir: string

  beforeEach(async () => {
    parent = makeTempDir('aecpilot-rename-source-')
    vaultPath = path.join(parent, 'vault')
    generateVault({
      vaultPath,
      projectName: 'Объект-X',
      agentsTemplate: AGENTS_TEMPLATE,
      nowIso: '2026-07-14T12:00:00.000Z'
    })
    sourceDir = path.join(parent, 'Изыскания')
    fs.mkdirSync(sourceDir)
    await addSourceToProject(vaultPath, sourceDir, { idFactory: () => 'id-a' })
  })

  afterEach(() => {
    fs.rmSync(parent, { recursive: true, force: true })
  })

  it('пишет название только в project.json — папка на диске та же', () => {
    const result = renameSource(vaultPath, 'id-a', '  ИГИ  ')

    expect(result).toEqual({
      ok: true,
      sources: [{ id: 'id-a', root_path: sourceDir, added_at: expect.any(String), label: 'ИГИ' }]
    })
    expect(fs.existsSync(sourceDir)).toBe(true)
    const raw = JSON.parse(
      fs.readFileSync(path.join(vaultPath, '.aecpilot', 'project.json'), 'utf-8')
    )
    expect(validateProjectConfig(raw).ok).toBe(true)
    expect(listProjectSources(vaultPath)[0]?.label).toBe('ИГИ')
  })

  it('пустое название — сброс к имени папки', () => {
    renameSource(vaultPath, 'id-a', 'ИГИ')
    const result = renameSource(vaultPath, 'id-a', '   ')

    expect(result.ok && result.sources[0]).toEqual({
      id: 'id-a',
      root_path: sourceDir,
      added_at: expect.any(String)
    })
  })

  it('неизвестный источник — отказ без записи', () => {
    expect(renameSource(vaultPath, 'no-such-id', 'X')).toEqual({
      ok: false,
      error: 'Источник не найден'
    })
  })
})

describe('D-200: поля project.json, которых нет в схеме приложения, переживают запись', () => {
  let parent: string
  let vaultPath: string

  beforeEach(() => {
    parent = makeTempDir('aecpilot-d200-')
    vaultPath = path.join(parent, 'vault')
    generateVault({
      vaultPath,
      projectName: 'Объект-X',
      agentsTemplate: AGENTS_TEMPLATE,
      nowIso: '2026-07-14T12:00:00.000Z'
    })
    const configPath = path.join(vaultPath, '.aecpilot', 'project.json')
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    raw.graph_scope = { entries: [{ added_at: 't', kind: 'folder', path: 'id-a/КР' }] }
    raw.project_index = [{ added_at: 't', path: 'wiki/КР.md' }]
    fs.writeFileSync(configPath, JSON.stringify(raw))
  })

  afterEach(() => {
    fs.rmSync(parent, { recursive: true, force: true })
  })

  it('подключение, переименование и удаление источника не стирают граф и файлы проекта', async () => {
    const sourceDir = path.join(parent, 'Изыскания')
    fs.mkdirSync(sourceDir)
    await addSourceToProject(vaultPath, sourceDir, { idFactory: () => 'id-a' })
    renameSource(vaultPath, 'id-a', 'ИГИ')
    removeSourceFromProject(vaultPath, 'id-a')
    updateProjectSettings(vaultPath, { scan_interval_s: 600 })

    const raw = JSON.parse(
      fs.readFileSync(path.join(vaultPath, '.aecpilot', 'project.json'), 'utf-8')
    )
    expect(raw.graph_scope.entries[0].path).toBe('id-a/КР')
    expect(raw.project_index).toEqual([{ added_at: 't', path: 'wiki/КР.md' }])
    expect(raw.settings.scan_interval_s).toBe(600)
    expect(raw.sources).toEqual([])
  })
})

describe('listProjectIndex (3K.4)', () => {
  let parent: string
  let vaultPath: string

  beforeEach(() => {
    parent = makeTempDir('aecpilot-project-index-')
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

  it('ничего не отмечено — пустой список', () => {
    expect(listProjectIndex(vaultPath)).toEqual([])
  })

  it('отдаёт пути отмеченных файлов и пропускает мусор', () => {
    const configPath = path.join(vaultPath, '.aecpilot', 'project.json')
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    raw.project_index = [{ path: 'wiki/КР.md', added_at: 't' }, { path: '' }, 'x', null]
    fs.writeFileSync(configPath, JSON.stringify(raw))

    expect(listProjectIndex(vaultPath)).toEqual(['wiki/КР.md'])
  })

  it('нет проекта — пустой список, а не исключение', () => {
    expect(listProjectIndex(path.join(parent, 'нет'))).toEqual([])
  })
})

describe('listIndexExclude (3L.5)', () => {
  let parent: string
  let vaultPath: string

  beforeEach(() => {
    parent = makeTempDir('aecpilot-index-exclude-')
    vaultPath = path.join(parent, 'vault')
    generateVault({
      vaultPath,
      projectName: 'Объект-X',
      agentsTemplate: AGENTS_TEMPLATE,
      nowIso: '2026-10-12T12:00:00.000Z'
    })
  })

  afterEach(() => {
    fs.rmSync(parent, { recursive: true, force: true })
  })

  it('отдаёт места `<source>/<rel>` и пропускает мусор', () => {
    const configPath = path.join(vaultPath, '.aecpilot', 'project.json')
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    raw.index_exclude = [
      { source_id: 's1', path: 'КР/Сваи.pdf', added_at: 't' },
      { source_id: 's1', path: '' },
      { path: 'без источника' },
      'x',
      null
    ]
    fs.writeFileSync(configPath, JSON.stringify(raw))

    expect(listIndexExclude(vaultPath)).toEqual(['s1/КР/Сваи.pdf'])
  })

  it('ничего не убрано или нет проекта — пустой список', () => {
    expect(listIndexExclude(vaultPath)).toEqual([])
    expect(listIndexExclude(path.join(parent, 'нет'))).toEqual([])
  })
})
