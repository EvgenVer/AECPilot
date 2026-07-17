// Project-creation/-opening logic for tasks 1.3/1.4: validates the project
// name, reads the AGENTS.md template, and generates the vault via task 1.2's
// generateVault (createProject); reads and validates an existing vault's
// project.json (openProject). Deliberately free of any `electron` import
// (dialog/BrowserWindow/app stay in main/index.ts and recents.ts) so this can
// be unit-tested directly, the same way task 1.2's vault-generator.ts is.

import { accessSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { generateVault } from '../project/vault-generator'
import {
  type ProjectConfig,
  type ProjectSource,
  validateProjectConfig
} from '../project/project-config'
import { validateNewSource } from '../project/source-validation'
import { buildSourceTree, isSourceAvailable, type SourceTreeNode } from './source-tree'

export interface OpenProject {
  name: string
  vaultPath: string
}

// Shared by both createProject (task 1.3) and openProject (task 1.4) —
// same shape either way: the resulting project or a human-readable error.
export type ProjectResult = { ok: true; project: OpenProject } | { ok: false; error: string }

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
): ProjectResult {
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

/** Opens an existing vault at `vaultPath`: reads `<vaultPath>/.aecpilot/
 * project.json`, parses it, and validates it against the schema (task 1.1's
 * `validateProjectConfig`) — the project's `name` comes from the config, not
 * from the folder name. Never throws — every failure comes back as
 * `{ ok: false, error }` with a Russian, human-readable message distinguishing
 * "not an AECPilot project" (no project.json), a corrupt file (invalid JSON),
 * a schema-invalid config (lists every validation error), and any other
 * unreadable-path case. Does not touch the recents list or "current project"
 * state — the `project:open` IPC handler in main/index.ts does both on
 * success. */
export function openProject(vaultPath: string): ProjectResult {
  const configPath = join(vaultPath, '.aecpilot', 'project.json')

  let raw: string
  try {
    raw = readFileSync(configPath, 'utf-8')
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return { ok: false, error: 'Папка не является проектом AECPilot' }
    }
    return {
      ok: false,
      error: `Папка недоступна: ${error instanceof Error ? error.message : String(error)}`
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'Файл .aecpilot/project.json повреждён (невалидный JSON)' }
  }

  const validated = validateProjectConfig(parsed)
  if (!validated.ok) {
    const details = validated.errors
      .map((e) => (e.path ? `${e.path}: ${e.message}` : e.message))
      .join('; ')
    return { ok: false, error: `Некорректный project.json: ${details}` }
  }

  return { ok: true, project: { name: validated.value.name, vaultPath } }
}

/** Reads and validates `<vaultPath>/.aecpilot/project.json`, returning the
 * full config (not just `name`/`vaultPath` like `openProject`'s result) —
 * needed by `addSourceToProject` to read/append `sources`. Duplicates
 * `openProject`'s read/parse/validate steps rather than sharing them, since
 * the two return different shapes and `openProject` is out of scope for this
 * task. */
function readProjectConfigFile(
  vaultPath: string
): { ok: true; config: ProjectConfig } | { ok: false; error: string } {
  const configPath = join(vaultPath, '.aecpilot', 'project.json')

  let raw: string
  try {
    raw = readFileSync(configPath, 'utf-8')
  } catch (error: unknown) {
    return {
      ok: false,
      error: `Папка недоступна: ${error instanceof Error ? error.message : String(error)}`
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'Файл .aecpilot/project.json повреждён (невалидный JSON)' }
  }

  const validated = validateProjectConfig(parsed)
  if (!validated.ok) {
    const details = validated.errors
      .map((e) => (e.path ? `${e.path}: ${e.message}` : e.message))
      .join('; ')
    return { ok: false, error: `Некорректный project.json: ${details}` }
  }

  return { ok: true, config: validated.value }
}

/** Writes `config` to `<vaultPath>/.aecpilot/project.json` atomically
 * (write to a temp file, then rename over the original) — same 2-space
 * indent + trailing newline as `generateVault`. */
function writeProjectConfigFile(vaultPath: string, config: ProjectConfig): void {
  const configPath = join(vaultPath, '.aecpilot', 'project.json')
  const tempPath = `${configPath}.tmp-${randomUUID()}`
  writeFileSync(tempPath, `${JSON.stringify(config, null, 2)}\n`)
  try {
    renameSync(tempPath, configPath)
  } catch (error: unknown) {
    unlinkSync(tempPath)
    throw error
  }
}

