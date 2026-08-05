/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/assistant-ui/ansi-text.tsx
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
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
