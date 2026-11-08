/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/chat/stable-text.tsx
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { cn } from '@/lib/utils'

interface StableTextProps {
  'aria-hidden'?: boolean
  children: string
  className?: string
}

/**
 * Renders text as a row of 1ch-wide cells so individual characters can't
 * shift the layout as they change (e.g. digits in a ticking timer).
 * Works with any proportional font — no need for font-mono.
 */
export function StableText({ 'aria-hidden': ariaHidden, children, className }: StableTextProps) {
  return (
    <span aria-hidden={ariaHidden} className={cn('inline-flex', className)}>
      {children.split('').map((char, i) => (
        <span className="inline-block w-[1ch] text-center" key={i}>
          {char}
        </span>
      ))}
    </span>
  )
}