/** Lists a project's connected sources by reading `project.json` (task 1.7,
 * backs the `sources:list` IPC handler). Returns an empty array if the vault
 * or its config can't be read/validated — a renamed or broken vault must
 * never crash the sidebar. */
export function listProjectSources(vaultPath: string): ProjectSource[] {
  const result = readProjectConfigFile(vaultPath)
  return result.ok ? result.config.sources : []
}

// specs/workspace-sources.md § Data schemas: settings.scan_interval_s
// default. Only used as a fallback if project.json can't be read right after
// it was just opened/created — the schema itself requires the field once the
// config parses at all (project-config.ts's validateSettings).
const DEFAULT_SCAN_INTERVAL_S = 300

/** Reads a project's configured scan interval (task 1.14, backs the scan
 * scheduler's `start`/`restart` on project open/create). Falls back to
 * `DEFAULT_SCAN_INTERVAL_S` if `project.json` can't be read/validated. */
export function getScanIntervalSeconds(vaultPath: string): number {
  const result = readProjectConfigFile(vaultPath)
  return result.ok ? result.config.settings.scan_interval_s : DEFAULT_SCAN_INTERVAL_S
}

function findSourceById(vaultPath: string, sourceId: string): ProjectSource | undefined {
  return listProjectSources(vaultPath).find((s) => s.id === sourceId)
}

export type SourceStatusResult =
  { ok: true; status: 'ok' | 'unavailable' } | { ok: false; error: string }

/** Resolves `sourceId` against the project's connected sources and checks
 * whether its root is currently reachable (task 1.8 fix-iteration 1, backs
 * the `sources:status` IPC handler) — cheap (`isSourceAvailable` only, no
 * directory read), so the sidebar can show every connected source's "RO"/
 * "недоступен" badge right away on load, one IPC call per source, without
 * paying for a full recursive tree build per source just to render badges.
 * An unknown `sourceId` comes back as `{ ok: false }`. */
export function getSourceStatusResult(vaultPath: string, sourceId: string): SourceStatusResult {
  const source = findSourceById(vaultPath, sourceId)
  if (!source) return { ok: false, error: 'Источник не найден' }
  return { ok: true, status: isSourceAvailable(source.root_path) ? 'ok' : 'unavailable' }
}

export type SourceTreeResult =
  | { ok: true; status: 'ok'; tree: SourceTreeNode[] }
  | { ok: true; status: 'unavailable' }
  | { ok: false; error: string }

/** Resolves `sourceId` against the project's connected sources and builds its
 * file tree (task 1.8, backs the `sources:tree` IPC handler) — read-only,
 * never mutates anything. An unknown `sourceId` comes back as
 * `{ ok: false }`; an inaccessible root (path gone, network share dropped,
 * permission revoked, …) — whether caught up front by `isSourceAvailable` or
 * surfacing only once `buildSourceTree` actually reads it — is reported as
 * `{ ok: true, status: 'unavailable' }`, never thrown, so one bad source
 * never blocks the others (specs/workspace-sources.md's "Недоступный
 * источник"). */
export function getSourceTreeResult(vaultPath: string, sourceId: string): SourceTreeResult {
  const source = findSourceById(vaultPath, sourceId)
  if (!source) return { ok: false, error: 'Источник не найден' }

  if (!isSourceAvailable(source.root_path)) {
    return { ok: true, status: 'unavailable' }
  }

  try {
    return { ok: true, status: 'ok', tree: buildSourceTree(source.root_path) }
  } catch (error: unknown) {
    console.error('aecpilot: could not build source tree', error)
    return { ok: true, status: 'unavailable' }
  }
}

export type AddSourceResult =
  | { ok: true; sources: ProjectSource[] }
  | { ok: false; errors: string[] }
  | { needsConfirm: string[] }

