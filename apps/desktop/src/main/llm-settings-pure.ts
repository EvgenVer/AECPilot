// Pure logic for task 0.15 (LLM settings), split out from llm-settings.ts so
// it can be unit-tested without importing `electron` (vitest runs these
// under plain node — no electron module resolution available there).
//
// SECURITY: nothing in this module ever reads or returns the *value* of a
// credential env var — `envVarIsDefined` only checks whether the var NAME is
// assigned on some line, via a line-start regex, and discards everything
// after the `=`.

/** Result of merging a model/baseUrl override into an existing hermes
 * `config.yaml`'s `model:` mapping. `changed` is false when the merge was a
 * no-op (no fields to apply) or when `unexpectedStructure` fired — in both
 * cases `text` is the original input, unmodified. */
export interface MergeModelResult {
  text: string
  changed: boolean
  /** True if `config.yaml` didn't look like the expected shape (no `model:`
   * mapping found) — callers should warn instead of silently no-op'ing. */
  unexpectedStructure: boolean
}

const MODEL_SECTION_RE = /^model:\s*$/
// A line back at column 0 (not indented, not blank) ends the `model:` block
// — anything indented under it (including blank lines within it) stays part
// of the mapping.
const TOP_LEVEL_LINE_RE = /^\S/

/** Merges `model` and `baseUrl` into the `model:` mapping of a hermes
 * `config.yaml` text, preserving every other key (notably `provider`) and
 * all comments/ordering. Conservative line-based transform — no YAML parser
 * (no new dependency): if the `model:` mapping can't be located, returns the
 * original text unchanged with `unexpectedStructure: true` so the caller can
 * warn rather than risk corrupting the file. */
export function mergeModelIntoConfigYaml(
  yamlText: string,
  overrides: { model?: string; baseUrl?: string }
): MergeModelResult {
  const { model, baseUrl } = overrides
  if (!model && !baseUrl) {
    return { text: yamlText, changed: false, unexpectedStructure: false }
  }

  const lines = yamlText.split('\n')
  const sectionStart = lines.findIndex((line) => MODEL_SECTION_RE.test(line))
  if (sectionStart === -1) {
    return { text: yamlText, changed: false, unexpectedStructure: true }
  }

  let sectionEnd = lines.length
  for (let i = sectionStart + 1; i < lines.length; i++) {
    if (TOP_LEVEL_LINE_RE.test(lines[i])) {
      sectionEnd = i
      break
    }
  }

  const sectionLines = lines.slice(sectionStart + 1, sectionEnd)
  let defaultSet = model === undefined
  let baseUrlSet = baseUrl === undefined
  const nextSectionLines = sectionLines.map((line) => {
    if (model !== undefined && /^\s*default:/.test(line)) {
      defaultSet = true
      return `  default: ${JSON.stringify(model)}`
    }
    if (baseUrl !== undefined && /^\s*base_url:/.test(line)) {
      baseUrlSet = true
      return `  base_url: ${JSON.stringify(baseUrl)}`
    }
    return line
  })

  if (!defaultSet) nextSectionLines.unshift(`  default: ${JSON.stringify(model)}`)
  if (!baseUrlSet) nextSectionLines.push(`  base_url: ${JSON.stringify(baseUrl)}`)

  const nextLines = [
    ...lines.slice(0, sectionStart + 1),
    ...nextSectionLines,
    ...lines.slice(sectionEnd)
  ]

  return { text: nextLines.join('\n'), changed: true, unexpectedStructure: false }
}

/** Valid values of the hermes profile's `approvals.mode` config key (task
 * 0.17). `'manual'` is hermes's default (human approves risky actions),
 * `'smart'` lets the LLM auto-approve/deny, `'off'` disables approvals. */
export const APPROVAL_MODES = ['manual', 'smart', 'off'] as const
export type ApprovalMode = (typeof APPROVAL_MODES)[number]

/** Whitelist guard for a value coming from the renderer/IPC boundary. */
export function isApprovalMode(value: unknown): value is ApprovalMode {
  return typeof value === 'string' && (APPROVAL_MODES as readonly string[]).includes(value)
}

