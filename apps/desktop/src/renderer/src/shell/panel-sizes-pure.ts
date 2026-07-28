// Pure logic for the resizable shell panels (Shell.tsx): every panel border
// is draggable (VS Code-style, SPEC UR12) and the sizes are persisted between
// sessions. Clamp + read/persist live here, independent of React/DOM, so
// they're unit-testable with plain fakes (same convention as theme.ts /
// explorer-search-pure.ts; vitest runs this suite under the 'node'
// environment). Persisted in localStorage only — pure layout preference, no
// main-process/IPC involvement.
//
// Task 1.5.9 started with the two horizontal dimensions (sidebar, chat dock);
// batch L of Phase 1.6 added the two vertical ones (the explorer's "Источники"
// section, task 1.6.L1, and the bottom panel, task 1.6.L2). The activity rail
// is fixed and the center viewer flexes to fill whatever is left (flex: 1),
// so its size is derived, never stored.

export interface PanelSizes {
  /** Explorer/contextual sidebar width, px. */
  sidebar: number
  /** Chat dock width, px. */
  chat: number
  /** Explorer "Источники" section height, px (task 1.6.L1). */
  sources: number
  /** Bottom panel height while expanded, px (task 1.6.L2). */
  bottom: number
}

// Bounds keep a panel from swallowing its neighbour or shrinking past
// usefulness. Defaults match the hardcoded CSS sizes each dimension had
// before it became resizable (shell.css `.sidebar` 262px, `.chat-dock` 380px,
// `.bottom-panel--expanded` 190px), so a first launch looks exactly as
// before. The sources section had no fixed height (it hugged its content up
// to 45% of the sidebar) — 150px is its chosen default, and the CSS keeps a
// percentage cap so a stored size can never squeeze the tree out.
export const SIDEBAR_MIN = 180
export const SIDEBAR_MAX = 480
export const SIDEBAR_DEFAULT = 262
export const CHAT_MIN = 300
export const CHAT_MAX = 600
export const CHAT_DEFAULT = 380
export const SOURCES_MIN = 60
export const SOURCES_MAX = 600
export const SOURCES_DEFAULT = 150
export const BOTTOM_MIN = 120
export const BOTTOM_MAX = 480
export const BOTTOM_DEFAULT = 190

export interface PanelBound {
  min: number
  max: number
  /** Size a double-click on the separator restores (task 1.6.L3). */
  default: number
}

/** Bounds per dimension, so a resizer (and the double-click reset) can be
 * wired from one lookup instead of six loose constants. */
export const PANEL_BOUNDS: Record<keyof PanelSizes, PanelBound> = {
  sidebar: { min: SIDEBAR_MIN, max: SIDEBAR_MAX, default: SIDEBAR_DEFAULT },
  chat: { min: CHAT_MIN, max: CHAT_MAX, default: CHAT_DEFAULT },
  sources: { min: SOURCES_MIN, max: SOURCES_MAX, default: SOURCES_DEFAULT },
  bottom: { min: BOTTOM_MIN, max: BOTTOM_MAX, default: BOTTOM_DEFAULT }
}

const STORAGE_KEY = 'aecpilot.panel-sizes'

const DEFAULT_SIZES: PanelSizes = {
  sidebar: SIDEBAR_DEFAULT,
  chat: CHAT_DEFAULT,
  sources: SOURCES_DEFAULT,
  bottom: BOTTOM_DEFAULT
}

/** Constrains `value` to `[min, max]`. Plain math clamp — used live on every
 * drag tick (and on keyboard nudges), where `value` is always finite. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Coerces one persisted dimension to a usable number: a non-finite or
 * missing value (corrupt/absent storage, or a record written before this
 * dimension existed) falls back to the dimension's default, an out-of-range
 * one is clamped into `[min, max]` (e.g. a width saved under a previous,
 * wider `MAX`). */
function sanitize(value: unknown, bound: PanelBound): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return bound.default
  return clamp(n, bound.min, bound.max)
}

/** Reads the persisted panel widths from `storage` (localStorage in the
 * app), defaulting to the pre-1.5.9 widths when nothing was saved, the JSON
 * is corrupt, a dimension is missing/non-numeric, or `storage.getItem`
 * throws (storage disabled / opaque origin). Shell.tsx calls this from a
 * `useState` initializer, so a thrown error must not crash the shell — same
 * hardening as readStoredTheme. */
export function readStoredPanelSizes(storage: Pick<Storage, 'getItem'>): PanelSizes {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (raw === null || raw === '') return DEFAULT_SIZES
    const parsed = JSON.parse(raw) as Partial<Record<keyof PanelSizes, unknown>>
    return {
      sidebar: sanitize(parsed.sidebar, PANEL_BOUNDS.sidebar),
      chat: sanitize(parsed.chat, PANEL_BOUNDS.chat),
      sources: sanitize(parsed.sources, PANEL_BOUNDS.sources),
      bottom: sanitize(parsed.bottom, PANEL_BOUNDS.bottom)
    }
  } catch {
    return DEFAULT_SIZES
  }
}

/** Persists `sizes` so they're restored next launch — best-effort: a
 * `setItem` failure (disabled storage, quota, SecurityError) is swallowed,
 * since losing persistence must not break resizing for the current session
 * (mirrors persistTheme). */
export function persistPanelSizes(storage: Pick<Storage, 'setItem'>, sizes: PanelSizes): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(sizes))
  } catch {
    // best-effort — see doc comment above.
  }
}
