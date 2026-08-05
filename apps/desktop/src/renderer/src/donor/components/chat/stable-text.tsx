/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/chat/stable-text.tsx
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { cn } from '@/lib/utils'

interface StableTextProps {
  children: string
  className?: string
}

/**
 * Renders text as a row of 1ch-wide cells so individual characters can't
 * shift the layout as they change (e.g. digits in a ticking timer).
 * Works with any proportional font — no need for font-mono.
 */
export function StableText({ children, className }: StableTextProps) {
  return (
    <span className={cn('inline-flex', className)}>
      {children.split('').map((char, i) => (
        <span className="inline-block w-[1ch] text-center" key={i}>
          {char}
        </span>
      ))}
    </span>
  )
}
