/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/starmap/playback-hotkey.test.ts
 * Commit:  345cd2b057a452236de401d3534b8502a7465e8d (v2026.9.14)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { describe, expect, it } from 'vitest'

import { shouldIgnorePlaybackHotkey } from './playback-hotkey'

function spaceOn(target: Element | null, defaultPrevented = false) {
  return { code: 'Space', defaultPrevented, key: ' ', target } as unknown as KeyboardEvent
}

describe('shouldIgnorePlaybackHotkey', () => {
  it('toggles on Space when nothing focusable owns the key', () => {
    expect(shouldIgnorePlaybackHotkey(spaceOn(document.body), document.body)).toBe(false)
  })

  it('ignores Space on a focused Radix menu item (div[role=menuitem] inside role=menu)', () => {
    const menu = document.createElement('div')
    menu.setAttribute('role', 'menu')
    const item = document.createElement('div')
    item.setAttribute('role', 'menuitem')
    item.tabIndex = -1
    menu.append(item)
    document.body.append(menu)

    try {
      expect(shouldIgnorePlaybackHotkey(spaceOn(item), item)).toBe(true)
      expect(shouldIgnorePlaybackHotkey(spaceOn(document.body, true), document.body)).toBe(true)
    } finally {
      menu.remove()
    }
  })
})
