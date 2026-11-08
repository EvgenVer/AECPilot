/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/assistant-ui/tooltip-icon-button.tsx
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
'use client'

import { type ComponentPropsWithRef, forwardRef } from 'react'

import { Button } from '@/components/ui/button'
import { Tip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export interface TooltipIconButtonProps extends ComponentPropsWithRef<typeof Button> {
  tooltip: string
  side?: 'top' | 'bottom' | 'left' | 'right'
}

export const TooltipIconButton = forwardRef<HTMLButtonElement, TooltipIconButtonProps>(
  ({ children, tooltip, side, className, ...rest }, ref) => {
    return (
      <Tip label={tooltip} side={side}>
        <Button
          size="icon-xs"
          variant="ghost"
          {...rest}
          aria-label={tooltip}
          className={cn('aui-button-icon', className)}
          ref={ref}
        >
          {children}
        </Button>
      </Tip>
    )
  }
)

TooltipIconButton.displayName = 'TooltipIconButton'