const APPROVALS_SECTION_RE = /^approvals:\s*(#.*)?$/
const APPROVALS_SCALAR_RE = /^approvals:\s*[^#\s]/

/** Extracts the raw scalar text of a `mode:` line (tolerating single/double
 * quotes and a trailing inline comment) and normalizes it the way hermes'
 * `_normalize_approval_mode` does: a recognized mode string wins as-is;
 * YAML's bare boolean words (`true`→'manual', `false`→'off', which is how
 * bare `off`/`no`/`on`/`yes` parse under YAML 1.1) are mapped like hermes
 * maps the resulting Python bool; anything else (including no `mode:` line,
 * or no `approvals:` block at all) falls back to hermes's default,
 * `'manual'`. Never throws. */
export function parseApprovalsMode(yamlText: string): ApprovalMode {
  const lines = yamlText.split('\n')
  const sectionStart = lines.findIndex((line) => APPROVALS_SECTION_RE.test(line))
  if (sectionStart === -1) return 'manual'

  let sectionEnd = lines.length
  for (let i = sectionStart + 1; i < lines.length; i++) {
    if (TOP_LEVEL_LINE_RE.test(lines[i])) {
      sectionEnd = i
      break
    }
  }

  const modeLine = lines
    .slice(sectionStart + 1, sectionEnd)
    .find((line) => /^\s*mode:\s*/.test(line))
  if (!modeLine) return 'manual'

  let raw = modeLine.replace(/^\s*mode:\s*/, '').trim()
  if (raw.startsWith('"') || raw.startsWith("'")) {
    const quote = raw[0]
    const end = raw.indexOf(quote, 1)
    raw = end === -1 ? raw.slice(1) : raw.slice(1, end)
  } else {
    const hashIdx = raw.indexOf('#')
    if (hashIdx !== -1) raw = raw.slice(0, hashIdx)
    raw = raw.trim()
  }

  const lower = raw.toLowerCase()
  if (isApprovalMode(lower)) return lower
  if (lower === 'true') return 'manual'
  if (lower === 'false') return 'off'
  return 'manual'
}

export interface MergeApprovalsModeResult {
  text: string
  changed: boolean
  /** True only when `approvals:` exists but is a scalar (not a mapping),
   * e.g. `approvals: off` — genuinely unparseable by this line-based
   * transform. Callers should leave the file untouched and surface an
   * error rather than risk corrupting it. */
  unexpectedStructure: boolean
}

/** Merges `mode` into the `approvals:` mapping of a hermes `config.yaml`
 * text, preserving every other key (e.g. `timeout`) and all comments. If the
 * `approvals:` mapping doesn't exist yet, a new block is appended at the end
 * of the file (unlike `mergeModelIntoConfigYaml`, which requires the
 * `model:` mapping to already exist). The value is always written quoted
 * (`mode: "smart"`) to sidestep the YAML 1.1 bare-boolean-word pitfall
 * (`off`/`no`/`on`/`yes` parsing as booleans). `changed` is false when the
 * effective mode (per `parseApprovalsMode`) already matches. */
export function mergeApprovalsModeIntoConfigYaml(
  yamlText: string,
  mode: ApprovalMode
): MergeApprovalsModeResult {
  const lines = yamlText.split('\n')
  if (lines.some((line) => APPROVALS_SCALAR_RE.test(line))) {
    return { text: yamlText, changed: false, unexpectedStructure: true }
  }

  if (parseApprovalsMode(yamlText) === mode) {
    return { text: yamlText, changed: false, unexpectedStructure: false }
  }

  const sectionStart = lines.findIndex((line) => APPROVALS_SECTION_RE.test(line))
  if (sectionStart === -1) {
    const separator = yamlText === '' || yamlText.endsWith('\n') ? '' : '\n'
    const block = `approvals:\n  mode: ${JSON.stringify(mode)}\n`
    return { text: `${yamlText}${separator}${block}`, changed: true, unexpectedStructure: false }
  }

  let sectionEnd = lines.length
  for (let i = sectionStart + 1; i < lines.length; i++) {
    if (TOP_LEVEL_LINE_RE.test(lines[i])) {
      sectionEnd = i
      break
    }
  }

  const sectionLines = lines.slice(sectionStart + 1, sectionEnd)
  let modeSet = false
  const nextSectionLines = sectionLines.map((line) => {
    if (/^\s*mode:/.test(line)) {
      modeSet = true
      return `  mode: ${JSON.stringify(mode)}`
    }
    return line
  })
  if (!modeSet) nextSectionLines.unshift(`  mode: ${JSON.stringify(mode)}`)

  const nextLines = [
    ...lines.slice(0, sectionStart + 1),
    ...nextSectionLines,
    ...lines.slice(sectionEnd)
  ]

  return { text: nextLines.join('\n'), changed: true, unexpectedStructure: false }
}

/** Checks whether `envVarName` is *assigned* on some line of `.env`-style
 * text — a regex on line starts, never returning or retaining any value.
 * Matches `VAR=`, indented `  VAR =`; ignores commented-out `#VAR=` lines
 * and any other var name. */
export function envVarIsDefined(dotenvText: string, envVarName: string): boolean {
  const escaped = envVarName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`^\\s*${escaped}\\s*=`, 'm')
  return re.test(dotenvText)
}

/** Payload accepted by the `settings:save` IPC handler. `key: string` sets a
 * new key, `key: null` clears it, `key: undefined` (or omitted) leaves it
 * untouched. Validated here at the IPC boundary before anything touches
 * safeStorage or the filesystem. */
export interface SaveLlmSettingsPayload {
  model?: string
  baseUrl?: string
  key?: string | null
}

/** Type-boundary validator for the `settings:save` IPC payload. Returns the
 * payload narrowed to `SaveLlmSettingsPayload` on success, or an error
 * message on the first invalid field. */
export function validateSaveLlmSettingsPayload(
  value: unknown
): { ok: true; payload: SaveLlmSettingsPayload } | { ok: false; error: string } {
  if (typeof value !== 'object' || value === null) {
    return { ok: false, error: 'settings payload must be an object' }
  }
  const { model, baseUrl, key } = value as Record<string, unknown>

  if (model !== undefined && typeof model !== 'string') {
    return { ok: false, error: 'model must be a string' }
  }
  if (baseUrl !== undefined && typeof baseUrl !== 'string') {
    return { ok: false, error: 'baseUrl must be a string' }
  }
  if (key !== undefined && key !== null && typeof key !== 'string') {
    return { ok: false, error: 'key must be a string, null, or omitted' }
  }

  return { ok: true, payload: { model, baseUrl, key } }
}
