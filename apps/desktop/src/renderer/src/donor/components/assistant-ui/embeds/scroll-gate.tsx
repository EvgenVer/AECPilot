/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/assistant-ui/embeds/scroll-gate.tsx
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
'use client'

import { useEffect, useState } from 'react'

import { cn } from '@/lib/utils'

/** Block wheel until ⌘/Ctrl so map embeds don't hijack transcript scroll. */
export function ScrollGate() {
  const [active, setActive] = useState(false)

  useEffect(() => {
    const sync = (event: KeyboardEvent) => setActive(event.metaKey || event.ctrlKey)
    const clear = () => setActive(false)

    window.addEventListener('keydown', sync)
    window.addEventListener('keyup', sync)
    window.addEventListener('blur', clear)

    return () => {
      window.removeEventListener('keydown', sync)
      window.removeEventListener('keyup', sync)
      window.removeEventListener('blur', clear)
    }
  }, [])

  return (
    <div className={cn('group/gate absolute inset-0', active ? 'pointer-events-none' : 'pointer-events-auto')}>
      <span className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[0.625rem] font-medium text-white opacity-0 transition-opacity group-hover/embed:opacity-100">
        Hold ⌘ to zoom
      </span>
    </div>
  )
}
