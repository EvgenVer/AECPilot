/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/platform-status.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { StatusTone } from '@/components/status-dot'

// One reading of a messaging platform's runtime state, shared by the Messaging
// page and the gateway menu so the same bot never shows two different tones.
// Anything enabled that isn't connected or failed (connecting, retrying,
// restart needed, gateway stopped, needs setup) is waiting on something: warn.
const STATE_TONE: Record<string, StatusTone> = {
  connected: 'good',
  disabled: 'muted',
  fatal: 'bad',
  startup_failed: 'bad'
}

interface PlatformStatusInput {
  enabled?: boolean
  state?: null | string
}

export function platformStatusTone({ enabled = true, state }: PlatformStatusInput): StatusTone {
  if (!enabled) {
    return 'muted'
  }

  return (state && STATE_TONE[state]) || 'warn'
}
