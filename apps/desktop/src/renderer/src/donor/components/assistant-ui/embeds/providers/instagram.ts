/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/assistant-ui/embeds/providers/instagram.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { bareHost, type EmbedMatcher } from './types'

export const instagram: EmbedMatcher = url => {
  if (bareHost(url.hostname) !== 'instagram.com') {
    return null
  }

  const [typeRaw, code] = url.pathname.split('/').filter(Boolean)
  const type = typeRaw === 'reels' ? 'reel' : typeRaw

  if (!code || !['p', 'reel', 'tv'].includes(type || '') || !/^[A-Za-z0-9_-]+$/.test(code)) {
    return null
  }

  return {
    embedUrl: `https://www.instagram.com/${type}/${code}/embed`,
    // Placeholder height until the embed page reports its own (social-embed.tsx).
    height: 450,
    id: `instagram:${code}`,
    label: 'Instagram',
    maxWidth: 400,
    provider: 'instagram',
    renderer: 'frame',
    sourceUrl: url.toString()
  }
}
