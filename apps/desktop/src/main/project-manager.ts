// Project-creation/-opening logic for tasks 1.3/1.4: validates the project
// name, reads the AGENTS.md template, and generates the vault via task 1.2's
// generateVault (createProject); reads and validates an existing vault's
// project.json (openProject). Task 1.5.4 generalized both for Obsidian-style
// init: createProject now allows a non-empty target directory (delegating the
// "only fill in what's missing" / naming-conflict logic to generateVault),
// and openProject tells apart "not a project yet" (needsInit) from a genuine
// error. Deliberately free of any `electron` import (dialog/BrowserWindow/app
// stay in main/index.ts and recents.ts) so this can be unit-tested directly,
// the same way task 1.2's vault-generator.ts is.

import {
  accessSync,
  existsSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { basename, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { generateVault, type VaultConflict } from '../project/vault-generator'
import {
  type ProjectConfig,
  type ProjectSettings,
  type ProjectSource,
  validateProjectConfig
} from '../project/project-config'
import { validateNewSource } from '../project/source-validation'
import { buildSourceTree, isSourceAvailable, type SourceTreeNode } from './source-tree'

export interface OpenProject {
  name: string
  vaultPath: string
}

// Task 1.5.4: `createProject` and `openProject` used to share one
// `ProjectResult` type (`{ ok: true; project } | { ok: false; error }`) —
// they now each add their own extra outcome (a naming-conflict confirm for
// create, a not-yet-a-project signal for open), so they're split into two
// types that both extend that original shape.
export type CreateProjectResult =
  | { ok: true; project: OpenProject }
  | { ok: false; error: string }
  /** The target directory already has its own `AGENTS.md` and/or
   * `.aecpilot` (see `VaultConflict`) — nothing was written. Re-invoke with
   * `{ confirmed: true }` to initialize anyway (same two-step confirm shape
   * as `addSourceToProject`'s `needsConfirm`). */
  | { needsConfirm: string[] }

export type OpenProjectResult =
  | { ok: true; project: OpenProject }
  | { ok: false; error: string }
  /** `vaultPath` exists but has no `.aecpilot/project.json` yet — not an
   * error: Obsidian-style, any folder can become a project. The caller
   * should prompt for a project name (`suggestedName` is the folder's own
   * name, offered as a default) and call `createProject` on the same path. */
  | { needsInit: true; suggestedName: string }

/** Plain-language text for each `VaultConflict` `generateVault` can report
 * (task 1.5.4) — kept here, not in vault-generator.ts, same split as
 * `mapGenerateVaultError` below (Russian UI strings live in this file). */
const VAULT_CONFLICT_MESSAGES: Record<VaultConflict, string> = {
  'agents-md':
    'В папке уже есть свой файл AGENTS.md — он останется без изменений, будет добавлена только недостающая структура vault',
  aecpilot:
    'В папке уже есть папка или файл «.aecpilot», не относящиеся к этому проекту — они останутся без изменений'
}

/** Maps `generateVault`'s (English, exception-message) errors to
 * Russian, UI-friendly text for the case a user picking a folder from the
 * create-project dialog is actually likely to hit; anything else
 * (write/permission failures, …) is passed through with a generic prefix
 * rather than silently swallowed. */
function mapGenerateVaultError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('vault target path is a file, not a directory')) {
    return 'Указанный путь — файл, а не папка'
  }
  // Review fix-iteration 1 (minor 2): only reachable once the user has
  // already confirmed past a `.aecpilot` naming conflict — see
  // createMissingVaultEntries's up-front check in vault-generator.ts.
  if (message.includes('.aecpilot is occupied by a file')) {
    return '«.aecpilot» занят файлом — переместите или переименуйте его, чтобы продолжить'
  }
  return `Не удалось создать проект: ${message}`
}

