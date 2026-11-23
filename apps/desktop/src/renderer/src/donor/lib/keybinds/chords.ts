/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/keybinds/chords.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
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
