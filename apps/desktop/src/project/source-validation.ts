// Pure validation for task 1.7's "add source" flow (contract:
// specs/workspace-sources.md § Edge cases — vault/source nesting is
// forbidden, overlapping sources warn). No fs access here — existence/
// availability of `candidatePath` is a best-effort check done by the caller
// in main (see project-manager.ts's addSourceToProject), never here.
//
// Path comparisons always use Windows (`win32`) semantics regardless of the
// host OS this runs on — vault/source paths are Windows paths (UNC shares,
// drive letters), and the app itself only ships for Windows.

import { win32 } from 'node:path'

export interface ExistingSource {
  id: string
  root_path: string
}

export interface ValidateNewSourceInput {
  vaultPath: string
  existingRoots: ExistingSource[]
  candidatePath: string
}

export type ValidateNewSourceResult =
  { ok: true; warnings: string[] } | { ok: false; errors: string[] }

/** Splits a path into lowercase, non-empty segments for boundary-aware
 * comparison — e.g. `C:\a\bc` must NOT be considered inside `C:\a\b` just
 * because the string `C:\a\b` is a prefix of `C:\a\bc`. `win32.normalize`
 * collapses `.`/`..` and mixed `/`/`\` separators before splitting; a UNC
 * path like `\\server\share` yields `['server', 'share']` (the same shape a
 * drive path yields `['c:', 'foo']`), which keeps the two families from ever
 * colliding since the first segment always differs. */
function segments(p: string): string[] {
  return win32
    .normalize(p)
    .toLowerCase()
    .split(win32.sep)
    .filter((s) => s.length > 0)
}

// Fix-iteration 1 (review minor): device/extended-length prefixes
// (`\\?\...`, `\\.\...`) must be rejected before any comparison — a `?`
// segment breaks the segment-based relation() logic below, and these
// prefixes could otherwise be used to smuggle a candidate past the
// vault/duplicate checks (e.g. `\\?\C:\vault` vs `C:\vault` wouldn't compare
// equal). Control characters (`\x00`-`\x1f`, including embedded NUL) are
// rejected the same way — never valid in a filesystem path.
// eslint-disable-next-line no-control-regex -- deliberate: this regex exists to reject control chars
const CONTROL_CHAR_RE = /[\x00-\x1f]/

function hasUnsupportedPrefix(p: string): boolean {
  return p.startsWith('\\\\?\\') || p.startsWith('\\\\.\\')
}

type Relation = 'same' | 'a-inside-b' | 'b-inside-a' | 'none'

function relation(aSegs: string[], bSegs: string[]): Relation {
  const minLen = Math.min(aSegs.length, bSegs.length)
  for (let i = 0; i < minLen; i++) {
    if (aSegs[i] !== bSegs[i]) return 'none'
  }
  if (aSegs.length === bSegs.length) return 'same'
  return aSegs.length > bSegs.length ? 'a-inside-b' : 'b-inside-a'
}

/** Validates a candidate source path against the vault root and the
 * project's already-connected sources:
 * - `candidatePath` containing control characters, or starting with a
 *   `\\?\`/`\\.\` device/extended-length prefix → error.
 * - non-absolute `candidatePath` → error.
 * - `candidatePath` nested inside (or containing, or equal to) `vaultPath`
 *   → error — a source may never overlap the vault.
 * - `candidatePath` exactly matching an existing source's `root_path` →
 *   error — already connected.
 * - `candidatePath` nested inside (or containing) an existing source's
 *   `root_path` → warning — allowed, but the caller should ask the user to
 *   confirm.
 * Never touches the filesystem — existence/availability of `candidatePath`
 * is out of scope here. */
export function validateNewSource(input: ValidateNewSourceInput): ValidateNewSourceResult {
  const { vaultPath, existingRoots, candidatePath } = input

  if (CONTROL_CHAR_RE.test(candidatePath)) {
    return { ok: false, errors: ['Путь содержит недопустимые управляющие символы'] }
  }

  if (hasUnsupportedPrefix(candidatePath)) {
    return { ok: false, errors: ['Служебные префиксы путей (\\\\?\\, \\\\.\\) не поддерживаются'] }
  }

  if (!win32.isAbsolute(candidatePath)) {
    return { ok: false, errors: ['Путь к источнику должен быть абсолютным'] }
  }

  const candidateSegs = segments(candidatePath)
  const errors: string[] = []
  const warnings: string[] = []

  const vaultRelation = relation(candidateSegs, segments(vaultPath))
  if (vaultRelation !== 'none') {
    errors.push(
      'Источник не может находиться внутри рабочей папки проекта (vault) или содержать её — выберите другой путь'
    )
  }

  for (const existing of existingRoots) {
    const existingRelation = relation(candidateSegs, segments(existing.root_path))
    if (existingRelation === 'same') {
      errors.push('Этот путь уже подключён как источник')
    } else if (existingRelation !== 'none') {
      warnings.push(`Путь пересекается с уже подключённым источником «${existing.root_path}»`)
    }
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, warnings }
}