/** Adds `rootPath` as a new read-only source of the project at `vaultPath`
 * (task 1.7): reads `project.json`, validates the candidate against the
 * vault and existing sources (`validateNewSource` — nesting is an error,
 * overlap with an existing source is a warning), does a best-effort
 * accessibility check (an inaccessible path never blocks — it's added as a
 * warning that it "will be added as unavailable"), and — unless there are
 * unconfirmed warnings — appends the new source and writes the config back
 * atomically.
 *
 * - Any validation errors (nesting, exact duplicate, non-absolute path) ->
 *   `{ ok: false, errors }`, nothing written.
 * - Warnings (overlap and/or inaccessible-path) with `confirmed` not `true`
 *   -> `{ needsConfirm: warnings }`, nothing written yet — the caller should
 *   re-invoke with `confirmed: true` to proceed.
 * - Otherwise -> the source is added, `project.json` is re-validated
 *   (`validateProjectConfig`) as a safety net before writing, and the
 *   updated `sources` list is returned. */
export function addSourceToProject(
  vaultPath: string,
  rootPath: string,
  options?: { confirmed?: boolean; nowIso?: string; idFactory?: () => string }
): AddSourceResult {
  const configResult = readProjectConfigFile(vaultPath)
  if (!configResult.ok) return { ok: false, errors: [configResult.error] }
  const config = configResult.config

  const validation = validateNewSource({
    vaultPath,
    existingRoots: config.sources,
    candidatePath: rootPath
  })
  if (!validation.ok) return { ok: false, errors: validation.errors }

  const warnings = [...validation.warnings]
  try {
    accessSync(rootPath)
  } catch {
    warnings.push('Путь сейчас недоступен — источник будет добавлен как недоступный')
  }

  if (warnings.length > 0 && !options?.confirmed) {
    return { needsConfirm: warnings }
  }

  const newSource: ProjectSource = {
    id: options?.idFactory?.() ?? randomUUID(),
    root_path: rootPath,
    added_at: options?.nowIso ?? new Date().toISOString()
  }
  const updatedConfig: ProjectConfig = { ...config, sources: [...config.sources, newSource] }

  const revalidated = validateProjectConfig(updatedConfig)
  if (!revalidated.ok) {
    const details = revalidated.errors
      .map((e) => (e.path ? `${e.path}: ${e.message}` : e.message))
      .join('; ')
    return { ok: false, errors: [`Некорректный project.json после добавления: ${details}`] }
  }

  // Fix-iteration 1 (review minor): a write failure (disk full, permission
  // denied, share dropped mid-write, …) must come back as a normal
  // `{ ok: false }` result — letting it throw here would surface as an
  // unhandled rejection in the renderer's `ipcRenderer.invoke` call.
  try {
    writeProjectConfigFile(vaultPath, updatedConfig)
  } catch (error: unknown) {
    return {
      ok: false,
      errors: [
        `Не удалось сохранить project.json: ${error instanceof Error ? error.message : String(error)}`
      ]
    }
  }

  return { ok: true, sources: updatedConfig.sources }
}

export type RemoveSourceResult =
  { ok: true; sources: ProjectSource[] } | { ok: false; error: string }

/** Disconnects `sourceId` from the project at `vaultPath` (task 1.16,
 * specs/workspace-sources.md's "Отключение источника"): removes its entry
 * from `project.json`, atomically, same write path as `addSourceToProject`.
 * `project.json` is the source of truth here — this function never touches
 * `index.db` or any file on disk; marking that source's index rows
 * `detached` is a separate, best-effort step the caller (the `sources:remove`
 * IPC handler in main/index.ts) takes afterwards via `aec-rag detach`, and a
 * failure there does not roll this back.
 *
 * An unknown `sourceId` or an unreadable/invalid `project.json` comes back
 * as `{ ok: false }` without writing anything. */
export function removeSourceFromProject(vaultPath: string, sourceId: string): RemoveSourceResult {
  const configResult = readProjectConfigFile(vaultPath)
  if (!configResult.ok) return { ok: false, error: configResult.error }
  const config = configResult.config

  if (!config.sources.some((s) => s.id === sourceId)) {
    return { ok: false, error: 'Источник не найден' }
  }

  const updatedConfig: ProjectConfig = {
    ...config,
    sources: config.sources.filter((s) => s.id !== sourceId)
  }

  try {
    writeProjectConfigFile(vaultPath, updatedConfig)
  } catch (error: unknown) {
    return {
      ok: false,
      error: `Не удалось сохранить project.json: ${error instanceof Error ? error.message : String(error)}`
    }
  }

  return { ok: true, sources: updatedConfig.sources }
}
