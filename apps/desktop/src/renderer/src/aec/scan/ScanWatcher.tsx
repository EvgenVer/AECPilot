// Change detection, surfaced (task 1.15, now 1.8.18): our indexer rescans the
// connected sources on an interval and main broadcasts what moved. This turns
// that report into one of their notifications.
//
// It renders nothing — it is a subscription with a UI side effect, mounted once
// next to the app. The rule it must not break comes from
// specs/workspace-sources.md § "Детект изменений": a scan where every source is
// unchanged says NOTHING. A toast on every cycle would train the user to
// dismiss the one that matters.

import { useEffect } from 'react'

import { notify } from '../../donor/store/notifications'
import { useAecT } from '../../shared/i18n'

import { buildScanNotification, type SourceChangeSummary } from './scan-notification-pure'

/** "12 added, 3 changed, 1 deleted" — only the non-zero parts. */
function summarize(
  source: SourceChangeSummary,
  t: (key: string, ...args: unknown[]) => string
): string {
  const parts: string[] = []
  if (source.added.length) parts.push(t('scan.added', source.added.length))
  if (source.changed.length) parts.push(t('scan.changed', source.changed.length))
  if (source.deleted.length) parts.push(t('scan.deleted', source.deleted.length))
  if (source.unavailable) parts.push(t('sources.unavailable'))
  return `${source.label}: ${parts.join(', ')}`
}

export function ScanWatcher() {
  const t = useAecT()

  useEffect(() => {
    return window.aecpilot.onScanReport((envelope) => {
      const model = buildScanNotification(envelope.report)
      if (!model) return

      // A scan is tagged with the vault it STARTED against. One that finishes
      // after the user has switched projects would otherwise report project
      // A's changes over project B's screen.
      void window.aecpilot.getCurrentProject().then((project) => {
        if (!project || project.vaultPath !== envelope.vaultPath) return

        notify({
          kind: 'info',
          icon: 'search',
          title: t('scan.title'),
          message: model.sources.map((source) => summarize(source, t)).join('\n')
        })
      })
    })
  }, [t])

  return null
}
