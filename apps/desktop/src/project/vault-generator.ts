// Vault structure generator for task 1.2 — creates the on-disk skeleton of a
// new AECPilot vault (contract: specs/workspace-sources.md § Data schemas)
// and its starter files. Task 1.5.4 generalized `generateVault` to also
// initialize a vault inside a directory the user already has files in
// (Obsidian-style): only the missing pieces are created, existing files are
// never touched, and a service-name clash (the folder already has its own
// AGENTS.md and/or .aecpilot) comes back as a `needs-confirm` result instead
// of writing anything. Source-id generation and the source-add flow are out
// of scope here (task 1.7); `sources` is always written empty.

import * as fs from 'node:fs'
import * as path from 'node:path'
import { PROJECT_CONFIG_SCHEMA_VERSION, type ProjectConfig } from './project-config'

/** Subdirectories created directly under `vaultPath`. `.aecpilot/logs` is
 * created as a nested path (see `createMissingVaultEntries`) so it isn't
 * listed twice. */
const VAULT_SUBDIRS = ['wiki', 'workspace', 'templates', '.aecpilot']

const PROJECT_NAME_PLACEHOLDER = '{{PROJECT_NAME}}'

/** Checkpoint marker (task 1.6.C1, owner decision 2026-07-31).
 *
 * hermes decides which directory a snapshot covers by walking UP from the
 * edited file until it finds one of nine hard-coded markers — `.git`,
 * `pyproject.toml`, `package.json`, `Cargo.toml`, `go.mod`, `Makefile`,
 * `pom.xml`, `.hg`, `Gemfile` (`CheckpointManager.get_working_dir_for_path`).
 * There is no way to override that list. A vault with no marker sends the
 * search past its own root; on a machine whose home directory has a `.git`
 * (measured on the owner's), the search lands there and hermes's own
 * "too broad" guard then refuses the snapshot ENTIRELY and silently — so
 * rollback does not merely look empty, it never records anything.
 *
 * `Makefile` is the one chosen out of the nine because it is inert: no
 * package manager, editor or language server scans for it and acts on its
 * own, and `make` only ever runs when invoked deliberately. `package.json`
 * and `pyproject.toml` would make Node/Python tooling treat a notes vault as
 * a code project; `.git`/`.hg` would mean fabricating a repository the user
 * did not ask for. The file explains itself so nobody has to guess later. */
const CHECKPOINT_MARKER_FILE = 'Makefile'

const CHECKPOINT_MARKER_CONTENT = `# Технический файл AECPilot — не сборка проекта.
#
# Он существует ради снимков файлов (откат изменений агента). Ядро hermes
# определяет, для какой папки делать снимок, поднимаясь вверх до первого из
# девяти маркеров; Makefile — один из них, и самый безобидный: его никто не
# запускает сам по себе.
#
# Без этого файла снимки уходят в вышестоящую папку либо не делаются вовсе —
# молча. Удалить его можно; ценой будет неработающий откат.

.PHONY: help
help:
\t@echo "Это не проект сборки. Файл нужен AECPilot для снимков файлов."
`

export interface GenerateVaultOptions {
  vaultPath: string
  projectName: string
  /** Raw text of the `AGENTS.md` template (task 1.5 owns real content); every
   * occurrence of `{{PROJECT_NAME}}` is substituted with `projectName`. Only
   * used when `vaultPath` doesn't already have its own `AGENTS.md` — see
   * `GenerateVaultResult`. */
  agentsTemplate: string
  /** Injectable for tests; defaults to `new Date().toISOString()`. Only used
   * when `vaultPath` doesn't already have a `.aecpilot/project.json`. */
  nowIso?: string
  /** Must be `true` to proceed past a `needs-confirm` naming conflict (task
   * 1.5.4). Ignored in every other case. */
  confirmed?: boolean
}

/** Which service name(s) `generateVault` found already occupied by something
 * it didn't create itself (task 1.5.4) — turning these into a plain-language
 * message is project-manager.ts's job (`createProject`'s
 * `VAULT_CONFLICT_MESSAGES`), same split as `mapGenerateVaultError` there. */
export type VaultConflict = 'agents-md' | 'aecpilot'

export type GenerateVaultResult =
  | { ok: true }
  /** `vaultPath` already has a `.aecpilot/project.json` file — it's already
   * an AECPilot project (its content is not parsed/validated here — see
   * `hasProjectJsonFile`); nothing was written. The caller should open it
   * (project-manager.ts's `openProject`), not (re-)create it. */
  | { ok: false; reason: 'already-project' }
  /** `vaultPath` is a non-empty directory that isn't already a project, but
   * already has its own `AGENTS.md` and/or `.aecpilot` (not ours — no
   * `project.json` file inside). Nothing was written; re-invoke with
   * `confirmed: true` to initialize anyway — the existing AGENTS.md/.aecpilot
   * are left exactly as they are, only the missing structure is added around
   * them. */
  | { ok: false; reason: 'needs-confirm'; conflicts: VaultConflict[] }

