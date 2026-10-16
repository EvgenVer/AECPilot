/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/test/jsdom.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
// jsdom implements no layout and no animation, so component libraries that
// call those APIs unconditionally throw on mount. These install inert
// stand-ins: enough for the component to render, never enough to assert on. A
// test that needs one of them to actually report should install its own.

import { vi } from 'vitest'

export class InertResizeObserver {
  disconnect() {}
  observe() {}
  unobserve() {}
}

/** A ResizeObserver that accepts observers and never calls them back. */
export function stubResizeObserver() {
  vi.stubGlobal('ResizeObserver', InertResizeObserver)
}

/** The pointer-capture and scroll calls Radix and cmdk make while opening a
 *  popover, menu, or combobox — and again on the item they focus. */
export function stubMenuDomApis() {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.setPointerCapture ??= () => undefined
  Element.prototype.releasePointerCapture ??= () => undefined
  Element.prototype.scrollIntoView ??= () => undefined
}
