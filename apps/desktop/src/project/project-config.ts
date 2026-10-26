// Schema + validator for <vault>/.aecpilot/project.json (task 1.1).
// Contract: docs/history/specs/workspace-sources.md § Data schemas. A hand-written
// structural validator is used on purpose — no ajv/schema-library dependency
// (coordinator decision) — kept in sync manually with project.schema.json,
// the documentation artifact next to this file.
//
// Generating ids/defaults and writing the file to disk are out of scope here
// (tasks 1.2/1.7); this module only defines the shape and validates it.

/** Current value of `schema_version`. A config whose `schema_version` isn't
 * exactly this number fails validation (no migration support yet). */
export const PROJECT_CONFIG_SCHEMA_VERSION = 1

export interface ProjectSource {
  id: string
  root_path: string
  added_at: string
  /** Имя источника в приложении (3J.5, SPEC UR44). Нет — имя конечной папки;
   *  папка на диске при переименовании не меняется. */
  label?: string
}

export interface ProjectSettings {
  /** `'auto'` or a language code (e.g. `'ru'`, `'en'`) — validated only as a
   * non-empty string, no fixed enum of codes. */
  wiki_lang: string
  scan_interval_s: number
  /** May be empty (no embedding model configured yet). */
  embedding_model: string
  /**
   * Language the graph names entities in — the third of SPEC G7's three levels
   * (task 5.14). NOT a code like `wiki_lang`: LightRAG takes the language as a
   * word it puts in a prompt (`addon_params.language`), so the values are
   * `'Russian'`, `'English'`, … and the Python side's default lives in
   * `aec_rag.rag_index.EXTRACTION_LANGUAGE`.
   *
   * Optional on the way in, always present on the way out: every vault created
   * before 5.14 lacks the field, and requiring it would declare all of them
   * corrupt. Empty means "not chosen yet" — exactly what `load_settings` on the
   * Python side already reads it as.
   */
  extraction_language: string
}

export interface ProjectConfig {
  schema_version: number
  name: string
  created_at: string
  sources: ProjectSource[]
  settings: ProjectSettings
}

export interface ProjectConfigValidationError {
  /** Dot/bracket path to the offending field, e.g. `'settings.wiki_lang'` or
   * `'sources[0].id'`; `''` for a top-level structural error. */
  path: string
  message: string
}

export type ValidateProjectConfigResult =
  { ok: true; value: ProjectConfig } | { ok: false; errors: ProjectConfigValidationError[] }

