/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/model-visibility-overlay.tsx
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { useStore } from '@nanostores/react'

import { ModelVisibilityDialog } from '@/components/model-visibility-dialog'
import type { HermesGateway } from '@/hermes'
import { $modelVisibilityOpen, setModelVisibilityOpen } from '@/store/model-visibility'
import { $activeSessionId, $gatewayState } from '@/store/session'

interface ModelVisibilityOverlayProps {
  gateway?: HermesGateway
  onOpenProviders: () => void
  ownerConnectionId?: string
  profile: string
}

export function ModelVisibilityOverlay({
  gateway,
  onOpenProviders,
  ownerConnectionId,
  profile
}: ModelVisibilityOverlayProps) {
  const activeSessionId = useStore($activeSessionId)
  const gatewayOpen = useStore($gatewayState) === 'open'
  const open = useStore($modelVisibilityOpen)

  if (!gatewayOpen) {
    return null
  }

  return (
    <ModelVisibilityDialog
      gw={gateway}
      onOpenChange={setModelVisibilityOpen}
      onOpenProviders={onOpenProviders}
      open={open}
      ownerConnectionId={ownerConnectionId}
      profile={profile}
      sessionId={activeSessionId}
    />
  )
}
