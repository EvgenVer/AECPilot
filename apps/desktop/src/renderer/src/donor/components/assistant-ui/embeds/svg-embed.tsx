/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/assistant-ui/embeds/svg-embed.tsx
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
'use client'

import DOMPurify from 'dompurify'
import { useMemo } from 'react'

import type { RichFenceProps } from './types'

// Lazy chunk (pulls in DOMPurify). Renders a ```svg fence as an image after
// hard-sanitising it: the svg profile strips scripts, event handlers, and
// foreignObject, so untrusted model output can't execute.
export default function SvgRenderer({ code }: RichFenceProps) {
  const clean = useMemo(
    () =>
      DOMPurify.sanitize(code, {
        USE_PROFILES: { svg: true, svgFilters: true }
      }),
    [code]
  )

  if (!clean.trim()) {
    return null
  }

  // Left-aligned, capped on both axes so a large intrinsic SVG scales down
  // (preserving ratio) instead of filling the column or centering.
  return (
    <div
      className="my-2 [&_svg]:block [&_svg]:h-auto [&_svg]:w-auto [&_svg]:max-h-[33dvh] [&_svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  )
}
