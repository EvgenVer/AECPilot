/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/chat/status-dismiss-button.tsx
 * Commit:  f97608f178d1ffeca59860195ab7da295f7c8e5f (v2026.9.24)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'

interface StatusDismissButtonProps {
  label: string
  onDismiss: () => void
}

/** The leading close control shared by artifacts, background work and queued prompts. */
export function StatusDismissButton({ label, onDismiss }: StatusDismissButtonProps) {
  return (
    <Button
      aria-label={label}
      className="status-dismiss-button text-muted-foreground/60 hover:text-foreground/90"
      data-slot="status-dismiss"
      onClick={event => {
        event.stopPropagation()
        onDismiss()
      }}
      onKeyDown={event => event.stopPropagation()}
      size="icon-xs"
      type="button"
      variant="ghost"
    >
      <Codicon name="close" size="0.8rem" />
    </Button>
  )
}
