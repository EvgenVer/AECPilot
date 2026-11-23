/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/ui/log-view.tsx
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

// Shared raw-log viewer: no bg, hairline border, tight padding, small mono.
// One style everywhere we surface logs. Pass a max-h-* via className.
// Selectable by default — logs exist to be read and copied.
export function LogView({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'overflow-auto rounded-lg border border-(--ui-stroke-tertiary) px-2.5 py-1.5 font-mono text-[0.6875rem] leading-[1.5] whitespace-pre-wrap break-words text-(--ui-text-tertiary)',
        className
      )}
      data-selectable-text="true"
      {...props}
    />
  )
}
