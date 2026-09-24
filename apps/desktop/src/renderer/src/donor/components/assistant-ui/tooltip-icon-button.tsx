/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/assistant-ui/tooltip-icon-button.tsx
 * Commit:  f97608f178d1ffeca59860195ab7da295f7c8e5f (v2026.9.24)
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
