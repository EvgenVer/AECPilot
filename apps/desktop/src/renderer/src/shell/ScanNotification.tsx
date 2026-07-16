import { useEffect, useState } from 'react'
import type { OpenProject, ScanReportEnvelope } from '../../../shared/ipc'
import { buildScanNotification, type ScanNotificationModel } from './scan-notification-pure'

// Long added/changed/deleted lists must not blow up the notification (brief,
// task 1.15) — only the first few paths of each group show up front, the
// rest behind an "и ещё N" toggle.
const MAX_LIST_ITEMS = 5

function FileGroup({ label, paths }: { label: string; paths: string[] }) {
  const [expanded, setExpanded] = useState(false)
  if (paths.length === 0) return null
  const shown = expanded ? paths : paths.slice(0, MAX_LIST_ITEMS)
  const hiddenCount = paths.length - shown.length

  return (
    <div className="scan-notification__group">
      <div className="scan-notification__group-label">
        {label} ({paths.length})
      </div>
      <ul className="scan-notification__file-list">
        {shown.map((path) => (
          <li key={path} className="scan-notification__file" title={path}>
            {path}
          </li>
        ))}
      </ul>
      {hiddenCount > 0 && (
        <button type="button" className="scan-notification__more" onClick={() => setExpanded(true)}>
          и ещё {hiddenCount}
        </button>
      )}
    </div>
  )
}

function SourceBlock({ source }: { source: ScanNotificationModel['sources'][number] }) {
  return (
    <div className="scan-notification__source">
      <div className="scan-notification__source-name" title={source.label}>
        {source.label}
      </div>
      {source.unavailable && (
        <div className="scan-notification__unavailable">источник недоступен</div>
      )}
      <FileGroup label="Добавлено" paths={source.added} />
      <FileGroup label="Изменено" paths={source.changed} />
      <FileGroup label="Удалено" paths={source.deleted} />
    </div>
  )
}

/** Non-blocking change-detection notification (task 1.15,
 * specs/workspace-sources.md BDD "Детект изменений"): subscribes to
 * `onScanReport` itself (same self-contained pattern as TopBar's scanning
 * indicator) and shows a dismissible toast listing what a completed scan
 * found, grouped per source. A report with only `unchanged` files never
 * shows or replaces anything — see `buildScanNotification`; a report with
 * changes replaces whatever was showing before. Source ids in a report are
 * opaque (see shared/ipc.ts), so this resolves each to its `root_path` via
 * `sources:list` for display, falling back to the raw id if that lookup
 * fails or the source was since removed. Dismissed by the user; switching
 * projects also clears it, since a notification belongs to the project it
 * was raised for. The two actions are stubs — re-ingest ships in Phase 2
 * (task 2.9/2.10), wiki refresh in Phase 3 — disabled, so clicking does
 * nothing to the index or vault (BDD: "без подтверждения индексы и файлы
 * vault не меняются"). */
export default function ScanNotification({
  currentProject
}: {
  currentProject: OpenProject | null
}) {
  const [model, setModel] = useState<ScanNotificationModel | null>(null)

  // A notification from the previous project must not linger once the user
  // switches — it describes sources that may no longer even be connected.
  // Declared inside the effect and invoked immediately (not a bare setState
  // in the effect body) — same convention as SourcesActivity's/
  // ExplorerActivity's own project-switch reset effects, which keeps this
  // outside react-hooks/set-state-in-effect's reach (see SourceEntry's
  // comment on that rule for why).
  useEffect(() => {
    function clear(): void {
      setModel(null)
    }
    clear()
  }, [currentProject])

  // Fix-iteration 1 (review major): re-subscribes on every `currentProject`
  // change so the vaultPath guard below always compares against the
  // *current* project, not a stale one closed over at first mount — a scan
  // that started against project A (tagged A by `main`, see
  // `ScanReportEnvelope`) must be dropped if it lands after the user has
  // already switched to project B, never shown with B's source labels.
  // Also hydrates from `getScanState().lastReport` on mount (fix-iteration 1,
  // review minor 2 — mirrors TopBar's own hydrate-on-mount for `scanning`): a
  // scan can finish before this effect subscribes. `cancelled` (fix-
  // iteration 1, review minor 1 — mounted-flag convention, see
  // TopBar.tsx/Shell.tsx) guards both async paths against a setState after
  // unmount or after this effect re-runs for a new project.
  useEffect(() => {
    let cancelled = false

    async function applyEnvelope(envelope: ScanReportEnvelope): Promise<void> {
      if (!currentProject || envelope.vaultPath !== currentProject.vaultPath) return
      let labels: Record<string, string> = {}
      try {
        const sources = await window.aecpilot.listSources()
        if (cancelled) return
        labels = Object.fromEntries(sources.map((s) => [s.id, s.root_path]))
      } catch {
        // Best-effort — worst case the notification falls back to raw
        // source ids as labels.
      }
      if (cancelled) return
      const next = buildScanNotification(envelope.report, labels)
      if (next) setModel(next)
    }

    void window.aecpilot.getScanState().then((state) => {
      if (cancelled || !state.lastReport) return
      void applyEnvelope(state.lastReport)
    })

    const unsubscribe = window.aecpilot.onScanReport((envelope) => {
      void applyEnvelope(envelope)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [currentProject])

  if (!model) return null

  return (
    <div className="scan-notification" role="status">
      <div className="scan-notification__head">
        <span className="scan-notification__title">Обнаружены изменения источников</span>
        <button
          type="button"
          className="scan-notification__close"
          aria-label="Закрыть уведомление"
          onClick={() => setModel(null)}
        >
          ×
        </button>
      </div>
      <div className="scan-notification__body">
        {model.sources.map((source) => (
          <SourceBlock key={source.sourceId} source={source} />
        ))}
      </div>
      <div className="scan-notification__actions">
        <button
          type="button"
          className="scan-notification__action-btn"
          disabled
          title="Появится в Phase 2 (задача 2.9/2.10)"
        >
          Обновить индекс (re-ingest)
        </button>
        <button
          type="button"
          className="scan-notification__action-btn"
          disabled
          title="Появится в Phase 3 (вики)"
        >
          Обновить вики
        </button>
      </div>
    </div>
  )
}
