/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/assistant-ui/ansi-text.tsx
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { memo, useMemo } from 'react'

import { ansiColorClass, hasAnsiCodes, parseAnsi } from '@/lib/ansi'
import { cn } from '@/lib/utils'

interface AnsiTextProps {
  text: string
  className?: string
}

/** Renders text with embedded ANSI SGR codes as colored / bold spans. Falls
 *  back to a plain string node when no codes are present so the parser cost
 *  is paid only when there's something to colorize. */
export const AnsiText = memo(({ className, text }: AnsiTextProps) => {
  const segments = useMemo(() => (hasAnsiCodes(text) ? parseAnsi(text) : null), [text])

  if (!segments) {
    return <span className={className}>{text}</span>
  }

  return (
    <span className={className}>
      {segments.map((segment, index) => (
        <span
          className={cn(segment.bold && 'font-semibold', segment.fg && ansiColorClass(segment.fg))}
          key={`ansi-${index}`}
        >
          {segment.text}
        </span>
      ))}
    </span>
  )
})
