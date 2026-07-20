// Pure logic for task 1.5.9's resizable shell panels (Shell.tsx): the
// explorer sidebar and the chat dock get draggable edges (VS Code-style),
// their widths persisted between sessions. Clamp + read/persist live here,
// independent of React/DOM, so they're unit-testable with plain fakes (same
// convention as theme.ts / explorer-search-pure.ts; vitest runs this suite
// under the 'node' environment). Persisted in localStorage only — pure
// layout preference, no main-process/IPC involvement.
//
// Only the sidebar and chat dock resize; the activity rail is fixed and the
// center viewer flexes to fill whatever is left (flex: 1), so its width is
// derived, never stored.

export interface PanelSizes {
  /** Explorer/contextual sidebar width, px. */
  sidebar: number
  /** Chat dock width, px. */
  chat: number
}

// Bounds keep either panel from swallowing the center viewer or shrinking
// past usefulness. Defaults match the pre-1.5.9 hardcoded CSS widths
// (shell.css `.sidebar` 262px, `.chat-dock` 380px), so a first launch looks
// exactly as before.
export const SIDEBAR_MIN = 180
export const SIDEBAR_MAX = 480
export const SIDEBAR_DEFAULT = 262
export const CHAT_MIN = 300
export const CHAT_MAX = 600
export const CHAT_DEFAULT = 380

const STORAGE_KEY = 'aecpilot.panel-sizes'

const DEFAULT_SIZES: PanelSizes = { sidebar: SIDEBAR_DEFAULT, chat: CHAT_DEFAULT }

/** Constrains `value` to `[min, max]`. Plain math clamp — used live on every
 * drag tick (and on keyboard nudges), where `value` is always finite. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Coerces one persisted dimension to a usable number: a non-finite or
 * missing value (corrupt/absent storage) falls back to `fallback`, an
 * out-of-range one is clamped into `[min, max]` (e.g. a width saved under a
 * previous, wider `MAX`). */
function sanitize(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return clamp(n, min, max)
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
      sidebar: sanitize(parsed.sidebar, SIDEBAR_MIN, SIDEBAR_MAX, SIDEBAR_DEFAULT),
      chat: sanitize(parsed.chat, CHAT_MIN, CHAT_MAX, CHAT_DEFAULT)
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
