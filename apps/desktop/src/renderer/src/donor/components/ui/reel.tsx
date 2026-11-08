/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/ui/reel.tsx
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

/** One row that scrolls sideways, snapping each child to the start edge.
 *  Children keep their own width; set it from the caller (`*:w-68`). */
export function Reel({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      {...props}
      className={cn(
        'flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-2 *:shrink-0 *:snap-start',
        className
      )}
      data-slot="reel"
    />
  )
}