/** Whether `aecpilotDir` has a `project.json` file directly inside it —
 * existence only, content is *not* parsed/validated here (review fix-
 * iteration 1, minor 1). Any `.aecpilot/project.json` file, however broken
 * or schema-invalid its content, means "this is already a project" as far as
 * `generateVault` is concerned — it is NEVER clobbered or regenerated by this
 * module. Recovering a corrupt one is a deliberate, manual, out-of-band
 * action; `openProject` (project-manager.ts) is where a broken/invalid
 * config actually surfaces to the user, with its own clear errors. */
function hasProjectJsonFile(aecpilotDir: string): boolean {
  const projectJsonPath = path.join(aecpilotDir, 'project.json')
  return fs.existsSync(projectJsonPath) && fs.statSync(projectJsonPath).isFile()
}

/** Creates whichever of `wiki/`, `workspace/`, `templates/`, `.aecpilot/` and
 * `.aecpilot/logs/` don't already exist, and writes `AGENTS.md`/
 * `.aecpilot/project.json` only if they don't already exist — an existing
 * file is never overwritten. For a brand-new or empty `vaultPath` every one
 * of these is missing, so this is exactly task 1.2's original full
 * generation; for an Obsidian-style init (task 1.5.4) into a directory that
 * already has some of its own files, only the gaps get filled in. */
function createMissingVaultEntries(
  vaultPath: string,
  projectName: string,
  agentsTemplate: string,
  nowIso: string | undefined,
  /** Task 4D-12: every path this call brings into existence, appended as it
   * goes. Passed in rather than returned because the caller needs it most
   * precisely when this function throws and returns nothing. */
  created: string[]
): void {
  // Review fix-iteration 1 (minor 2): checked up front, before any write —
  // `.aecpilot` occupied by a plain file (not a directory) would otherwise
  // only surface once the VAULT_SUBDIRS loop below reaches it, as a raw
  // EEXIST from mkdirSync, after wiki/workspace/templates were already
  // created (and, for a pre-existing non-empty vaultPath, never rolled back
  // — see generateVault's doc comment).
  const aecpilotPath = path.join(vaultPath, '.aecpilot')
  if (fs.existsSync(aecpilotPath) && !fs.statSync(aecpilotPath).isDirectory()) {
    throw new Error(`.aecpilot is occupied by a file, not a directory: ${aecpilotPath}`)
  }

  for (const subdir of VAULT_SUBDIRS) {
    const dir = path.join(vaultPath, subdir)
    if (!fs.existsSync(dir)) created.push(dir)
    fs.mkdirSync(dir, { recursive: true })
  }
  const logsDir = path.join(vaultPath, '.aecpilot', 'logs')
  if (!fs.existsSync(logsDir)) created.push(logsDir)
  fs.mkdirSync(logsDir, { recursive: true })

  const agentsPath = path.join(vaultPath, 'AGENTS.md')
  if (!fs.existsSync(agentsPath)) {
    const agentsContent = agentsTemplate.split(PROJECT_NAME_PLACEHOLDER).join(projectName)
    created.push(agentsPath)
    fs.writeFileSync(agentsPath, agentsContent)
  }

  if (ensureCheckpointMarker(vaultPath)) {
    created.push(path.join(vaultPath, CHECKPOINT_MARKER_FILE))
  }

  const projectJsonPath = path.join(vaultPath, '.aecpilot', 'project.json')
  if (!fs.existsSync(projectJsonPath)) {
    created.push(projectJsonPath)
    const projectConfig: ProjectConfig = {
      schema_version: PROJECT_CONFIG_SCHEMA_VERSION,
      name: projectName,
      created_at: nowIso ?? new Date().toISOString(),
      sources: [],
      settings: {
        wiki_lang: 'auto',
        scan_interval_s: 300,
        embedding_model: '',
        // Empty, not 'Russian' (task 5.14): the default belongs to the reader
        // that acts on it — `aec_rag.rag_index.EXTRACTION_LANGUAGE` — and
        // writing a copy here would fork it the first time that one changes.
        extraction_language: ''
      }
    }
    fs.writeFileSync(projectJsonPath, `${JSON.stringify(projectConfig, null, 2)}\n`)
  }
}

/** Task 4D-12: undoes a half-written init into a directory that already
 * existed. Before this, a write that failed partway (disk full, antivirus,
 * revoked permission) left `wiki/`, `workspace/` and friends behind — and the
 * next attempt met them as "the folder is not empty" and asked the user to
 * confirm a conflict with their own earlier failure. Either the project is
 * there whole or it is not there at all.
 *
 * Safe by construction: the list only ever holds paths the failed call itself
 * brought into existence — anything that was already there was never added,
 * so nothing of the user's can be reached from here. Removal goes newest
 * first, so a directory is removed after whatever we put inside it; `force`
 * makes a child that its parent already took with it a no-op. A failure to
 * clean up is swallowed: the caller is already re-throwing the real error,
 * and burying it under a rollback error would hide the actual cause. */
