/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/status-dot.tsx
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { ComponentProps } from 'react'
import { memo } from 'react'

import { cn } from '@/lib/utils'

export type StatusTone = 'good' | 'muted' | 'warn' | 'bad'

const TONE_BG: Record<StatusTone, string> = {
  good: 'bg-primary',
  muted: 'bg-muted-foreground/40',
  warn: 'bg-amber-500',
  bad: 'bg-destructive'
}

interface StatusDotProps extends ComponentProps<'span'> {
  tone: StatusTone
}

export const StatusDot = memo(function StatusDot({ className, tone, ...props }: StatusDotProps) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block size-1.5 rounded-full', TONE_BG[tone], className)}
      {...props}
    />
  )
})
