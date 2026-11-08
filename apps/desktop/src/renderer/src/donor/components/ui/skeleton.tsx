/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/ui/skeleton.tsx
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('animate-pulse rounded-md bg-accent', className)} data-slot="skeleton" {...props} />
}

/** Inline pulsing chip standing in for a small count/badge while it loads. */
function CountSkeleton({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn('inline-block h-2 w-3.5 translate-y-px animate-pulse rounded-sm bg-current/25', className)}
      data-slot="count-skeleton"
      {...props}
    />
  )
}

export { CountSkeleton, Skeleton }
