// Pure logic for task 1.5.5's `useSourceStatuses` (Sidebar.tsx), split out so
// the central owner Block 7 bugfix — a `scan:report` flips a connected
// source's "недоступен" badge live, without the user remounting/re-expanding
// anything — has a direct regression test independent of React/IPC (same
// convention as scan-notification-pure.ts).

import type { ScanReportEnvelope } from '../../../shared/ipc'

// Same states as `useSourceStatuses`'s own `SourceStatus` (task 1.8
// fix-iteration 1's "недоступен" badge, `'checking'` while a check is in
// flight) — defined here, once, and re-exported so Sidebar.tsx doesn't
// duplicate the union.
export type SourceStatus = 'checking' | 'ok' | 'unavailable' | 'error'

/** Pure merge step for `useSourceStatuses`'s `onScanReport` handler: given
 * the previous statuses map, a freshly-received `envelope`, the vault path of
 * the currently-open project, and the set of source ids this hook actually
 * knows about, returns the NEW statuses map (never mutates `prev`).
 *
 * - `envelope` for any vault other than `currentVaultPath` (task 1.15
 *   fix-iteration 1's tagging contract — including `currentVaultPath: null`,
 *   no project open) is ignored entirely: `prev` is returned unchanged.
 * - A source id in `envelope.report.sources` that isn't in `knownIds` (e.g. a
 *   stale report for a source since detached, or for one this hook instance
 *   hasn't loaded yet) is ignored — it never gets a status entry.
 * - Every status already in `prev` for a source untouched by this envelope
 *   is preserved as-is.
 * - A known source's `root_unavailable` maps to `'unavailable'`, otherwise
 *   `'ok'`. */
export function mergeScanStatuses(
  prev: Record<string, SourceStatus>,
  envelope: ScanReportEnvelope,
  currentVaultPath: string | null,
  knownIds: ReadonlySet<string>
): Record<string, SourceStatus> {
  if (currentVaultPath === null || envelope.vaultPath !== currentVaultPath) return prev

  const next = { ...prev }
  for (const [sourceId, report] of Object.entries(envelope.report.sources)) {
    if (!knownIds.has(sourceId)) continue
    next[sourceId] = report.root_unavailable ? 'unavailable' : 'ok'
  }
  return next
}
