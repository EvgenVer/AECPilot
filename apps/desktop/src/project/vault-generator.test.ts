// Unit tests for task 1.2's vault structure/starter-file generator.

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { validateProjectConfig } from './project-config'
import { ensureCheckpointMarker, generateVault } from './vault-generator'

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
    const result = generateVault({
      vaultPath,
      projectName: 'Объект-X',
      agentsTemplate: AGENTS_TEMPLATE,
      nowIso: NOW_ISO
    })

    expect(result).toEqual({ ok: true })
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

// Task 1.5.4 — Obsidian-style init: a non-empty target directory is no
// longer rejected outright. Only the missing pieces are created; the user's
// pre-existing files/folders are never touched.
describe('generateVault — non-empty target directory, no naming conflict', () => {
  it('succeeds, adding the missing structure around the existing file', () => {
    const vaultPath = makeTempDir('aecpilot-vault-nonempty-')
    try {
      fs.writeFileSync(path.join(vaultPath, 'existing.txt'), 'pre-existing content')

      const result = generateVault({
        vaultPath,
        projectName: 'Объект-X',
        agentsTemplate: AGENTS_TEMPLATE,
        nowIso: NOW_ISO
      })

      expect(result).toEqual({ ok: true })
      expect(fs.readFileSync(path.join(vaultPath, 'existing.txt'), 'utf-8')).toBe(
        'pre-existing content'
      )
      for (const dir of ['wiki', 'workspace', 'templates', '.aecpilot', '.aecpilot/logs']) {
        expect(fs.statSync(path.join(vaultPath, dir)).isDirectory()).toBe(true)
      }
      expect(fs.existsSync(path.join(vaultPath, 'AGENTS.md'))).toBe(true)
      expect(
        validateProjectConfig(
          JSON.parse(fs.readFileSync(path.join(vaultPath, '.aecpilot', 'project.json'), 'utf-8'))
        ).ok
      ).toBe(true)
    } finally {
      fs.rmSync(vaultPath, { recursive: true, force: true })
    }
  })
})

describe('generateVault — non-empty target directory, AGENTS.md naming conflict', () => {
  it('returns needs-confirm without writing anything when not confirmed', () => {
    const vaultPath = makeTempDir('aecpilot-vault-conflict-agents-')
    try {
      fs.writeFileSync(path.join(vaultPath, 'AGENTS.md'), '# my own notes\n')

      const result = generateVault({
        vaultPath,
        projectName: 'Объект-X',
        agentsTemplate: AGENTS_TEMPLATE,
        nowIso: NOW_ISO
      })

      expect(result).toEqual({ ok: false, reason: 'needs-confirm', conflicts: ['agents-md'] })
      expect(fs.readdirSync(vaultPath)).toEqual(['AGENTS.md'])
      expect(fs.readFileSync(path.join(vaultPath, 'AGENTS.md'), 'utf-8')).toBe('# my own notes\n')
    } finally {
      fs.rmSync(vaultPath, { recursive: true, force: true })
    }
  })

  it('once confirmed, adds the missing structure but leaves AGENTS.md untouched', () => {
    const vaultPath = makeTempDir('aecpilot-vault-conflict-agents-confirmed-')
    try {
      fs.writeFileSync(path.join(vaultPath, 'AGENTS.md'), '# my own notes\n')

      const result = generateVault({
        vaultPath,
        projectName: 'Объект-X',
        agentsTemplate: AGENTS_TEMPLATE,
        nowIso: NOW_ISO,
        confirmed: true
      })

      expect(result).toEqual({ ok: true })
      expect(fs.readFileSync(path.join(vaultPath, 'AGENTS.md'), 'utf-8')).toBe('# my own notes\n')
      for (const dir of ['wiki', 'workspace', 'templates', '.aecpilot', '.aecpilot/logs']) {
        expect(fs.statSync(path.join(vaultPath, dir)).isDirectory()).toBe(true)
      }
      expect(
        validateProjectConfig(
          JSON.parse(fs.readFileSync(path.join(vaultPath, '.aecpilot', 'project.json'), 'utf-8'))
        ).ok
      ).toBe(true)
    } finally {
      fs.rmSync(vaultPath, { recursive: true, force: true })
    }
  })
})

