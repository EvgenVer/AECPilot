/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/embed-consent.ts
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { type Codec, Codecs, persistentAtom } from '@/lib/persisted'

// Privacy gate for inline embeds. Loading an embed reaches out to a third party
// (IP, referrer, cookies), so by default we render a placeholder until the user
// consents — per embed ("Load once") or per service ("Always allow YouTube").
// Mirrors the tool-approval model, but purely client-side (the renderer is what
// makes the request) so it never touches the gateway/config.yaml.
export type EmbedMode = 'always' | 'ask' | 'off'

const MODE_KEY = 'hermes.desktop.embed-mode'
const ALLOWED_KEY = 'hermes.desktop.embed-allowed'

const modeCodec: Codec<EmbedMode> = {
  decode: raw => (raw === 'always' || raw === 'off' ? raw : 'ask'),
  encode: value => value
}

/** Global default: ask (placeholder), always (auto-load), off (plain link). */
export const $embedMode = persistentAtom<EmbedMode>(MODE_KEY, 'ask', modeCodec)
/** Providers granted a standing "always allow" (e.g. `youtube`, `twitter`). */
export const $embedAllowed = persistentAtom<string[]>(ALLOWED_KEY, [], Codecs.stringArray)

export function allowProvider(provider: string) {
  const current = $embedAllowed.get()

  if (!current.includes(provider)) {
    $embedAllowed.set([...current, provider])
  }
}

export function setEmbedMode(mode: EmbedMode) {
  $embedMode.set(mode)
}

export function clearEmbedAllowed() {
  $embedAllowed.set([])
}
