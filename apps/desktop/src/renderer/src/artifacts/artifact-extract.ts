// The artifact heuristic (task 1.6.B7.2). Contract: specs/external-surfaces.md.
//
// Ported from the donor's `app/artifacts/artifact-utils.ts`, which exists for
// the same reason ours does: THERE IS NO ARTIFACT ENDPOINT. Neither
// `/api/artifacts` nor an `artifact.*` RPC method exists in hermes 0.19.0, so
// the only way to answer "what did the agent make" is to read the transcript
// back and recognise file paths, images and links inside it (§Факты 1).
//
// This module is pure on purpose: no `fetch`, no IPC, no filesystem, no clock.
// Everything it needs arrives as arguments, which is what makes the recognition
// rules testable one by one — and they need to be, because a heuristic that
// silently widens is a heuristic that starts listing sentence fragments as
// files.
//
// Four deliberate departures from the donor, each measured:
//
// 1. **Windows paths.** The donor recognises POSIX shapes only (`/`, `./`,
//    `../`, `~/`). On this machine the agent writes `D:\my program\...` and
//    `\\server\share\...`; without the branch below the list would be empty on
//    the platform we ship first.
// 2. **Truncated labels are rejected.** `session.history` hands tool arguments
//    over as `build_tool_label(..., max_len=80)`, which cuts at 80 characters
//    and appends `...` (`agent/display.py:182`). The donor's `normalizeValue`
//    strips trailing dots, which would turn `…/very/long/pa...` into a
//    plausible-looking path that does not exist. A wrong path is worse than a
//    missing one, so a candidate that arrived truncated is dropped.
// 3. **No clock.** The donor falls back to `Date.now()` for a message with no
//    timestamp; that would make this module untestable and would date an
//    undated artifact as "now". The session's own start time is used instead,
//    and 0 when even that is missing — the UI shows no date rather than a lie.
// 4. **Rootless relative paths are recognised.** The donor's final gate demands
//    a root, so its own tool-argument branch pushes `out/report.pdf` and the
//    gate then throws it away — a dead branch, and `write_file` takes exactly
//    that shape. See `looksLikeArtifact` for how far the widening goes.

export type ArtifactKind = 'image' | 'file' | 'link'

/** One recognised artifact. `timestamp` is epoch SECONDS — the unit the core
 * uses everywhere (`timestamp REAL` in its `messages` table, `started_at` on a
 * session row), not milliseconds (spec §Факт 5). */
export interface ArtifactRecord {
  /** Stable across re-scans: session id plus the normalised value. */
  id: string
  kind: ArtifactKind
  /** The path or URL exactly as it appeared — this is what gets opened and
   * copied, so it is never rewritten, only compared in normalised form. */
  value: string
  /** Last path segment, for the list. */
  label: string
  sessionId: string
  sessionTitle: string
  timestamp: number
}

/** A transcript message, in the shape `artifact-source.ts` normalises both of
 * the core's two transcript surfaces into.
 *
 * `text` is the message body (`content` in the REST rows, `text` in the RPC
 * history). `context` is the RPC history's human label for a tool call, which
 * is all that survives there — see the module header. `toolCalls` is the raw
 * `tool_calls` array, present only in the REST rows. */
export interface ArtifactMessage {
  role: string
  text?: string
  context?: string
  toolCalls?: unknown
  /** epoch seconds */
  timestamp?: number
}

export interface ArtifactSession {
  id: string
  title?: string
  preview?: string
  /** epoch seconds */
  startedAt?: number
}

