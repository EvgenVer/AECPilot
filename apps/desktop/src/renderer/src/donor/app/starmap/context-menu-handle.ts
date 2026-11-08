/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/starmap/context-menu-handle.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/**
 * Registered context-menu ownership for the Star Map canvas.
 *
 * The app-wide menu listens on window during capture, before React's canvas
 * handler. It asks this handle whether the click hit a node: hits belong to
 * the Star Map, while misses keep flowing to the shell fallback.
 */

export interface StarMapContextMenuHandle {
  openNodeMenuAt: (clientX: number, clientY: number) => boolean
}

const handles = new WeakMap<HTMLCanvasElement, StarMapContextMenuHandle>()

/** Register the handle for a Star Map canvas. Returns an idempotent remove. */
export function registerStarMapContextMenu(canvas: HTMLCanvasElement, handle: StarMapContextMenuHandle): () => void {
  handles.set(canvas, handle)

  return () => {
    if (handles.get(canvas) === handle) {
      handles.delete(canvas)
    }
  }
}

/** Open the node menu when element is a registered canvas and the point hits a node. */
export function openStarMapNodeMenuFor(element: Element | null, clientX: number, clientY: number): boolean {
  if (!(element instanceof HTMLCanvasElement)) {
    return false
  }

  return handles.get(element)?.openNodeMenuAt(clientX, clientY) ?? false
}
