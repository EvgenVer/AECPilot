/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/cron/run-stop-action.tsx
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { Translations } from '@/i18n'

import { PanelAction } from '../overlays/panel'

/** Job header Stop for a live run; not gated on `busy`, which this window's own Run-now holds. */
export function RunStopAction({
  c,
  onStop,
  runLive,
  stopping
}: {
  c: Translations['cron']
  onStop: () => void
  runLive: boolean
  stopping: boolean
}) {
  if (!runLive && !stopping) {
    return null
  }

  return (
    <PanelAction disabled={stopping} icon={stopping ? 'loading' : 'debug-stop'} onClick={onStop} spinning={stopping}>
      {stopping ? c.control.stopping : c.control.stop}
    </PanelAction>
  )
}

/** Why the newest attempt was stopped, under the job's metadata; hidden while a run is live. */
export function LastCancelledNote({ c, reason }: { c: Translations['cron']; reason: null | string }) {
  if (reason === null) {
    return null
  }

  return (
    <p className="text-[0.7rem] text-muted-foreground" data-slot="cron-last-cancelled">
      {c.control.lastCancelled(reason)}
    </p>
  )
}
