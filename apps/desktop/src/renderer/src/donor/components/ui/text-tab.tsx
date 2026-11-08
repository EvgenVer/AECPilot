/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/ui/text-tab.tsx
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import * as React from 'react'

import { cn } from '@/lib/utils'

function TextTabMeta({ className, ...props }: React.ComponentProps<'span'>) {
  return <span className={cn('text-[0.72em] font-normal text-(--ui-text-tertiary)', className)} {...props} />
}

interface TextTabProps extends React.ComponentProps<'button'> {
  active?: boolean
}

function TextTab({ active = false, children, className, type = 'button', ...props }: TextTabProps) {
  return (
    <button
      className={cn(
        'group/text-tab inline-flex h-7 items-center gap-1 bg-transparent px-1 text-[length:var(--conversation-caption-font-size)] font-medium text-(--ui-text-tertiary) transition-colors hover:bg-transparent hover:text-foreground focus-visible:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-sidebar-ring disabled:pointer-events-none disabled:opacity-50',
        active && 'text-foreground',
        className
      )}
      data-active={active}
      type={type}
      {...props}
    >
      {React.Children.map(children, child =>
        React.isValidElement(child) && child.type === TextTabMeta ? (
          child
        ) : (
          <span
            className={cn(
              'underline-offset-4 decoration-current/25',
              active ? 'underline' : 'group-hover/text-tab:underline'
            )}
          >
            {child}
          </span>
        )
      )}
    </button>
  )
}

export { TextTab, TextTabMeta }
