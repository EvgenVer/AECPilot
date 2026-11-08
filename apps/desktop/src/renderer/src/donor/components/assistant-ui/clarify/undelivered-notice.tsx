/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/assistant-ui/clarify/undelivered-notice.tsx
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
'use client'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { useI18n } from '@/i18n'
import { AlertTriangle } from '@/lib/icons'

/** Heads a card whose request never reached this window: nothing on it can
 *  answer, so say so and point at the way out instead of a silent wait. */
export function UndeliveredNotice() {
  const { t } = useI18n()

  return (
    <Alert className="gap-x-2 px-3 py-2 text-xs" role="status" variant="warning">
      <AlertTriangle />
      <AlertDescription>{t.assistant.clarify.notDelivered}</AlertDescription>
    </Alert>
  )
}
