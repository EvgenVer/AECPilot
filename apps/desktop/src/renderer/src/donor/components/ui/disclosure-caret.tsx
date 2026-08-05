/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/ui/disclosure-caret.tsx
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { Codicon, type CodiconProps } from '@/components/ui/codicon'
import { cn } from '@/lib/utils'

interface DisclosureCaretProps extends Omit<CodiconProps, 'name'> {
  open: boolean
}

// Chrome caret for collapsible sections: points right when closed (▶),
// rotates to point down (▼) when open. Override `className` to layer
// hover/opacity styling; twMerge resolves transition conflicts.
export function DisclosureCaret({ className, open, size = '0.75rem', ...props }: DisclosureCaretProps) {
  return (
    <Codicon
      className={cn('shrink-0 transition-transform duration-150', open && 'rotate-90', className)}
      name="chevron-right"
      size={size}
      {...props}
    />
  )
}