// Reasonably strict ISO-8601 timestamp check: full date + time + seconds,
// plus either a literal Z or a numeric UTC offset. Matches what
// `Date.prototype.toISOString()` produces (the expected source of
// `created_at`/`added_at` once 1.2/1.7 generate these).
const ISO_8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isIsoDateString(value: unknown): value is string {
  return typeof value === 'string' && ISO_8601_RE.test(value) && !Number.isNaN(Date.parse(value))
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Validates a `project.json` `sources[index]` entry, pushing every error
 * found (not just the first) onto `errors` with a `sources[index].field`
 * path. */
function validateSource(
  source: unknown,
  index: number,
  errors: ProjectConfigValidationError[]
): void {
  const path = `sources[${index}]`
  if (!isPlainObject(source)) {
    errors.push({ path, message: 'source must be an object' })
    return
  }
  if (!isNonEmptyString(source.id)) {
    errors.push({ path: `${path}.id`, message: 'id must be a non-empty string' })
  }
  if (!isNonEmptyString(source.root_path)) {
    errors.push({ path: `${path}.root_path`, message: 'root_path must be a non-empty string' })
  }
  if (!isIsoDateString(source.added_at)) {
    errors.push({ path: `${path}.added_at`, message: 'added_at must be an ISO-8601 date string' })
  }
  if (source.label !== undefined && typeof source.label !== 'string') {
    errors.push({ path: `${path}.label`, message: 'label must be a string' })
  }
}

/** Validates the `settings` object, pushing every error found onto
 * `errors`. */
function validateSettings(settings: unknown, errors: ProjectConfigValidationError[]): void {
  if (!isPlainObject(settings)) {
    errors.push({ path: 'settings', message: 'settings must be an object' })
    return
  }
  if (!isNonEmptyString(settings.wiki_lang)) {
    errors.push({ path: 'settings.wiki_lang', message: 'wiki_lang must be a non-empty string' })
  }
  const scanIntervalS = settings.scan_interval_s
  if (typeof scanIntervalS !== 'number' || !Number.isFinite(scanIntervalS) || scanIntervalS <= 0) {
    errors.push({
      path: 'settings.scan_interval_s',
      message: 'scan_interval_s must be a finite number greater than 0'
    })
  }
  if (typeof settings.embedding_model !== 'string') {
    errors.push({ path: 'settings.embedding_model', message: 'embedding_model must be a string' })
  }
  // Optional (see ProjectSettings.extraction_language) — but a value of the
  // wrong TYPE is still a broken config, not an absent setting.
  if (
    settings.extraction_language !== undefined &&
    typeof settings.extraction_language !== 'string'
  ) {
    errors.push({
      path: 'settings.extraction_language',
      message: 'extraction_language must be a string'
    })
  }
}

/** Validates an `unknown` value (e.g. freshly `JSON.parse`d file contents)
 * against the `project.json` schema, returning either the value narrowed to
 * `ProjectConfig` or the full list of every error found — not just the
 * first. Unknown extra fields anywhere in the input are not an error and are
 * kept in the value as they are (forward-compat). */
export function validateProjectConfig(input: unknown): ValidateProjectConfigResult {
  const errors: ProjectConfigValidationError[] = []

  if (!isPlainObject(input)) {
    return { ok: false, errors: [{ path: '', message: 'config must be an object' }] }
  }

  const schemaVersion = input.schema_version
  if (typeof schemaVersion !== 'number') {
    errors.push({ path: 'schema_version', message: 'schema_version must be a number' })
  } else if (schemaVersion !== PROJECT_CONFIG_SCHEMA_VERSION) {
    errors.push({
      path: 'schema_version',
      message: `unsupported schema_version ${schemaVersion} (expected ${PROJECT_CONFIG_SCHEMA_VERSION})`
    })
  }

  if (!isNonEmptyString(input.name)) {
    errors.push({ path: 'name', message: 'name must be a non-empty string' })
  }

  if (!isIsoDateString(input.created_at)) {
    errors.push({ path: 'created_at', message: 'created_at must be an ISO-8601 date string' })
  }

  if (!Array.isArray(input.sources)) {
    errors.push({ path: 'sources', message: 'sources must be an array' })
  } else {
    input.sources.forEach((source, index) => validateSource(source, index, errors))
  }

  validateSettings(input.settings, errors)

  if (errors.length > 0) return { ok: false, errors }

  const sources = input.sources as Record<string, unknown>[]
  const settings = input.settings as Record<string, unknown>

  // Unknown fields are carried through, not dropped: every write goes back through
  // this value, so dropping them here would erase them from project.json at the
  // first settings edit (technical debt 2026-08-26, D-56).
  return {
    ok: true,
    value: {
      ...input,
      schema_version: schemaVersion as number,
      name: input.name as string,
      created_at: input.created_at as string,
      sources: sources.map(({ label, ...source }) => ({
        ...source,
        id: source.id as string,
        root_path: source.root_path as string,
        added_at: source.added_at as string,
        ...(typeof label === 'string' && label.trim() !== '' ? { label } : {})
      })),
      settings: {
        ...settings,
        wiki_lang: settings.wiki_lang as string,
        scan_interval_s: settings.scan_interval_s as number,
        embedding_model: settings.embedding_model as string,
        extraction_language: (settings.extraction_language as string | undefined) ?? ''
      }
    }
  }
}