function rollback(created: string[]): void {
  for (const target of [...created].reverse()) {
    try {
      fs.rmSync(target, { force: true, recursive: true })
    } catch {
      // Best-effort; the original failure is the one worth reporting.
    }
  }
}

/** Makes sure the vault root carries a checkpoint marker (task 1.6.C1).
 *
 * Returns true when it wrote one. Never overwrites: if ANY of the nine markers
 * is already there — the user's own `package.json`, a real `.git`, or our
 * `Makefile` from a previous run — nothing happens, because the search already
 * stops at this directory and a second marker would add nothing.
 *
 * Called on vault creation and on every project open (`openProject`), so a
 * vault created before this task gains the marker the first time it is opened
 * rather than staying silently unprotected. */
export function ensureCheckpointMarker(vaultPath: string): boolean {
  const existing = [
    '.git',
    'pyproject.toml',
    'package.json',
    'Cargo.toml',
    'go.mod',
    'Makefile',
    'pom.xml',
    '.hg',
    'Gemfile'
  ].some((marker) => fs.existsSync(path.join(vaultPath, marker)))
  if (existing) return false
  fs.writeFileSync(path.join(vaultPath, CHECKPOINT_MARKER_FILE), CHECKPOINT_MARKER_CONTENT)
  return true
}

/** Generates or completes a vault's directory structure and starter files
 * (`AGENTS.md`, `.aecpilot/project.json`) at `options.vaultPath`.
 *
 * - `projectName` must be non-empty (after trimming); a blank value throws
 *   before anything is created.
 * - If `vaultPath` doesn't exist, it's created recursively, then fully
 *   generated (task 1.2's original behavior).
 * - If `vaultPath` exists and is a file (not a directory), throws before
 *   writing anything.
 * - If `vaultPath` exists and is an empty directory, it's fully generated
 *   into directly — same as the non-existent case, just without the mkdir.
 * - If `vaultPath` exists and is a non-empty directory (task 1.5.4,
 *   Obsidian-style init): a `.aecpilot/project.json` file already there
 *   means it's already a project — returns `{ reason: 'already-project' }`,
 *   nothing written (its content is never parsed/validated here — see
 *   `hasProjectJsonFile`). Otherwise, an already-present `AGENTS.md` and/or
 *   `.aecpilot` (not a project — no `project.json` file inside) is a naming
 *   conflict — returns `{ reason: 'needs-confirm', conflicts }` unless
 *   `confirmed: true`. Once past that (no conflict, or confirmed), only the
 *   missing pieces are created — every existing file/folder of the user's is
 *   left untouched, including a conflicting AGENTS.md/.aecpilot itself.
 * - A write failure partway through leaves no trace either way (task 4D-12).
 *   A `vaultPath` this call created is removed recursively — the rollback
 *   task 1.2 established. A pre-existing `vaultPath` stays, but everything
 *   this call put inside it is removed (see `rollback`), so a retry meets the
 *   directory as it found it rather than as a conflict with our own failure.
 *   The original error is re-thrown in both cases.
 */
export function generateVault(options: GenerateVaultOptions): GenerateVaultResult {
  const { vaultPath, projectName, agentsTemplate, nowIso, confirmed } = options

  if (projectName.trim().length === 0) {
    throw new Error('projectName must be a non-empty string')
  }

  let createdVaultDir = false
  if (fs.existsSync(vaultPath)) {
    if (!fs.statSync(vaultPath).isDirectory()) {
      throw new Error(`vault target path is a file, not a directory: ${vaultPath}`)
    }

    const isNonEmpty = fs.readdirSync(vaultPath).length > 0
    if (isNonEmpty) {
      const aecpilotPath = path.join(vaultPath, '.aecpilot')
      if (fs.existsSync(aecpilotPath) && hasProjectJsonFile(aecpilotPath)) {
        return { ok: false, reason: 'already-project' }
      }

      // A conflict here means the user has their own AGENTS.md or .aecpilot,
      // and they get asked about it. It used to also mean "or WE left one
      // behind when an earlier init died partway" — indistinguishable from
      // the real thing, and a false alarm we shipped knowingly. Task 4D-12
      // removed the second case at the source: a failed init now rolls back
      // what it created, so a retry sees the directory as it found it. The
      // confirm below is once again only about the user's own files.
      const conflicts: VaultConflict[] = []
      if (fs.existsSync(path.join(vaultPath, 'AGENTS.md'))) conflicts.push('agents-md')
      if (fs.existsSync(aecpilotPath)) conflicts.push('aecpilot')
      if (conflicts.length > 0 && !confirmed) {
        return { ok: false, reason: 'needs-confirm', conflicts }
      }
    }
  } else {
    fs.mkdirSync(vaultPath, { recursive: true })
    createdVaultDir = true
  }

  const created: string[] = []
  try {
    createMissingVaultEntries(vaultPath, projectName, agentsTemplate, nowIso, created)
  } catch (err) {
    if (createdVaultDir) {
      fs.rmSync(vaultPath, { recursive: true, force: true })
    } else {
      rollback(created)
    }
    throw err
  }

  return { ok: true }
}
