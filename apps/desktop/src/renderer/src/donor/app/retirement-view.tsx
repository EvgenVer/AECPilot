/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/retirement-view.tsx
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { type ReactElement } from 'react'

import { Button } from '@/components/ui/button'
import { DialogDescription, DialogTitle } from '@/components/ui/dialog'
import type { DesktopUpdateStatus } from '@/global'
import { useI18n } from '@/i18n'

/**
 * The discontinued tier of retirement: a suffixed-identity build (canary /
 * one-off / debug branch) whose channel has closed. There is nothing to
 * download or migrate — the user uninstalls. Rendered inside the updates
 * dialog; dismissal persists per retired-channel revision so it does not nag
 * on every check.
 */
export function DiscontinuedNotice({
  retirement,
  onDismiss
}: {
  retirement: NonNullable<DesktopUpdateStatus['retirement']>
  onDismiss: () => void
}): ReactElement {
  const { t } = useI18n()

  return (
    <div className="space-y-4 p-6">
      <DialogTitle>{t.updates.discontinuedTitle}</DialogTitle>
      <DialogDescription>{t.updates.discontinuedBody}</DialogDescription>
      <div className="flex justify-end">
        <Button onClick={onDismiss} variant="text">
          {t.updates.maybeLater}
        </Button>
      </div>
    </div>
  )
}
