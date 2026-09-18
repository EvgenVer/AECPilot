// Citations in an answer — `[src: <source_id>/<rel_path>#<locator>]` (task 2.13).
//
// The same grammar as mcp/aec_rag/src/aec_rag/citation.py, on this side of the
// wire. It is duplicated rather than shared because the two halves cross a
// language boundary, and the thing that keeps them honest is the test suite on
// each side asserting the same examples — the ones written down in
// specs/qa-over-sources.md §Формат locator.
//
// The locator uses each format's own notation (`p12`, `Ведомость!C5:D6`,
// `h:Кабельный журнал`) so a citation stays readable to the engineer it is
// shown to, not only to the viewer that opens it.

export type Locator = {
  heading?: string
  page?: number
  range?: string
  sheet?: string
}

export type Citation = {
  /** Character range of the whole `[src: …]` in the text it came from. */
  end: number
  locator: Locator
  raw: string
  relPath: string
  sourceId: string
  start: number
}

// `source_id` is a single path segment, so the first slash separates it from
// the relative path; the locator runs to the closing bracket.
const CITATION_RE = /\[src:\s*([^/\]\s][^/\]]*)\/([^\]#[]+?)(?:#([^\][]*))?\]/g

const PAGE_RE = /^p(\d+)$/
const HEADING_PREFIX = 'h:'

// A citation is delimited by `]` and split on `#`, so neither can survive
// inside a heading. Cutting at the first one is deliberate: the viewer matches
// a heading by prefix, so a truncated anchor still lands in the right section,
// whereas an escaped one would match nothing in the document.
const HEADING_STOP = /[\]#\r\n]/

/** The href our citations carry so the markdown renderer hands them to us.
 *  A constant, not a payload: the citation itself is the link's label, which
 *  keeps the answer text exactly what specs/qa-over-sources.md prescribes and
 *  spares the model any URL encoding of Cyrillic file names. */
export const CITATION_HREF = '#cite'

export function isCitationHref(href: string | undefined): boolean {
  return typeof href === 'string' && href.trim() === CITATION_HREF
}

/** Render a locator the way a citation writes it, or `null` when the place
 *  cannot be named at all. A page wins over a heading when a chunk carries
 *  both: the page is what a viewer can open, and the heading is context the
 *  reader already sees on that page. */
export function formatLocator(locator: Locator | undefined): null | string {
  if (!locator) return null

  if (typeof locator.page === 'number') return `p${locator.page}`

  if (locator.sheet) {
    return locator.range ? `${locator.sheet}!${locator.range}` : locator.sheet
  }

  if (locator.heading) {
    const trimmed = locator.heading.split(HEADING_STOP)[0]?.trim() ?? ''
    if (trimmed) return `${HEADING_PREFIX}${trimmed}`
  }

  return null
}

/** Inverse of `formatLocator`. An unreadable locator yields `{}` — the citation
 *  still names a file, and a file is worth opening. */
export function parseLocator(text: string): Locator {
  const trimmed = text.trim()
  if (!trimmed) return {}

  const page = PAGE_RE.exec(trimmed)
  if (page) return { page: Number(page[1]) }

  if (trimmed.startsWith(HEADING_PREFIX)) {
    const heading = trimmed.slice(HEADING_PREFIX.length).trim()
    return heading ? { heading } : {}
  }

  const separator = trimmed.indexOf('!')
  if (separator === -1) return { sheet: trimmed }

  const sheet = trimmed.slice(0, separator).trim()
  const range = trimmed.slice(separator + 1).trim()
  if (!sheet) return {}
  return range ? { range, sheet } : { sheet }
}

/** Locator keys each format can actually carry.
 *
 *  A DOCX has no pages — Word paints them at print time, the file has none —
 *  so `#p94` on a `.docx` is an anchor the model invented by analogy with the
 *  PDF citations next to it. Measured in the eval baseline (task 2.17): the
 *  answer was right, the file was right, and the link led nowhere.
 *
 *  Asking the model not to do it is a request, and a request is obeyed
 *  sometimes. Dropping what the format cannot hold is mechanical: the citation
 *  falls back to naming the file, which is exactly what the spec prescribes
 *  when a place cannot be named. */
const LOCATOR_KEYS: Record<string, ReadonlyArray<keyof Locator>> = {
  csv: [],
  docx: ['heading'],
  pdf: ['page', 'heading'],
  xlsx: ['sheet', 'range']
}

export function sanitizeLocator(relPath: string, locator: Locator): Locator {
  const extension = relPath.split('.').pop()?.toLowerCase() ?? ''
  const allowed = LOCATOR_KEYS[extension]
  if (!allowed) return locator

  const cleaned: Locator = {}
  for (const key of allowed) {
    if (locator[key] !== undefined) {
      Object.assign(cleaned, { [key]: locator[key] })
    }
  }
  // A range without its sheet addresses nothing.
  if (cleaned.range !== undefined && cleaned.sheet === undefined) delete cleaned.range
  return cleaned
}

export function formatCitation(sourceId: string, relPath: string, locator?: Locator): string {
  const rendered = formatLocator(locator)
  const body = `${sourceId}/${relPath}`
  return rendered ? `[src: ${body}#${rendered}]` : `[src: ${body}]`
}

/** Every citation in a piece of text, in order, with where it sits.
 *
 *  Malformed ones are skipped rather than thrown on: this runs over model
 *  output, and one broken bracket must not cost the reader the other citations
 *  in the same answer. */
export function parseCitations(text: string): Citation[] {
  if (!text) return []

  const citations: Citation[] = []
  CITATION_RE.lastIndex = 0

  let match = CITATION_RE.exec(text)
  while (match !== null) {
    const relPath = (match[2] ?? '').trim()
    if (relPath) {
      citations.push({
        end: match.index + match[0].length,
        locator: sanitizeLocator(relPath, parseLocator(match[3] ?? '')),
        raw: match[0],
        relPath,
        sourceId: (match[1] ?? '').trim(),
        start: match.index
      })
    }
    match = CITATION_RE.exec(text)
  }

  return citations
}

/** The single citation a link label carries, or `null` if the label is not one.
 *  Used where the markdown renderer already isolated the label — a label that
 *  holds anything else is left to render as ordinary text.
 *
 *  Two spellings arrive here. A block attribute carries the citation whole,
 *  `[src: …]`. The markdown renderer hands over the link TEXT of
 *  `[src: …](#cite)` — and the link syntax has already eaten the brackets, so
 *  what arrives is `src: …`. Until task 3F.4 (D-92) only the first spelling was
 *  recognised, and a citation in an answer rendered as a bare link instead of
 *  a chip. */
export function parseCitationLabel(label: string): Citation | null {
  const trimmed = label.trim()
  const whole = trimmed.startsWith('[') ? trimmed : `[${trimmed}]`
  const found = parseCitations(whole)
  if (found.length !== 1) return null
  return found[0].raw === whole ? found[0] : null
}

/** What the citation says out loud, for the chip and for its tooltip: the file
 *  name plus the place, without the machine syntax around it. */
export function citationLabel(citation: Citation): string {
  const name = citation.relPath.split('/').pop() || citation.relPath
  const locator = formatLocator(citation.locator)
  if (typeof citation.locator.page === 'number') return `${name}, с. ${citation.locator.page}`
  if (citation.locator.heading) return `${name} — ${citation.locator.heading}`
  return locator ? `${name} — ${locator}` : name
}
