// Pure parts of the rollback screen (task 1.6.C2, contract
// specs/checkpoints-rollback.md): turning the gateway's two thin answers into
// something a person can act on. No React, no IPC — everything here is a
// function of its arguments so the awkward cases (empty list that is not
// really empty, truncated patch, ambiguous diff) can be pinned by unit tests.

import type { CheckpointScopeInfo, RollbackListing } from '../../../../shared/ipc'
import type { RollbackCheckpoint } from '../../../../shared/gateway/types'

/** What the screen shows for the current listing.
 *
 * The distinction that matters: `empty` means "checkpoints are on and this
 * directory genuinely has no snapshots", `unavailable` means "checkpoints are
 * on but nothing that happens in this vault will ever appear in THIS list".
 * Showing the second as the first is what this whole type exists to prevent
 * (specs/checkpoints-rollback.md Open questions №1). */
export type RollbackView =
  | { kind: 'disabled' }
  | { kind: 'unavailable'; scope: CheckpointScopeInfo }
  | { kind: 'empty'; scope: CheckpointScopeInfo }
  | { kind: 'list'; checkpoints: RollbackCheckpoint[]; warning: CheckpointScopeInfo | null }

export function describeRollback(listing: RollbackListing): RollbackView {
  if (!listing.enabled) return { kind: 'disabled' }
  const misfiled =
    listing.scope.kind === 'ancestor' ||
    listing.scope.kind === 'blocked' ||
    listing.scope.kind === 'unmarked'
  if (listing.checkpoints.length === 0) {
    return misfiled
      ? { kind: 'unavailable', scope: listing.scope }
      : { kind: 'empty', scope: listing.scope }
  }
  return {
    kind: 'list',
    checkpoints: listing.checkpoints,
    warning: misfiled ? listing.scope : null
  }
}

/** Russian explanation of a scope verdict: a headline and the reason behind
 * it. Kept next to `describeRollback` because the two are read together — the
 * view kind decides whether to show this at all, the text says why. */
export function explainScope(scope: CheckpointScopeInfo): { title: string; detail: string } {
  switch (scope.kind) {
    case 'vault':
      return {
        title: 'Снимки собираются для корня проекта',
        detail: 'Список ниже полный.'
      }
    case 'ancestor':
      return {
        title: 'Чекпойнты собираются не для этой папки',
        detail:
          `Ядро ищет вверх от правимого файла папку-признак проекта и нашло её выше ` +
          `хранилища: ${scope.dir}. Снимки складываются туда, а этот экран спрашивает ` +
          `корень проекта — поэтому список пуст.`
      }
    case 'blocked':
      return {
        title: 'Снимки не создаются вообще',
        detail:
          `Ближайшая папка-признак проекта — домашняя директория (${scope.dir}), а её ` +
          `ядро считает слишком широкой и молча отказывается снимать. Ни один снимок ` +
          `правок агента не сохраняется.`
      }
    case 'unmarked':
      return {
        title: 'Чекпойнты собираются не для этой папки',
        detail:
          'В корне проекта нет ни одной папки-признака, которую ищет ядро, поэтому ' +
          'снимок делается для той подпапки, где лежит правимый файл. Этот экран ' +
          'спрашивает корень проекта и таких снимков не видит.'
      }
    case 'remote':
      return {
        title: 'Снимки собираются на машине ядра',
        detail:
          'Ядро работает на другой машине, и папку, для которой оно делает снимки, ' +
          'отсюда не увидеть. Пустой список может означать и отсутствие правок, и то, ' +
          'что снимки складываются там в другую папку.'
      }
    case 'unknown':
      return {
        title: 'Охват снимков проверить не удалось',
        detail:
          'Проект не открыт либо его корень сейчас не читается — пустой список может ' +
          'означать и отсутствие правок, и то, что снимки складываются в другую папку.'
      }
  }
}

