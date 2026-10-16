/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/settings/update-channel-row.tsx
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { useStore } from '@nanostores/react'
import { type ReactElement, useState } from 'react'

import { SegmentedControl } from '@/components/ui/segmented-control'
import { useI18n } from '@/i18n'
import { triggerHaptic } from '@/lib/haptics'
import { confirm } from '@/store/confirm'
import { notifyError } from '@/store/notifications'
import {
  $updateChecking,
  $updateStatus,
  checkUpdates,
  setUpdateChannel,
  type SourceUpdateChannel,
  sourceUpdateChannel
} from '@/store/updates'

import { ListRow } from './primitives'

/**
 * Stable releases vs every commit on main, for a source checkout. Packaged
 * installs (Store, MSIX, bundled) bake their channel and never render this.
 */
export function UpdateChannelRow(): ReactElement | null {
  const { t } = useI18n()
  const a = t.settings.about.channel
  const status = useStore($updateStatus)
  const checking = useStore($updateChecking)
  // The confirmed choice paints at once; the check that follows the save can be slow.
  const [pending, setPending] = useState<SourceUpdateChannel | null>(null)
  const saved = sourceUpdateChannel(status)
  const channel = pending ?? saved

  if (channel === null) {
    return null
  }

  const change = async (next: SourceUpdateChannel): Promise<void> => {
    if (next === channel) {
      return
    }

    // Main → stable can land on an older commit than the one running now.
    if (
      next === 'stable' &&
      !(await confirm({
        title: a.stableConfirmTitle,
        description: a.stableConfirmBody,
        confirmLabel: a.stableConfirm
      }))
    ) {
      return
    }

    triggerHaptic('crisp')
    setPending(next)

    try {
      await setUpdateChannel(next)
    } catch (error) {
      // A throw may still follow a save, so re-read the install instead of guessing.
      notifyError(error, a.failed)
      void checkUpdates()
    } finally {
      setPending(null)
    }
  }

  return (
    <ListRow
      action={
        <SegmentedControl
          disabled={checking || pending !== null}
          onChange={id => void change(id)}
          options={[
            { id: 'stable', label: a.stable },
            { id: 'main', label: a.main }
          ]}
          value={channel}
        />
      }
      description={a.description}
      title={a.title}
    />
  )
}
