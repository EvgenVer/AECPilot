/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/assistant-ui/embeds/spotify-embed.tsx
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
'use client'

import { type CSSProperties, useMemo } from 'react'

import type { FrameEmbed } from './providers/types'
import { useIsDark } from './use-is-dark'

const ALLOW = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture'

// Spotify paints a white backdrop behind its card; theme=0 gives the dark
// player and the card wrapper's overflow-hidden clips the corners.
function spotifySrc(embedUrl: string, isDark: boolean): string {
  const url = new URL(embedUrl)

  url.searchParams.set('utm_source', 'generator')

  if (isDark) {
    url.searchParams.set('theme', '0')
  }

  return url.toString()
}

export default function SpotifyEmbedRenderer({ descriptor }: { descriptor: FrameEmbed }) {
  const isDark = useIsDark()
  const src = useMemo(() => spotifySrc(descriptor.embedUrl, isDark), [descriptor.embedUrl, isDark])

  // Match the iframe's own (light) scheme — a `dark` mismatch makes the browser
  // paint an opaque white Canvas behind it. theme=0 still gives the dark player.
  const style: CSSProperties = {
    colorScheme: 'light',
    height: descriptor.height
  }

  return (
    <iframe
      allow={ALLOW}
      className="block w-full border-0 bg-transparent"
      loading="lazy"
      src={src}
      style={style}
      title="Spotify embed"
    />
  )
}