/** Snapshot time for a list row.
 *
 * Deliberately textual, not `new Date(...)`: the value is git's `%aI` written
 * on this same machine, so its own offset already IS the user's local time.
 * Re-interpreting it through a Date would introduce a timezone conversion that
 * can only be wrong, and would make this untestable without freezing TZ.
 * Anything that doesn't look like an ISO timestamp is passed through as-is
 * rather than turned into "Invalid Date". */
export function formatCheckpointTime(timestamp: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(timestamp)
  if (!m) return timestamp
  const [, year, month, day, hour, minute] = m
  return `${day}.${month}.${year}, ${hour}:${minute}`
}

/** The gateway slices the patch with `[:4000]` and adds no marker, so a diff
 * that arrives at exactly the limit is almost certainly cut. Treated as "may
 * be truncated" and said so on screen — silently showing a half patch as the
 * whole truth is the failure mode worth avoiding. */
export const DIFF_CHAR_LIMIT = 4000

export function isDiffMaybeTruncated(diff: string): boolean {
  return diff.length >= DIFF_CHAR_LIMIT
}

export type DiffLineKind = 'add' | 'del' | 'hunk' | 'meta' | 'context'

export interface DiffLine {
  kind: DiffLineKind
  text: string
}

const META_PREFIXES = [
  'diff --git ',
  'index ',
  'new file mode',
  'deleted file mode',
  'old mode',
  'new mode',
  'similarity index',
  'dissimilarity index',
  'rename from',
  'rename to',
  'copy from',
  'copy to',
  'Binary files',
  'GIT binary patch',
  '--- ',
  '+++ '
]

/** Splits a unified patch into typed lines for monospace rendering.
 *
 * `---`/`+++` headers are classified BEFORE the `-`/`+` rules, otherwise every
 * file header would be painted as a removed/added line. */
export function parseDiffLines(diff: string): DiffLine[] {
  if (diff === '') return []
  return diff.split('\n').map((text) => {
    if (text === '---' || text === '+++') return { kind: 'meta' as const, text }
    if (META_PREFIXES.some((prefix) => text.startsWith(prefix))) {
      return { kind: 'meta' as const, text }
    }
    if (text.startsWith('@@')) return { kind: 'hunk' as const, text }
    if (text.startsWith('+')) return { kind: 'add' as const, text }
    if (text.startsWith('-')) return { kind: 'del' as const, text }
    return { kind: 'context' as const, text }
  })
}

export type DiffChange = 'added' | 'deleted' | 'renamed' | 'modified'

export interface DiffFile {
  /** Path as git prints it, relative to the snapshot's working directory —
   * exactly what `rollback.restore`'s `file_path` wants. */
  path: string
  change: DiffChange
  /** No line-by-line content exists for this file (`Binary files … differ`). */
  binary: boolean
}

/** The file list behind the patch: one row per `diff --git` header, with the
 * sign of the change taken from the header block that follows it.
 *
 * There is no other source for this — `rollback.list` carries no change
 * statistics at all, and `stat` is free-form text meant for a terminal. The
 * trailing entry can be incomplete when the server truncated the patch; the
 * screen says so via `isDiffMaybeTruncated` rather than this function
 * guessing. */
export function parseDiffFiles(diff: string): DiffFile[] {
  const files: DiffFile[] = []
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      const rest = line.slice('diff --git '.length)
      const m = /^a\/(.*) b\/(.*)$/.exec(rest)
      files.push({ path: m ? m[2] : rest, change: 'modified', binary: false })
      continue
    }
    const current = files[files.length - 1]
    if (!current) continue
    if (line.startsWith('new file mode')) current.change = 'added'
    else if (line.startsWith('deleted file mode')) current.change = 'deleted'
    else if (line.startsWith('rename to')) current.change = 'renamed'
    else if (line.startsWith('Binary files') || line.startsWith('GIT binary patch')) {
      current.binary = true
    }
  }
  return files
}

export const DIFF_CHANGE_LABEL: Record<DiffChange, string> = {
  added: 'добавлен',
  deleted: 'удалён',
  renamed: 'переименован',
  modified: 'изменён'
}
