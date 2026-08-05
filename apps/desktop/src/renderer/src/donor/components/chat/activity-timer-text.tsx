/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/chat/activity-timer-text.tsx
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { cn } from '@/lib/utils'

import { formatElapsed } from './activity-timer'
import { StableText } from './stable-text'

interface ActivityTimerTextProps {
  seconds: number
  className?: string
}

export function ActivityTimerText({ seconds, className }: ActivityTimerTextProps) {
  return (
    <StableText
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
