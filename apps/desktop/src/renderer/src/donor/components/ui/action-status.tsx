/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/ui/action-status.tsx
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { ReactNode } from 'react'

import { Check, Loader2 } from '@/lib/icons'

// idle → saving → done label+icon for action buttons (create / rename / delete…).
export function ActionStatus({
  state,
  idle,
  busy,
  done,
  idleIcon = null
}: {
  state: 'done' | 'idle' | 'saving'
  idle: string
  busy: string
  done: string
  idleIcon?: ReactNode
}) {
  return (
    <>
      {state === 'saving' ? <Loader2 className="animate-spin" /> : state === 'done' ? <Check /> : idleIcon}
      {state === 'saving' ? busy : state === 'done' ? done : idle}
    </>
  )
}
