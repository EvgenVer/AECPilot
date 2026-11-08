/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/shell/titlebar-icon.tsx
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { Codicon } from '@/components/ui/codicon'
import { cn } from '@/lib/utils'

import { titlebarIconSizeCss } from './titlebar'

/** Titlebar-cluster glyph — 13.9px inline (see titlebarIconSizeCss). */
export function TitlebarIcon({
  className,
  name,
  size = titlebarIconSizeCss(),
  spinning
}: {
  className?: string
  name: string
  size?: number | string
  spinning?: boolean
}) {
  return <Codicon className={cn('leading-none', className)} name={name} size={size} spinning={spinning} />
}
