/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/chat/activity-timer-text.tsx
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { cn } from '@/lib/utils'

import { formatElapsed } from './activity-timer'
import { StableText } from './stable-text'

interface ActivityTimerTextProps {
  'aria-hidden'?: boolean
  seconds: number
  className?: string
}

export function ActivityTimerText({ 'aria-hidden': ariaHidden, seconds, className }: ActivityTimerTextProps) {
  return (
    <StableText
      aria-hidden={ariaHidden}
      className={cn(
        // Tinted with --dt-midground (very low alpha) so the timer reads
        // as part of the same "live signal" cluster as the dither block /
        // arc-border / working-session dot, instead of being neutral chrome.
        'shrink-0 text-[0.56rem] leading-none tracking-[0.02em] text-midground/55',
        className
      )}
    >
      {formatElapsed(seconds)}
    </StableText>
  )
}
