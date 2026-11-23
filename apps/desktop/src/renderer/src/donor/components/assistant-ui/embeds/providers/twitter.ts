/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/assistant-ui/embeds/providers/twitter.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { bareHost, type EmbedMatcher } from './types'

export const twitter: EmbedMatcher = url => {
  const host = bareHost(url.hostname)

  if (host !== 'twitter.com' && host !== 'x.com') {
    return null
  }

  const segments = url.pathname.split('/').filter(Boolean)
  const statusIndex = segments.indexOf('status')
  const id = statusIndex >= 0 ? segments[statusIndex + 1] : ''

  if (!/^\d+$/.test(id || '')) {
    return null
  }

  return {
    id: `twitter:${id}`,
    label: 'X',
    maxWidth: 480,
    provider: 'twitter',
    renderer: 'tweet',
    sourceUrl: url.toString(),
    tweetId: id
  }
}
