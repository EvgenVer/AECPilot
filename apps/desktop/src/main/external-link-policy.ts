/** Which URLs the app is willing to hand to the OS browser, and which
 * navigations the renderer window is allowed to perform (task 1.6.4a).
 *
 * This is a security boundary, so it lives as a pure function: the renderer
 * displays text authored by the agent (and, through it, by whatever the agent
 * read), and that text must never be able to navigate the window — our preload
 * API travels with the window and would then be exposed to a foreign page.
 *
 * Kept free of Electron imports on purpose, so it is unit-tested directly.
 */

/** `mailto:` is here because an agent answer can legitimately contain an
 * address; `file:` is NOT — opening a local path from agent text is an
 * arbitrary-file-open primitive, and the app already has its own explicit
 * "показать в проводнике" path for that. `javascript:`/`data:` are the classic
 * injection vectors. */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

export type LinkDecision = { allowed: true; url: string } | { allowed: false; reason: string }

/** Decides whether `raw` may be handed to `shell.openExternal`. */
export function decideExternalLink(raw: unknown): LinkDecision {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { allowed: false, reason: 'ссылка не указана' }
  }
  // A URL longer than this is not a link a human is going to follow; it is a
  // payload. The cap also keeps a hostile string out of the OS shell call.
  if (raw.length > 2048) return { allowed: false, reason: 'ссылка слишком длинная' }

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return { allowed: false, reason: 'ссылка не разобрана как URL' }
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return { allowed: false, reason: `схема ${parsed.protocol} не разрешена` }
  }

  // `new URL()` normalises the input (percent-encoding, host case, dot
  // segments). Handing the NORMALISED form to the OS closes the gap where the
  // string we validated and the string we open differ.
  return { allowed: true, url: parsed.toString() }
}

/** Whether the renderer window may navigate itself to `target`.
 *
 * Only the page the window was opened with. `ownUrl` is the dev-server URL or
 * the packaged `file://` entry point; anything else — an external site, a
 * different local file — is refused and, when it is a normal web link, opened
 * in the OS browser instead. */
export function isOwnRendererUrl(target: string, ownUrl: string | undefined): boolean {
  if (!ownUrl) return false
  let a: URL
  let b: URL
  try {
    a = new URL(target)
    b = new URL(ownUrl)
  } catch {
    return false
  }
  if (a.protocol === 'file:' && b.protocol === 'file:') return a.pathname === b.pathname
  return a.origin === b.origin && a.pathname === b.pathname
}
