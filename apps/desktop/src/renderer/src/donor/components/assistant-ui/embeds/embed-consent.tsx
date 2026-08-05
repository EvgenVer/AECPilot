/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/assistant-ui/embeds/embed-consent.tsx
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
'use client'

import { type CSSProperties, useState } from 'react'

import { SplitButton } from '@/components/ui/split-button'
import { Play } from '@/lib/icons'
import { allowProvider } from '@/store/embed-consent'

import type { EmbedDescriptor } from './providers/types'

// Privacy placeholder shown before an embed reaches out to a third party. Sized
// to the embed's footprint (no layout shift). The split control mirrors the
// commit button: primary "Load" (this embed) with a caret for "Always allow
// <service>" (persisted). Global off lives in Appearance settings.
export function EmbedFacade({ descriptor, onLoad }: { descriptor: EmbedDescriptor; onLoad: () => void }) {
  const [choice, setChoice] = useState('once')

  const style: CSSProperties = descriptor.aspectRatio
    ? { aspectRatio: descriptor.aspectRatio }
    : { height: descriptor.height ?? 320 }

  const actions = [
    { id: 'once', label: `Load ${descriptor.label}` },
    { id: 'always', label: `Always allow ${descriptor.label}` }
  ]

  return (
    <span
      className="flex size-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary)/30"
      style={style}
    >
      <SplitButton
        actions={actions}
        onTrigger={id => (id === 'always' ? allowProvider(descriptor.provider) : onLoad())}
        onValueChange={setChoice}
        primaryIcon={<Play className="size-3 translate-x-px fill-current" />}
        value={choice}
      />
      <span className="text-[0.6875rem] text-(--ui-text-tertiary)">{hostOf(descriptor)}</span>
    </span>
  )
}

function hostOf(descriptor: EmbedDescriptor): string {
  // x.com posts often arrive as twitter.com links — show the current brand.
  if (descriptor.provider === 'twitter') {
    return 'x.com'
  }

  try {
    return new URL(descriptor.sourceUrl).hostname.replace(/^www\./, '')
  } catch {
    return descriptor.label
  }
}
