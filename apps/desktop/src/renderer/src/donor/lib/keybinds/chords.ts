/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/keybinds/chords.ts
 * Commit:  5fc308a70719a83cccdbba4c0e39c23f5a8239d5 (v2026.8.27)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { isMacPlatform } from '@/lib/platform'

/**
 * True when the event is the ⌘/Ctrl+L chord (no shift). The chord routes
 * input to the composer: a terminal or preview selection goes in as context,
 * and a bare press moves focus. The priority ladder between those consumers
 * lives in app/chat/composer/focus-chord.ts.
 */
export function isComposerChord(event: KeyboardEvent): boolean {
  const mod = isMacPlatform() ? event.metaKey : event.ctrlKey

  return mod && !event.shiftKey && event.key.toLowerCase() === 'l'
}
