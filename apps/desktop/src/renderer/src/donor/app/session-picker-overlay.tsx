/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/session-picker-overlay.tsx
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { useStore } from '@nanostores/react'

import { SessionPickerDialog } from '@/components/session-picker'
import { completeFlow } from '@/store/desktop-metrics'
import { $gatewayState, $selectedStoredSessionId, $sessionPickerOpen, setSessionPickerOpen } from '@/store/session'

interface SessionPickerOverlayProps {
  onResume: (storedSessionId: string) => void
}

/**
 * Mounts the session picker that `/resume` (and `/sessions`, `/switch`) opens —
 * the desktop equivalent of the TUI's sessions overlay. Resuming runs through
 * the same `resumeSession` path the sidebar uses.
 */
export function SessionPickerOverlay({ onResume }: SessionPickerOverlayProps) {
  const open = useStore($sessionPickerOpen)
  const gatewayOpen = useStore($gatewayState) === 'open'
  const activeStoredSessionId = useStore($selectedStoredSessionId)

  if (!gatewayOpen) {
    return null
  }

  return (
    <SessionPickerDialog
      activeStoredSessionId={activeStoredSessionId}
      onOpenChange={setSessionPickerOpen}
      onResume={(...args: Parameters<typeof onResume>) => {
        completeFlow('session_picker')

        return onResume(...args)
      }}
      open={open}
    />
  )
}
