/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/external-links.ts
 * Commit:  f97608f178d1ffeca59860195ab7da295f7c8e5f (v2026.9.24)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/**
 * Always open links in the system browser — a device-local preference.
 *
 * Off (the default): a clicked web link opens in the in-app browser, and
 * ⌘/Ctrl-click or middle-click escapes to the OS browser. On: every clicked
 * link goes to the OS browser (see `openLink` in `@/lib/external-link`).
 *
 * Renderer-owned: it only decides where THIS machine's link clicks land. The
 * `storage` listener keeps every open window in step when one window flips it.
 * Explicit "Open in in-app browser" menu actions and agent-driven previews are
 * not link clicks and stay unaffected.
 */

import { atom } from 'nanostores'

import { persistBoolean, storedBoolean } from '@/lib/storage'

const KEY = 'hermes.desktop.alwaysExternalLinks.v1'

export const $alwaysExternalLinks = atom<boolean>(typeof window === 'undefined' ? false : storedBoolean(KEY, false))

export function setAlwaysExternalLinks(on: boolean): void {
  $alwaysExternalLinks.set(on)
}

if (typeof window !== 'undefined') {
  $alwaysExternalLinks.subscribe(on => persistBoolean(KEY, on))

  window.addEventListener('storage', event => {
    if (event.key === KEY) {
      $alwaysExternalLinks.set(storedBoolean(KEY, false))
    }
  })
}
