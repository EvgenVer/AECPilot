// Project-creation logic for task 1.3: validates the project name, reads the
// AGENTS.md template, and generates the vault via task 1.2's generateVault.
// Deliberately free of any `electron` import (dialog/BrowserWindow/app stay
// in main/index.ts and recents.ts) so this can be unit-tested directly, the
// same way task 1.2's vault-generator.ts is.

import { readFileSync } from 'node:fs'
import { generateVault } from '../project/vault-generator'

export interface OpenProject {
  name: string
  vaultPath: string
}

export type CreateProjectResult = { ok: true; project: OpenProject } | { ok: false; error: string }

/** Maps `generateVault`'s (English, exception-message) errors to
 * Russian, UI-friendly text for the two cases a user picking a folder from
 * the create-project dialog is actually likely to hit; anything else
 * (write/permission failures, …) is passed through with a generic prefix
 * rather than silently swallowed. */
function mapGenerateVaultError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('vault target directory is not empty')) {
    return 'Папка не пуста — выберите пустую папку'
  }
  if (message.includes('vault target path is a file, not a directory')) {
    return 'Указанный путь — файл, а не папка'
  }
  return `Не удалось создать проект: ${message}`
}

/** Creates a new vault at `dirPath` named `name` (trimmed), reading the
 * AGENTS.md template from `agentsTemplatePath`. Never throws — every failure
 * (blank name, unreadable template, `generateVault` rejecting a non-empty or
 * otherwise invalid `dirPath`) comes back as `{ ok: false, error }` with a
 * human-readable message suitable for display in the create-project dialog.
 * Does not touch the recents list or "current project" state — the
 * `project:create` IPC handler in main/index.ts does both on success. */
export function createProject(
  dirPath: string,
  name: string,
  agentsTemplatePath: string
): CreateProjectResult {
  const trimmedName = name.trim()
  if (trimmedName.length === 0) {
    return { ok: false, error: 'название проекта не может быть пустым' }
  }

  let agentsTemplate: string
  try {
    agentsTemplate = readFileSync(agentsTemplatePath, 'utf-8')
  } catch (error: unknown) {
    return {
      ok: false,
      error: `не удалось прочитать шаблон AGENTS.md: ${
        error instanceof Error ? error.message : String(error)
      }`
    }
  }

  try {
    generateVault({ vaultPath: dirPath, projectName: trimmedName, agentsTemplate })
  } catch (error: unknown) {
    return { ok: false, error: mapGenerateVaultError(error) }
  }

  return { ok: true, project: { name: trimmedName, vaultPath: dirPath } }
}