describe('generateVault — non-empty target directory, .aecpilot naming conflict', () => {
  it('returns needs-confirm (not yet a project — no project.json inside)', () => {
    const vaultPath = makeTempDir('aecpilot-vault-conflict-aecpilot-')
    try {
      fs.mkdirSync(path.join(vaultPath, '.aecpilot'))
      fs.writeFileSync(path.join(vaultPath, '.aecpilot', 'unrelated.txt'), 'not ours')

      const result = generateVault({
        vaultPath,
        projectName: 'Объект-X',
        agentsTemplate: AGENTS_TEMPLATE,
        nowIso: NOW_ISO
      })

      expect(result).toEqual({ ok: false, reason: 'needs-confirm', conflicts: ['aecpilot'] })
      expect(fs.existsSync(path.join(vaultPath, 'AGENTS.md'))).toBe(false)
      expect(fs.existsSync(path.join(vaultPath, '.aecpilot', 'project.json'))).toBe(false)
    } finally {
      fs.rmSync(vaultPath, { recursive: true, force: true })
    }
  })

  it('once confirmed, fills in the missing pieces (logs/, project.json) without touching the pre-existing file', () => {
    const vaultPath = makeTempDir('aecpilot-vault-conflict-aecpilot-confirmed-')
    try {
      fs.mkdirSync(path.join(vaultPath, '.aecpilot'))
      fs.writeFileSync(path.join(vaultPath, '.aecpilot', 'unrelated.txt'), 'not ours')

      const result = generateVault({
        vaultPath,
        projectName: 'Объект-X',
        agentsTemplate: AGENTS_TEMPLATE,
        nowIso: NOW_ISO,
        confirmed: true
      })

      expect(result).toEqual({ ok: true })
      expect(fs.readFileSync(path.join(vaultPath, '.aecpilot', 'unrelated.txt'), 'utf-8')).toBe(
        'not ours'
      )
      expect(fs.statSync(path.join(vaultPath, '.aecpilot', 'logs')).isDirectory()).toBe(true)
      expect(
        validateProjectConfig(
          JSON.parse(fs.readFileSync(path.join(vaultPath, '.aecpilot', 'project.json'), 'utf-8'))
        ).ok
      ).toBe(true)
    } finally {
      fs.rmSync(vaultPath, { recursive: true, force: true })
    }
  })
})

// Review fix-iteration 1 (minor 2): `.aecpilot` occupied by a plain FILE (not
// a directory) is still reported as a conflict above (existsSync doesn't
// care about the type) — this covers what happens once the user confirms
// past it, which used to reach the VAULT_SUBDIRS mkdir loop and blow up with
// a raw EEXIST after wiki/workspace/templates were already created.
describe('generateVault — .aecpilot occupied by a file, confirmed', () => {
  it('throws a clear error before creating anything, leaving the file untouched', () => {
    const vaultPath = makeTempDir('aecpilot-vault-aecpilot-is-file-')
    try {
      fs.writeFileSync(path.join(vaultPath, '.aecpilot'), 'not a directory')

      expect(() =>
        generateVault({
          vaultPath,
          projectName: 'Объект-X',
          agentsTemplate: AGENTS_TEMPLATE,
          nowIso: NOW_ISO,
          confirmed: true
        })
      ).toThrow(/\.aecpilot is occupied by a file/)

      expect(fs.readdirSync(vaultPath)).toEqual(['.aecpilot'])
      expect(fs.readFileSync(path.join(vaultPath, '.aecpilot'), 'utf-8')).toBe('not a directory')
      for (const dir of ['wiki', 'workspace', 'templates']) {
        expect(fs.existsSync(path.join(vaultPath, dir))).toBe(false)
      }
    } finally {
      fs.rmSync(vaultPath, { recursive: true, force: true })
    }
  })
})

describe('generateVault — already an AECPilot project', () => {
  it('returns already-project and writes nothing', () => {
    const vaultPath = makeTempDir('aecpilot-vault-already-project-')
    try {
      generateVault({
        vaultPath,
        projectName: 'Объект-X',
        agentsTemplate: AGENTS_TEMPLATE,
        nowIso: NOW_ISO
      })
      const before = fs.readFileSync(path.join(vaultPath, '.aecpilot', 'project.json'), 'utf-8')

      const result = generateVault({
        vaultPath,
        projectName: 'Другое имя',
        agentsTemplate: AGENTS_TEMPLATE,
        nowIso: '2026-07-15T00:00:00.000Z'
      })

      expect(result).toEqual({ ok: false, reason: 'already-project' })
      const after = fs.readFileSync(path.join(vaultPath, '.aecpilot', 'project.json'), 'utf-8')
      expect(after).toBe(before)
    } finally {
      fs.rmSync(vaultPath, { recursive: true, force: true })
    }
  })
})

