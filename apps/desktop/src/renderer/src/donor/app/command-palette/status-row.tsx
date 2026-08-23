/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/command-palette/status-row.tsx
 * Commit:  fcbd1076a93841fa88855acce810e342a5b78101 (v2026.8.19)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type React from 'react'

import { cn } from '@/lib/utils'

/** Centered loading / empty / error row for a Cmd-K page's result list. */
export function StatusRow({ icon, text, tone }: { icon?: React.ReactNode; text: string; tone?: 'error' }) {
  return (
    <div
      className={cn(
        'flex items-center justify-center gap-2 px-2 py-6 text-xs',
        tone === 'error' ? 'text-(--ui-red)' : 'text-muted-foreground'
      )}
    >
      {icon}
      {text}
    </div>
  )
}