const MARKDOWN_IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)\)/g
const MARKDOWN_LINK_RE = /\[([^\]]+)\]\(([^)\s]+)\)/g
const URL_RE = /https?:\/\/[^\s<>"')]+/g
const POSIX_PATH_RE = /(^|[\s("'`])((?:\/|~\/|\.\.?\/)[^\s"'`<>]+)/g
/** `C:\…`, `C:/…` and UNC `\\server\share\…`. Stops at whitespace like the
 * donor's POSIX one; a path WITH spaces is found through the quoted-span pass
 * below (and, in practice, arrives verbatim in tool arguments anyway). */
const WINDOWS_PATH_RE = /(^|[\s("'`])((?:[A-Za-z]:[\\/]|\\\\[^\s\\]+\\)[^\s"'`<>|*?]+)/g
/** Text inside backticks or quotes, taken whole — this is how a path with
 * spaces (`D:\my program\smeta.xlsx`) survives, and agents quote them by habit. */
const QUOTED_SPAN_RE = /`([^`\n]{3,240})`|"([^"\n]{3,240})"|'([^'\n]{3,240})'/g

const IMAGE_EXT_RE = /\.(?:png|jpe?g|gif|webp|svg|bmp)(?:\?.*)?$/i
/** The donor's list plus the formats this product is actually about: an
 * estimate is an `.xlsx`, a note is a `.docx`, a drawing is a `.dwg`/`.dxf`,
 * a model is an `.ifc`/`.rvt`. Without them the tab would recognise the
 * agent's screenshots and miss its deliverables. */
const FILE_EXT_RE =
  /\.(?:png|jpe?g|gif|webp|svg|bmp|pdf|txt|json|md|csv|zip|tar|gz|mp3|wav|mp4|mov|xlsx?|xlsm|docx?|pptx?|odt|ods|dwg|dxf|ifc|rvt|nwd|xml|ya?ml)(?:\?.*)?$/i
/** Which JSON keys are worth believing. Without it every string in a tool's
 * arguments would be a candidate, and tool arguments are where the model's free
 * text lives. */
const KEY_HINT_RE = /(path|file|url|image|artifact|output|download|result|target)/i

const WINDOWS_ABS_RE = /^[A-Za-z]:[\\/]/
const UNC_RE = /^\\\\[^\\]+\\/

/** The core's own truncation marker (`agent/display.py:182`). */
function isTruncated(raw: string): boolean {
  return raw.trimEnd().endsWith('...')
}

/** Trailing punctuation belongs to the sentence, not to the path. */
function normalizeValue(value: string): string {
  return value.trim().replace(/[),.;]+$/, '')
}

function parseMaybeJson(value: string): unknown {
  if (!value.trim()) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function isPathLike(value: string): boolean {
  return (
    value.startsWith('file://') ||
    value.startsWith('/') ||
    value.startsWith('./') ||
    value.startsWith('../') ||
    value.startsWith('~/') ||
    WINDOWS_ABS_RE.test(value) ||
    UNC_RE.test(value)
  )
}

export function looksLikePathOrUrl(value: string): boolean {
  return (
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('data:image/') ||
    isPathLike(value)
  )
}

/** The gate every candidate passes before it becomes a record.
 *
 * The last branch is the donor's "an absolute path with a dot in it is a file
 * even if the extension is unknown" — widened to Windows roots, and narrowed to
 * the LAST segment so that `D:\project.v2\src` (a directory) does not qualify
 * on the strength of a dot in its parent. */
export function looksLikeArtifact(value: string): boolean {
  if (/^(?:https?:\/\/|data:image\/)/.test(value)) return true
  if (!isPathLike(value)) {
    // A rooted path is not the only real shape. Project-relative paths
    // (`out/report.pdf`) are what `write_file` takes and what a markdown link
    // in an answer points at, and the donor drops every one of them: its gate
    // demands a root, so its own tool-argument branch pushes candidates that
    // the final gate then throws away. Accepted here only with a separator AND
    // a known extension AND no `scheme:` prefix — so `mailto:…`, a bare word
    // and a sentence fragment still cannot qualify.
    return /[\\/]/.test(value) && FILE_EXT_RE.test(value) && !/^[a-z][a-z0-9+.-]*:/i.test(value)
  }
  if (IMAGE_EXT_RE.test(value) || FILE_EXT_RE.test(value)) return true
  const lastSegment = value.split(/[\\/]/).filter(Boolean).pop() ?? ''
  return lastSegment.includes('.') && !lastSegment.startsWith('.')
}

export function artifactKind(value: string): ArtifactKind {
  if (value.startsWith('data:image/') || IMAGE_EXT_RE.test(value)) return 'image'
  if (isPathLike(value)) return 'file'
  return 'link'
}

export function artifactLabel(value: string): string {
  // `new URL('D:\\my program\\x.xlsx')` SUCCEEDS — `D:` parses as a scheme and
  // the whole path lands in `pathname` unsplit. The donor never hit this
  // because it has no Windows branch; here the URL parser has to be kept away
  // from anything path-shaped.
  if (!isPathLike(value)) {
    try {
      const url = new URL(value)
      const item = url.pathname.split('/').filter(Boolean).pop()
      return item || value
    } catch {
      // Not a URL after all — fall through to the path split.
    }
  }
  return value.split(/[\\/]/).filter(Boolean).pop() || value
}

/** Dedup key only — never shown and never opened.
 *
 * Case and slash direction are noise on Windows: `D:\out\plan.md` and
 * `d:/out/plan.md` are the same file, and listing both would make the tab look
 * like it double-counts. URLs keep their case: a path segment there IS
 * case-sensitive on most servers. */
export function dedupKey(value: string): string {
  if (/^(?:https?:\/\/|data:)/i.test(value)) return value
  return value.replace(/\\/g, '/').toLowerCase()
}

/** Walks a JSON value, handing every string to `collector` with the dotted key
 * path that led to it. */
function collectStringValues(
  value: unknown,
  keyPath: string,
  collector: (value: string, keyPath: string) => void
): void {
  if (typeof value === 'string') {
    collector(value, keyPath)
    return
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectStringValues(entry, `${keyPath}.${index}`, collector))
    return
  }
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    collectStringValues(child, keyPath ? `${keyPath}.${key}` : key, collector)
  }
}

/** Everything path- or URL-shaped in a block of prose. */
export function collectFromText(text: string, push: (value: string) => void): void {
  for (const match of text.matchAll(MARKDOWN_IMAGE_RE)) push(match[2] || '')

  for (const match of text.matchAll(MARKDOWN_LINK_RE)) {
    // `![alt](src)` already went through the image pass above; without this the
    // same src would be pushed twice (harmless after dedup, but it would also
    // let a non-artifact image src in through the laxer link branch).
    const start = match.index ?? 0
    if (start > 0 && text[start - 1] === '!') continue
    const value = match[2] || ''
    if (looksLikeArtifact(value)) push(value)
  }

  for (const match of text.matchAll(URL_RE)) {
    const value = match[0] || ''
    if (looksLikeArtifact(value)) push(value)
  }

  for (const match of text.matchAll(POSIX_PATH_RE)) push(match[2] || '')
  for (const match of text.matchAll(WINDOWS_PATH_RE)) push(match[2] || '')

  for (const match of text.matchAll(QUOTED_SPAN_RE)) {
    const span = (match[1] ?? match[2] ?? match[3] ?? '').trim()
    if (span && looksLikeArtifact(span)) push(span)
  }
}

function messageText(message: ArtifactMessage): string {
  if (typeof message.text === 'string' && message.text.trim()) return message.text
  if (typeof message.context === 'string' && message.context.trim()) return message.context
  return ''
}

function collectFromMessage(message: ArtifactMessage, push: (value: string) => void): void {
  const text = messageText(message)
  if (text) collectFromText(text, push)

  if (Array.isArray(message.toolCalls)) {
    for (const call of message.toolCalls) {
      collectStringValues(call, 'tool_call', (value, keyPath) => {
        const normalized = normalizeValue(value)
        if (!normalized) return
        if (
          KEY_HINT_RE.test(keyPath) &&
          (looksLikePathOrUrl(normalized) || FILE_EXT_RE.test(normalized))
        ) {
          push(value)
        }
      })
    }
  }

  // A tool RESULT is often JSON with the produced path in it. Parsed rather
  // than scanned as prose so that `{"path":"out/report.pdf"}` — a relative path
  // with no `./` prefix, which no text rule would catch — is still found.
  if (message.role === 'tool') {
    const parsed = parseMaybeJson(text)
    if (parsed !== null) {
      collectStringValues(parsed, 'tool_result', (value, keyPath) => {
        const normalized = normalizeValue(value)
        if (!normalized) return
        if (
          (KEY_HINT_RE.test(keyPath) || looksLikePathOrUrl(normalized)) &&
          looksLikeArtifact(normalized)
        ) {
          push(value)
        }
      })
    }
  }
}

function sessionTitle(session: ArtifactSession): string {
  return session.title?.trim() || session.preview?.trim() || 'Без названия'
}

/** All artifacts of one session, in the order they were first seen.
 *
 * Only `assistant` and `tool` messages are read: a path the USER typed is a
 * path the user already knows about, and including user text would fill the tab
 * with everything anyone ever pasted into the composer. */
export function collectArtifacts(
  session: ArtifactSession,
  messages: readonly ArtifactMessage[]
): ArtifactRecord[] {
  const found = new Map<string, ArtifactRecord>()
  const title = sessionTitle(session)

  for (const message of messages) {
    if (message.role !== 'assistant' && message.role !== 'tool') continue

    collectFromMessage(message, (candidate) => {
      if (isTruncated(candidate)) return
      const value = normalizeValue(candidate)
      if (!value || !looksLikeArtifact(value)) return

      const key = `${session.id}:${dedupKey(value)}`
      if (found.has(key)) return

      found.set(key, {
        id: key,
        kind: artifactKind(value),
        value,
        label: artifactLabel(value),
        sessionId: session.id,
        sessionTitle: title,
        timestamp: message.timestamp || session.startedAt || 0
      })
    })
  }

  return [...found.values()]
}