// Review fix-iteration 1 (minor 3, accepted as-is): retrying after a
// partial-init failure (our own half-written AGENTS.md/wiki/, no
// project.json yet) reports a `needs-confirm` conflict — a false positive
// (it's not a genuine user file, but generateVault can't tell the
// difference), but a safe one: once confirmed, it must complete idempotently
// rather than erroring or clobbering what's already there.
describe('generateVault — retry after a partial init (our own leftovers), confirmed', () => {
  it('fills in only what is still missing, leaving the partial leftovers untouched', () => {
    const vaultPath = makeTempDir('aecpilot-vault-partial-retry-')
    try {
      fs.mkdirSync(path.join(vaultPath, 'wiki'))
      fs.writeFileSync(path.join(vaultPath, 'wiki', 'note.md'), 'left over from a prior attempt')
      fs.writeFileSync(path.join(vaultPath, 'AGENTS.md'), '# AGENTS.md — Объект-X\n')

      const result = generateVault({
        vaultPath,
        projectName: 'Объект-X',
        agentsTemplate: AGENTS_TEMPLATE,
        nowIso: NOW_ISO,
        confirmed: true
      })

      expect(result).toEqual({ ok: true })
      // The partial leftovers are untouched...
      expect(fs.readFileSync(path.join(vaultPath, 'wiki', 'note.md'), 'utf-8')).toBe(
        'left over from a prior attempt'
      )
      expect(fs.readFileSync(path.join(vaultPath, 'AGENTS.md'), 'utf-8')).toBe(
        '# AGENTS.md — Объект-X\n'
      )
      // ...and everything that was still missing is filled in.
      for (const dir of ['workspace', 'templates', '.aecpilot', '.aecpilot/logs']) {
        expect(fs.statSync(path.join(vaultPath, dir)).isDirectory()).toBe(true)
      }
      expect(
        validateProjectConfig(
          JSON.parse(fs.readFileSync(path.join(vaultPath, '.aecpilot', 'project.json'), 'utf-8'))
        ).ok
      ).toBe(true)
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

describe('generateVault — partial-state cleanup into a directory that already existed', () => {
  // Task 4D-12. The case the test above does not cover: the user picked a
  // folder that was already there, so the folder itself must survive — but
  // nothing this call put inside it may. Before the rollback, a failed init
  // left `wiki/`, `workspace/` and `templates/` behind, and the retry met them
  // as "the folder is not empty" — the user confirming a conflict with our own
  // crash.
  function runFailingInit(vaultPath: string): void {
    const writeFileSyncMock = vi.mocked(fs.writeFileSync)
    const realWriteFileSync = writeFileSyncMock.getMockImplementation()!
    let callCount = 0
    writeFileSyncMock.mockImplementation((...args: Parameters<typeof fs.writeFileSync>) => {
      callCount++
      // 1: AGENTS.md, 2: the checkpoint marker, 3: project.json — fail the last
      // one, so everything before it is already on disk.
      if (callCount === 3) throw new Error('simulated write failure')
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
    } finally {
      writeFileSyncMock.mockImplementation(realWriteFileSync)
      writeFileSyncMock.mockClear()
    }
  }

  it('leaves an empty pre-existing directory exactly as empty as it found it', () => {
    const vaultPath = makeTempDir('aecpilot-vault-rollback-')
    try {
      runFailingInit(vaultPath)

      expect(fs.existsSync(vaultPath)).toBe(true)
      expect(fs.readdirSync(vaultPath)).toEqual([])
    } finally {
      fs.rmSync(vaultPath, { recursive: true, force: true })
    }
  })

  it('keeps the user files and removes only what it created', () => {
    const vaultPath = makeTempDir('aecpilot-vault-rollback-own-')
    try {
      fs.mkdirSync(path.join(vaultPath, 'мои-чертежи'))
      fs.writeFileSync(path.join(vaultPath, 'смета.txt'), 'моё', 'utf-8')

      runFailingInit(vaultPath)

      expect(fs.readdirSync(vaultPath).sort()).toEqual(['мои-чертежи', 'смета.txt'])
      expect(fs.readFileSync(path.join(vaultPath, 'смета.txt'), 'utf-8')).toBe('моё')
    } finally {
      fs.rmSync(vaultPath, { recursive: true, force: true })
    }
  })

  it('never removes a folder of the user that shares our name', () => {
    // The guard that makes the rollback safe: only paths this call BROUGHT
    // INTO EXISTENCE are removed. A `wiki/` the user already kept — with their
    // own file in it — is not ours to delete, even though we would have
    // created one by that name.
    const vaultPath = makeTempDir('aecpilot-vault-rollback-name-')
    try {
      fs.mkdirSync(path.join(vaultPath, 'wiki'))
      fs.writeFileSync(path.join(vaultPath, 'wiki', 'моя-страница.md'), 'моё', 'utf-8')

      runFailingInit(vaultPath)

      expect(fs.existsSync(path.join(vaultPath, 'wiki', 'моя-страница.md'))).toBe(true)
      expect(fs.existsSync(path.join(vaultPath, 'workspace'))).toBe(false)
    } finally {
      fs.rmSync(vaultPath, { recursive: true, force: true })
    }
  })

  it('lets the retry through without asking about a conflict we caused', () => {
    // The user-visible point of the whole task: run once, fail, run again —
    // and the second run just works instead of reporting `needs-confirm`
    // against our own leftovers.
    const vaultPath = makeTempDir('aecpilot-vault-rollback-retry-')
    try {
      runFailingInit(vaultPath)

      const retry = generateVault({
        vaultPath,
        projectName: 'Объект-X',
        agentsTemplate: AGENTS_TEMPLATE,
        nowIso: NOW_ISO
      })

      expect(retry).toEqual({ ok: true })
      expect(fs.existsSync(path.join(vaultPath, '.aecpilot', 'project.json'))).toBe(true)
    } finally {
      fs.rmSync(vaultPath, { recursive: true, force: true })
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

describe('ensureCheckpointMarker (задача 1.6.C1)', () => {
  function tempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'aec-marker-'))
  }

  it('кладёт маркер в новый vault', () => {
    const dir = tempDir()
    try {
      generateVault({
        vaultPath: path.join(dir, 'v'),
        projectName: 'П',
        agentsTemplate: '# {{PROJECT_NAME}}'
      })
      expect(fs.existsSync(path.join(dir, 'v', 'Makefile'))).toBe(true)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('объясняет в самом файле, зачем он нужен — иначе он выглядит мусором', () => {
    const dir = tempDir()
    try {
      ensureCheckpointMarker(dir)
      const text = fs.readFileSync(path.join(dir, 'Makefile'), 'utf-8')
      expect(text).toMatch(/снимк/i)
      expect(text).toMatch(/AECPilot/)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  // Второй маркер ничего не добавил бы: поиск ядра и так останавливается на
  // этой папке. А перезапись чужого файла была бы порчей данных пользователя.
  it('не трогает папку, где уже есть любой из девяти маркеров', () => {
    for (const marker of ['package.json', '.git', 'Cargo.toml', 'Gemfile']) {
      const dir = tempDir()
      try {
        if (marker === '.git') fs.mkdirSync(path.join(dir, marker))
        else fs.writeFileSync(path.join(dir, marker), 'чужое содержимое')

        expect(ensureCheckpointMarker(dir)).toBe(false)
        expect(fs.existsSync(path.join(dir, 'Makefile'))).toBe(false)
        if (marker !== '.git') {
          expect(fs.readFileSync(path.join(dir, marker), 'utf-8')).toBe('чужое содержимое')
        }
      } finally {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    }
  })

  it('не перезаписывает свой же маркер при повторном вызове', () => {
    const dir = tempDir()
    try {
      expect(ensureCheckpointMarker(dir)).toBe(true)
      fs.writeFileSync(path.join(dir, 'Makefile'), 'правка пользователя')
      expect(ensureCheckpointMarker(dir)).toBe(false)
      expect(fs.readFileSync(path.join(dir, 'Makefile'), 'utf-8')).toBe('правка пользователя')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
