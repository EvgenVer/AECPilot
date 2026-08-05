/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/assistant-ui/embeds/providers/pinterest.ts
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { bareHost, type EmbedMatcher } from './types'

export const pinterest: EmbedMatcher = url => {
  // Pinterest runs many locale TLDs (pinterest.co.uk, fr.pinterest.com, ...).
  if (!bareHost(url.hostname).includes('pinterest.')) {
    return null
  }

  const segments = url.pathname.split('/').filter(Boolean)

  if (segments[0] !== 'pin' || !/^\d+$/.test(segments[1] || '')) {
    return null
  }

  const id = segments[1]

  return {
    embedUrl: `https://assets.pinterest.com/ext/embed.html?id=${id}`,
    // Pinterest's "small" pin size — the default card is too dominant inline.
    height: 380,
    id: `pinterest:${id}`,
    label: 'Pinterest',
    maxWidth: 236,
    provider: 'pinterest',
    renderer: 'frame',
    sourceUrl: url.toString()
  }
}
