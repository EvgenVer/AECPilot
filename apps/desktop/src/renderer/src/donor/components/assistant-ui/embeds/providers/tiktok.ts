/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/assistant-ui/embeds/providers/tiktok.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { bareHost, type EmbedMatcher } from './types'

export const tiktok: EmbedMatcher = url => {
  if (bareHost(url.hostname) !== 'tiktok.com') {
    return null
  }

  const segments = url.pathname.split('/').filter(Boolean)
  const videoIndex = segments.indexOf('video')
  const id = videoIndex >= 0 ? segments[videoIndex + 1] : ''

  if (!/^\d+$/.test(id || '')) {
    return null
  }

  return {
    // The official player is a clean dark video iframe (no white blockquote
    // chrome), so it goes through the plain-iframe frame path, sized 9:16.
    aspectRatio: 9 / 16,
    embedUrl: `https://www.tiktok.com/player/v1/${id}`,
    id: `tiktok:${id}`,
    label: 'TikTok',
    maxWidth: 365,
    provider: 'tiktok',
    renderer: 'frame',
    sourceUrl: url.toString()
  }
}
