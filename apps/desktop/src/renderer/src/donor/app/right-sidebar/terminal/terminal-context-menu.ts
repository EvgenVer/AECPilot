/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/right-sidebar/terminal/terminal-context-menu.ts
 * Commit:  fcbd1076a93841fa88855acce810e342a5b78101 (v2026.8.19)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/**
 * Context-menu handles for the GUI terminals.
 *
 * xterm paints to a canvas: a right-click inside it crosses no link, image,
 * editable, or DOM selection, so the app context menu would see a bare
 * surface and offer the window verbs. Each terminal registers a handle for
 * its host instead, and the coordinator resolves a click back to it through
 * the `[data-terminal]` focus-scope marker both terminal flavours carry.
 */

export interface TerminalMenuHandle {
  getSelection: () => string
  /** Null on the read-only agent mirror — it has no PTY to paste into. */
  paste: ((text: string) => void) | null
  selectAll: () => void
}

const handles = new WeakMap<Element, TerminalMenuHandle>()

/** Register the handle for a terminal host. Returns an idempotent remove. */
export function registerTerminalContextMenu(host: Element, handle: TerminalMenuHandle): () => void {
  handles.set(host, handle)

  return () => {
    if (handles.get(host) === handle) {
      handles.delete(host)
    }
  }
}

/** The handle owning `element`, when the click landed inside a terminal. */
export function terminalMenuHandleFor(element: Element | null): TerminalMenuHandle | null {
  const host = element?.closest('[data-terminal]')

  return host ? (handles.get(host) ?? null) : null
}
