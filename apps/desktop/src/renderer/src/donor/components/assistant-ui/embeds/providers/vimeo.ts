/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/assistant-ui/embeds/providers/vimeo.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { bareHost, type EmbedMatcher } from './types'

export const vimeo: EmbedMatcher = url => {
  const host = bareHost(url.hostname)

  if (host !== 'vimeo.com' && host !== 'player.vimeo.com') {
    return null
  }

  // The clip id is the last all-digits segment, covering vimeo.com/123,
  // /channels/x/123, /groups/x/videos/123, and player/video/123.
  const id = url.pathname
    .split('/')
    .filter(Boolean)
    .reverse()
    .find(segment => /^\d+$/.test(segment))

  if (!id) {
    return null
  }

  return {
    aspectRatio: 16 / 9,
    embedUrl: `https://player.vimeo.com/video/${id}`,
    id: `vimeo:${id}`,
    label: 'Vimeo',
    maxWidth: 640,
    provider: 'vimeo',
    renderer: 'frame',
    sourceUrl: url.toString()
  }
}
