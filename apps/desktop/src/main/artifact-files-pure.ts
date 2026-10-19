// Path rules for the artifacts tab (tasks 1.6.B7.4/B7.5). Pure — no `fs`, no
// electron — so every rule below is pinned by node tests rather than by reading
// the handler.
//
// The thing to keep in mind while reading this file: an artifact path is a
// string a language model wrote. It is not a path the user picked in a dialog
// and not a path the app derived from its own state. Everything here exists to
// keep that string from becoming a capability.

import { isAbsolute, normalize, relative, resolve, sep } from 'node:path'
import { mainT } from './i18n'

export type ArtifactPathResult =
  { ok: true; absPath: string; insideProject: boolean } | { ok: false; error: string }

/** Extensions the preview will decode. Deliberately shorter than the
 * heuristic's image list: `svg` is markup with script capability and is NOT
 * previewed, even though it is listed as an image elsewhere. */
const PREVIEWABLE_RE = /\.(?:png|jpe?g|gif|webp|bmp)$/i

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp'
}

/** Turns a `file://` URL into a plain path, leaving anything else alone. */
function stripFileScheme(value: string): string {
  if (!/^file:\/\//i.test(value)) return value
  try {
    const url = new URL(value)
    // `/D:/x` → `D:/x` on Windows; a UNC url keeps its host as the share.
    const pathname = decodeURIComponent(url.pathname)
    if (url.hostname) return `\\\\${url.hostname}${pathname.replace(/\//g, sep)}`
    return /^\/[A-Za-z]:/.test(pathname) ? pathname.slice(1) : pathname
  } catch {
    return value
  }
}

/** Resolves an artifact's `value` to an absolute path on this machine.
 *
 * `projectRoot` is both the base for a relative path (the agent's cwd IS the
 * vault) and the fence `insideProject` reports against. The caller decides what
 * to do with `insideProject: false` — reveal tolerates it, preview does not.
 *
 * An http(s) URL is refused here rather than resolved: it is a link, and links
 * go through `decideExternalLink`. Sending one down the file path would be the
 * start of a scheme-confusion bug. */
export function resolveArtifactPath(
  projectRoot: string | undefined,
  value: unknown
): ArtifactPathResult {
  if (typeof value !== 'string' || value.trim() === '') {
    return { ok: false, error: mainT('artifact.pathMissing') }
  }
  const raw = value.trim()
  if (/^(?:https?|data|mailto|javascript):/i.test(raw)) {
    return { ok: false, error: mainT('artifact.isLink') }
  }
  // eslint-disable-next-line no-control-regex -- deliberate: a control char in a path is never legitimate
  if (/[\x00-\x1f]/.test(raw)) return { ok: false, error: mainT('artifact.controlChars') }

  const candidate = stripFileScheme(raw)
  if (!isAbsolute(candidate) && !projectRoot) {
    return { ok: false, error: mainT('artifact.relativeNoProject') }
  }

  const absPath = isAbsolute(candidate)
    ? normalize(candidate)
    : resolve(projectRoot as string, candidate)

  return { ok: true, absPath, insideProject: isInside(projectRoot, absPath) }
}

/** Lexical containment: `absPath` is `root` itself or below it.
 *
 * Lexical only — the real-path (symlink) check belongs to the caller that
 * touches the disk, exactly as `vault-fs.ts` layers it. */
export function isInside(root: string | undefined, absPath: string): boolean {
  if (!root) return false
  const rel = relative(resolve(root), absPath)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

export function isPreviewableImage(absPath: string): boolean {
  return PREVIEWABLE_RE.test(absPath)
}

export function imageMime(absPath: string): string {
  const ext = absPath.split('.').pop()?.toLowerCase() ?? ''
  return MIME_BY_EXT[ext] ?? 'application/octet-stream'
}

/** The cap on a previewed image, in bytes.
 *
 * A data-URL crosses the IPC boundary as one string and lands in the renderer's
 * heap base64-encoded — a third bigger than the file. 12 MB covers any
 * screenshot or drawing export; a 200 MB scan is not something to inline. */
export const PREVIEW_MAX_BYTES = 12 * 1024 * 1024

export function previewOutsideProjectError(): string {
  return mainT('preview.outsideProject')
}
