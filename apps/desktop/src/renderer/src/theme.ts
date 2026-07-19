// Theme module (task 1.5.10): light/dark toggle backed by tokens.css's
// [data-theme="dark"] selector (./styles/tokens.css) — applying a theme is
// just setting that attribute on the document root. Storage/root are passed
// in explicitly (not read from `window`/`document` directly) so the
// persist/apply logic stays unit-testable with plain fakes, no jsdom needed
// (vitest.config.ts runs this suite under the 'node' environment, same as
// chat-state.ts/scan-notification-pure.ts). Persisted in localStorage only,
// per the task's file boundary — no main-process/IPC involvement.

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'aecpilot.theme'

const DEFAULT_THEME: Theme = 'light'

/** Minimal shape `applyTheme` needs from the document root — satisfied
 * structurally by a real `HTMLElement` (its `.dataset` is a `DOMStringMap`),
 * so `document.documentElement` can be passed directly in the app, and a
 * plain object in tests. */
export interface ThemeRoot {
  dataset: { theme?: string }
}

/** Reads the persisted theme choice from `storage` (localStorage in the
 * app), defaulting to 'light' — the app's existing behavior — when nothing
 * was saved yet, the stored value isn't recognized, or `storage.getItem`
 * throws (e.g. `SecurityError` with storage disabled/an opaque origin).
 * That last case matters here more than for a typical localStorage read:
 * main.tsx calls this before the first render, so a thrown error would be a
 * blank window, and SettingsPanel calls it from a `useState` initializer,
 * where it would crash the panel. */
export function readStoredTheme(storage: Pick<Storage, 'getItem'>): Theme {
  try {
    return storage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

/** Persists `theme` to `storage` so it's restored on the next launch —
 * best-effort: a `setItem` failure (disabled storage, full quota,
 * `SecurityError`) is swallowed rather than thrown, since losing
 * persistence must not stop the theme from applying for the current
 * session (see `applyTheme`, and `SettingsPanel`'s `selectTheme`, which
 * calls this after `applyTheme` and before its `setState`). */
export function persistTheme(storage: Pick<Storage, 'setItem'>, theme: Theme): void {
  try {
    storage.setItem(STORAGE_KEY, theme)
  } catch {
    // best-effort — see doc comment above.
  }
}

/** Applies `theme` to `root` via the `data-theme` attribute tokens.css keys
 * off. Always set explicitly (never removed), so light and dark stay
 * symmetric states. */
export function applyTheme(root: ThemeRoot, theme: Theme): void {
  root.dataset.theme = theme
}
