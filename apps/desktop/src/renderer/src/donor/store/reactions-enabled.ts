/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/reactions-enabled.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/**
 * Message reactions (iMessage-style tapbacks) — opt-in.
 *
 * Off by default: reactions add affordances to every message row (the ☺ slot,
 * right-click pickers, :shortcode: completions), and the agent gains a tool
 * that reacts to your messages. Presentation-scoped, so the renderer owns it
 * (desktop AGENTS.md: state lives with its authority).
 *
 * Gates the UI only — persisted reactions still render if the data exists
 * (a reaction you set before turning it off shouldn't vanish from history).
 */

import { atom } from 'nanostores'

import { persistString, storedString } from '@/lib/storage'
import { mirrorDisplayToggle } from '@/store/display-toggles'

import { recordFeatureToggle } from './desktop-metrics'

const KEY = 'hermes.desktop.reactions.v1'

export const $reactionsEnabled = atom<boolean>(typeof window === 'undefined' ? false : storedString(KEY) === 'on')

export function setReactionsEnabled(enabled: boolean): void {
  recordFeatureToggle('reactions', $reactionsEnabled.get(), enabled)
  $reactionsEnabled.set(enabled)
}

if (typeof window !== 'undefined') {
  $reactionsEnabled.listen(enabled => persistString(KEY, enabled ? 'on' : 'off'))
}

// The backend gates the agent's react_to_message tool and the model-context
// annotation on display.message_reactions, so this toggle is the one lever.
mirrorDisplayToggle('display.message_reactions', KEY, $reactionsEnabled)
