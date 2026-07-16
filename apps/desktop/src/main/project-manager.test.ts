// Unit tests for task 1.3's createProject (validate name + read template +
// generateVault behind project:create) and task 1.4's openProject
// (read + validate an existing vault's project.json behind project:open).

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { validateProjectConfig } from '../project/project-config'
import { generateVault } from '../project/vault-generator'
import { createProject, openProject } from './project-manager'

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
