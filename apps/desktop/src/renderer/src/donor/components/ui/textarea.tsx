/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/ui/textarea.tsx
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import * as React from 'react'

import { cn } from '@/lib/utils'

import { type ControlVariantProps, controlVariants } from './control'

function Textarea({ className, size, ...props }: React.ComponentProps<'textarea'> & ControlVariantProps) {
  return (
    <textarea
      // Off by default for every consumer — these are code/config/prompt fields,
      // not prose. Callers can re-enable per-instance by passing the prop.
      autoCapitalize="off"
      autoComplete="off"
      autoCorrect="off"
      className={cn(controlVariants({ size }), 'min-h-16', className)}
      data-slot="textarea"
      spellCheck={false}
      {...props}
    />
  )
}

export { Textarea }
