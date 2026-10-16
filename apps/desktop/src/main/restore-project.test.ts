// Задача 3G.20 (D-89): последний проект открывается сам при запуске.

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { generateVault } from '../project/vault-generator'
import type { OpenProject } from './project-manager'
import { restoreLastProject } from './restore-project'

const made: string[] = []

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aec-restore-'))
  made.push(dir)
  return dir
}

function recent(vaultPath: string) {
  return { name: 'Объект', vaultPath, openedAt: '2026-09-28T00:00:00.000Z' }
}

afterEach(() => {
  for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('restoreLastProject', () => {
  it('opens the most recent live project through the same activation as project:open', async () => {
    const vaultPath = path.join(tempDir(), 'vault')
    generateVault({ vaultPath, projectName: 'Объект', agentsTemplate: '# {{PROJECT_NAME}}' })
    const activate = vi.fn(async (_project: OpenProject) => {})

    const outcome = await restoreLastProject(
      [recent(vaultPath), recent(path.join(tempDir(), 'older'))],
      activate
    )

    expect(outcome).toBe('restored')
    expect(activate).toHaveBeenCalledTimes(1)
    expect(activate.mock.calls[0][0].vaultPath).toBe(vaultPath)
  })

  it('stays on the chooser silently when the folder is gone', async () => {
    const activate = vi.fn(async () => {})

    const outcome = await restoreLastProject([recent(path.join(tempDir(), 'нет-такой'))], activate)

    expect(outcome).toBe('unavailable')
    expect(activate).not.toHaveBeenCalled()
  })

  it('stays on the chooser when project.json is broken or missing', async () => {
    const broken = tempDir()
    fs.mkdirSync(path.join(broken, '.aecpilot'))
    fs.writeFileSync(path.join(broken, '.aecpilot', 'project.json'), '{ не json')
    const bare = tempDir()
    const activate = vi.fn(async () => {})

    expect(await restoreLastProject([recent(broken)], activate)).toBe('unavailable')
    expect(await restoreLastProject([recent(bare)], activate)).toBe('unavailable')
    expect(activate).not.toHaveBeenCalled()
  })

  it('does nothing on a first start', async () => {
    const activate = vi.fn(async () => {})

    expect(await restoreLastProject([], activate)).toBe('none')
    expect(activate).not.toHaveBeenCalled()
  })
})
