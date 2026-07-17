// Vault structure generator for task 1.2 — creates the on-disk skeleton of a
// new AECPilot vault (contract: specs/workspace-sources.md § Data schemas)
// and its starter files. Source-id generation and the source-add flow are
// out of scope here (task 1.7); `sources` is always written empty.

import * as fs from 'node:fs'
import * as path from 'node:path'
import { PROJECT_CONFIG_SCHEMA_VERSION, type ProjectConfig } from './project-config'

/** Subdirectories created directly under `vaultPath`. `.aecpilot/logs` is
 * created as a nested path (see `generateVault`) so it isn't listed twice. */
const VAULT_SUBDIRS = ['wiki', 'workspace', 'templates', '.aecpilot']

const PROJECT_NAME_PLACEHOLDER = '{{PROJECT_NAME}}'

export interface GenerateVaultOptions {
  vaultPath: string
  projectName: string
  /** Raw text of the `AGENTS.md` template (task 1.5 owns real content); every
   * occurrence of `{{PROJECT_NAME}}` is substituted with `projectName`. */
  agentsTemplate: string
  /** Injectable for tests; defaults to `new Date().toISOString()`. */
  nowIso?: string
}

/** Generates a new vault's directory structure and starter files
 * (`AGENTS.md`, `.aecpilot/project.json`) at `options.vaultPath`.
 *
 * - `projectName` must be non-empty (after trimming); a blank value throws
 *   before anything is created.
 * - If `vaultPath` doesn't exist, it's created recursively. If a later step
 *   (subdir/file creation) throws, that directory — created by this call —
 *   is removed recursively before the original error is re-thrown, leaving
 *   no trace.
 * - If `vaultPath` exists and is a file (not a directory), throws before
 *   writing anything.
 * - If `vaultPath` exists and is a non-empty directory, throws before
 *   writing anything.
 * - If `vaultPath` exists and is an empty directory, it's generated into
 *   directly. Because this directory pre-dates the call, it is *not*
 *   removed on failure — if a later step throws, it may be left holding
 *   partial contents (some subdirs/files written, others not); the
 *   original error is still re-thrown.
 */
export function generateVault(options: GenerateVaultOptions): void {
  const { vaultPath, projectName, agentsTemplate, nowIso } = options

  if (projectName.trim().length === 0) {
    throw new Error('projectName must be a non-empty string')
  }

  let createdVaultDir = false
  if (fs.existsSync(vaultPath)) {
    if (!fs.statSync(vaultPath).isDirectory()) {
      throw new Error(`vault target path is a file, not a directory: ${vaultPath}`)
    }
    const existingEntries = fs.readdirSync(vaultPath)
    if (existingEntries.length > 0) {
      throw new Error(`vault target directory is not empty: ${vaultPath}`)
    }
  } else {
    fs.mkdirSync(vaultPath, { recursive: true })
    createdVaultDir = true
  }

  try {
    for (const subdir of VAULT_SUBDIRS) {
      fs.mkdirSync(path.join(vaultPath, subdir), { recursive: true })
    }
    fs.mkdirSync(path.join(vaultPath, '.aecpilot', 'logs'), { recursive: true })

    const agentsContent = agentsTemplate.split(PROJECT_NAME_PLACEHOLDER).join(projectName)
    fs.writeFileSync(path.join(vaultPath, 'AGENTS.md'), agentsContent)

    const projectConfig: ProjectConfig = {
      schema_version: PROJECT_CONFIG_SCHEMA_VERSION,
      name: projectName,
      created_at: nowIso ?? new Date().toISOString(),
      sources: [],
      settings: { wiki_lang: 'auto', scan_interval_s: 300, embedding_model: '' }
    }
    fs.writeFileSync(
      path.join(vaultPath, '.aecpilot', 'project.json'),
      `${JSON.stringify(projectConfig, null, 2)}\n`
    )
  } catch (err) {
    if (createdVaultDir) {
      fs.rmSync(vaultPath, { recursive: true, force: true })
    }
    throw err
  }
}
