import type { StarmapNode } from './graph-types'

// The donor's `@/lib/time` `fmtDate`, inlined: it is one `Intl.DateTimeFormat`
// and importing a whole time module for it would drag their `relativeTime`,
// `fmtDayTime` and friends in behind it. Locale stays `undefined` — the host's,
// which under our Russian interface reads "5 июн. 2026" rather than the
// donor's "5 Jun 2026", and that is the point.
const fmtDate = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric'
})

/** `unknown` (not a made-up date) is the donor's answer for an undated node,
 * and it is right — see `graph-types.ts`: `timestamp` really can be null. Only
 * the WORD is ours, because it reaches the tooltip. */
export function formatDate(ts?: null | number): string {
  if (!ts) {
    return 'без даты'
  }

  try {
    return fmtDate.format(new Date(ts * 1000))
  } catch {
    return 'без даты'
  }
}

// Tag-style badge items for the hover tooltip — date first. Use-count is NOT a
// badge (rendered separately, right-aligned) so it's excluded here.
//
// The badge WORDS are translated (they are interface text under a Russian
// interface); `n.category` is not — it is the core's own value, and translating
// it here would invent a mapping that drifts the moment they add a category.
export function metaBadges(n: StarmapNode): string[] {
  const out: string[] = [formatDate(n.timestamp)]

  if (n.kind === 'memory') {
    out.push(n.memorySource === 'profile' ? 'память профиля' : 'память')
  } else {
    out.push(n.category)

    if (n.createdBy === 'agent') {
      out.push('выучен сам')
    }

    if (n.pinned) {
      out.push('закреплён')
    }
  }

  return out.filter(Boolean)
}

// Bare "xN" use-count, last in the badge row. Null when never used.
export function countLabel(n: StarmapNode): null | string {
  return n.kind === 'skill' && n.useCount > 0 ? `x${n.useCount}` : null
}

// Footer-row content for the tooltip. Reserved primitive — returns nothing for
// now (skills have no UUID; their id is just the name). Wire real detail here
// later and the tooltip lays it out automatically.
export function nodeFooter(node: StarmapNode): null | string {
  void node

  return null
}

// Greedy word-wrap for the tooltip title so long memory lines don't blow out.
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''

  for (const word of words) {
    const next = line ? `${line} ${word}` : word

    if (!line || ctx.measureText(next).width <= maxW) {
      line = next
    } else {
      lines.push(line)
      line = word
    }
  }

  if (line) {
    lines.push(line)
  }

  return lines
}

// Trim to fit maxW, appending an ellipsis (keeps floating labels compact so they
// don't span the overlay).
export function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) {
    return text
  }

  let s = text

  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) {
    s = s.slice(0, -1)
  }

  return `${s.trimEnd()}…`
}