/** Creates a new vault at `dirPath` named `name` (trimmed), reading the
 * AGENTS.md template from `agentsTemplatePath`. `dirPath` may be empty,
 * non-existent, or (task 1.5.4, Obsidian-style init) a non-empty directory
 * the user already has files in — `generateVault` only creates whatever
 * structure is missing there. Never throws — every failure (blank name,
 * unreadable template, an invalid `dirPath`) comes back as
 * `{ ok: false, error }` with a human-readable message suitable for display
 * in the create-project dialog. A directory that's already an AECPilot
 * project (has a `.aecpilot/project.json` file — its content is not
 * parsed/validated for this check) is also an `{ ok: false }`
 * error here — the caller should open it instead (`openProject`). A naming
 * conflict (the directory already has its own `AGENTS.md`/`.aecpilot`) comes
 * back as `{ needsConfirm }` unless `options.confirmed` is `true`. Does not
 * touch the recents list or "current project" state — the `project:create`
 * IPC handler in main/index.ts does both on success. */
export function createProject(
  dirPath: string,
  name: string,
  agentsTemplatePath: string,
  options?: { confirmed?: boolean }
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

  let vaultResult: ReturnType<typeof generateVault>
  try {
    vaultResult = generateVault({
      vaultPath: dirPath,
      projectName: trimmedName,
      agentsTemplate,
      confirmed: options?.confirmed
    })
  } catch (error: unknown) {
    return { ok: false, error: mapGenerateVaultError(error) }
  }

  if (!vaultResult.ok) {
    if (vaultResult.reason === 'already-project') {
      return {
        ok: false,
        error: 'Эта папка уже является проектом AECPilot — откройте её через «Открыть проект»'
      }
    }
    return { needsConfirm: vaultResult.conflicts.map((c) => VAULT_CONFLICT_MESSAGES[c]) }
  }

  return { ok: true, project: { name: trimmedName, vaultPath: dirPath } }
}

/** Opens an existing vault at `vaultPath`: reads `<vaultPath>/.aecpilot/
 * project.json`, parses it, and validates it against the schema (task 1.1's
 * `validateProjectConfig`) — the project's `name` comes from the config, not
 * from the folder name. Never throws — every failure comes back as
 * `{ ok: false, error }` with a Russian, human-readable message distinguishing
 * a missing/inaccessible folder, a corrupt file (invalid JSON), a
 * schema-invalid config (lists every validation error), and any other
 * unreadable-path case. A folder that exists but has no `.aecpilot/
 * project.json` yet is *not* an error (task 1.5.4, Obsidian-style init) —
 * comes back as `{ needsInit: true, suggestedName }` instead, so the caller
 * can offer to initialize a project there (`createProject`). Does not touch
 * the recents list or "current project" state — the `project:open` IPC
 * handler in main/index.ts does both on success. */
export function openProject(vaultPath: string): OpenProjectResult {
  if (!existsSync(vaultPath)) {
    return { ok: false, error: 'Папка не найдена' }
  }

  const configPath = join(vaultPath, '.aecpilot', 'project.json')

  let raw: string
  try {
    raw = readFileSync(configPath, 'utf-8')
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return { needsInit: true, suggestedName: basename(vaultPath) }
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

/** Reads the project's own settings block (task 1.6.B2.18/B2.19 — the
 * "Индексация" and "Эмбеддинги" sections). These belong to the PROJECT, not
 * to the app: a vault carries its wiki language, scan interval and embedding
 * model with it. */
export function getProjectSettings(vaultPath: string): ProjectSettings | undefined {
  const result = readProjectConfigFile(vaultPath)
  return result.ok ? result.config.settings : undefined
}

/** Writes back a subset of the project's settings, leaving everything else in
 * `project.json` (sources included) untouched. Validation is the same one the
 * file goes through on read, so an out-of-range interval is refused here
 * rather than producing a config the app will later reject as corrupt. */
export function updateProjectSettings(
  vaultPath: string,
  patch: Partial<ProjectSettings>
): { ok: true; settings: ProjectSettings } | { ok: false; error: string } {
  const result = readProjectConfigFile(vaultPath)
  if (!result.ok) return { ok: false, error: result.error }

  const settings: ProjectSettings = { ...result.config.settings, ...patch }
  if (settings.wiki_lang.trim() === '') {
    return { ok: false, error: 'Язык вики не может быть пустым' }
  }
  if (!Number.isFinite(settings.scan_interval_s) || settings.scan_interval_s <= 0) {
    return { ok: false, error: 'Интервал сканирования должен быть больше нуля' }
  }

  try {
    writeProjectConfigFile(vaultPath, { ...result.config, settings })
  } catch (error: unknown) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'не удалось записать project.json'
    }
  }
  return { ok: true, settings }
}

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
