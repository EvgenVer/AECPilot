/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/assistant-ui/embeds/providers/index.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { instagram } from './instagram'
import { maps } from './maps'
import { pinterest } from './pinterest'
import { spotify } from './spotify'
import { tiktok } from './tiktok'
import { twitter } from './twitter'
import type { EmbedDescriptor, EmbedMatcher } from './types'
import { vimeo } from './vimeo'
import { youtube } from './youtube'

export type { EmbedDescriptor, EmbedProvider, EmbedRenderer, FrameEmbed, TweetEmbed } from './types'

// All provider hosts are disjoint, so order is irrelevant — first match wins.
const MATCHERS: EmbedMatcher[] = [youtube, vimeo, instagram, pinterest, tiktok, twitter, spotify, maps]

function parseUrl(raw: string): URL | null {
  try {
    const url = new URL(raw)

    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

/**
 * Resolve a URL to a rich-embed descriptor, or null when no provider matches.
 * Pure and synchronous — safe to call during render.
 */
export function detectEmbed(rawUrl: string | null | undefined): EmbedDescriptor | null {
  if (!rawUrl) {
    return null
  }

  const url = parseUrl(rawUrl)

  if (!url) {
    return null
  }

  for (const match of MATCHERS) {
    const descriptor = match(url)

    if (descriptor) {
      return descriptor
    }
  }

  return null
}

export function isEmbeddableUrl(rawUrl: string | null | undefined): boolean {
  return detectEmbed(rawUrl) !== null
}
