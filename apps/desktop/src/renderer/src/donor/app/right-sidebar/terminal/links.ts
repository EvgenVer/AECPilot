/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/right-sidebar/terminal/links.ts
 * Commit:  fcbd1076a93841fa88855acce810e342a5b78101 (v2026.8.19)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { WebLinksAddon } from '@xterm/addon-web-links'
import type { ILinkHandler } from '@xterm/xterm'

import { openLink } from '@/lib/external-link'

import { isMacPlatform } from './selection'

// Both of xterm's link paths — the web-links addon (URLs it finds in the
// buffer) and the core OSC 8 provider (hyperlinks a CLI emits explicitly) —
// activate through `window.open()`, which the window's setWindowOpenHandler
// denies: a click did nothing but log "Opening link blocked as opener could not
// be cleared", and OSC 8 fronted that dead end with a raw confirm() dialog.
// Route both through the shared link router, the path every other link in the
// app takes.
//
// ⌘-click on macOS, Ctrl-click elsewhere — VS Code's integrated terminal,
// Terminal.app, and iTerm2 all agree. A bare click belongs to the selection, so
// a misclick on a URL can't launch a browser mid-sentence. ⌥ stays out of it:
// that's the force-selection drag over mouse-mode TUIs.
export function isTerminalLinkActivation(
  event: Pick<MouseEvent, 'ctrlKey' | 'metaKey'>,
  isMac = isMacPlatform()
): boolean {
  return isMac ? event.metaKey : event.ctrlKey
}

// The terminal spends the ⌘/Ctrl modifier on activation itself, so it has no
// second chord left to mean "native browser" — ⇧ takes that job here. Elsewhere
// a bare click opens in-app and ⌘ escapes to the OS; here it's ⌘ to open and
// ⇧⌘ to escape, which keeps both gestures reachable without stealing the
// selection back from a plain click.
const activate = (event: MouseEvent, uri: string) => {
  if (isTerminalLinkActivation(event)) {
    openLink(uri, { native: event.shiftKey })
  }
}

export const terminalLinkHandler: ILinkHandler = { activate }

export const terminalWebLinksAddon = () => new WebLinksAddon(activate)
