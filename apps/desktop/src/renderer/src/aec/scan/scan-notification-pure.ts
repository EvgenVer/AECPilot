// Pure logic for task 1.15's change-detection notification, split out from
// ScanNotification.tsx so it can be unit-tested without React/DOM (same
// convention as chat-state.ts). Turns a raw `ScanReport` (task 1.14) into the
// notification's display model — see docs/history/specs/workspace-sources.md's "Детект
// изменений" BDD: a report where every source is `unchanged`-only never
// shows/replaces the notification.

import type { ScanReport, SourceScanReport } from '../../../../shared/ipc'

/** One source's changes as shown in the notification. `label` is the
 * source's display name (its `root_path`, resolved by the caller from
 * `sources:list` — `ScanReport` only carries opaque source ids); falls back
 * to the raw id if no label was supplied. */
export interface SourceChangeSummary {
  sourceId: string
  label: string
  added: string[]
  changed: string[]
  deleted: string[]
  /** Mirrors `SourceScanReport.root_unavailable` — shown as an info line
   * ("источник недоступен"), never counted as a change itself. */
  unavailable: boolean
}

export interface ScanNotificationModel {
  sources: SourceChangeSummary[]
}

function sourceHasChanges(source: SourceScanReport): boolean {
  return source.added.length > 0 || source.changed.length > 0 || source.deleted.length > 0
}

/** Whether `report` has at least one added/changed/deleted file in any
 * source — the trigger condition for showing (or replacing) the
 * notification. A source that's merely `root_unavailable` (no changes of its
 * own) does not count, per the "Недоступный источник" scenario being a
 * separate concern from "Детект изменений". */
export function reportHasChanges(report: ScanReport): boolean {
  return Object.values(report.sources).some(sourceHasChanges)
}

/** Builds the notification model for `report`, or `null` if it shouldn't be
 * shown (no changes anywhere — see `reportHasChanges`). Sources with no
 * changes of their own and not `root_unavailable` are omitted from the
 * result — only sources worth telling the user about are included.
 * `sourceLabels` maps source id -> display label (e.g. `root_path`); a
 * missing entry falls back to the raw id. */
export function buildScanNotification(
  report: ScanReport,
  sourceLabels: Record<string, string> = {}
): ScanNotificationModel | null {
  if (!reportHasChanges(report)) return null

  const sources = Object.entries(report.sources)
    .filter(([, source]) => sourceHasChanges(source) || source.root_unavailable)
    .map(([sourceId, source]) => ({
      sourceId,
      label: sourceLabels[sourceId] ?? sourceId,
      added: source.added,
      changed: source.changed,
      deleted: source.deleted,
      unavailable: source.root_unavailable
    }))

  return { sources }
}

/** Служебные страницы вики: они есть всегда, сразу после `wiki_init`, и
 *  наличием вики не считаются. */
const WIKI_SERVICE = ['index.md', 'log.md', 'schema.md']

/** Есть ли в vault хоть одна содержательная страница вики (задача 4.13).
 *
 *  От этого зависит, предлагать ли из уведомления «обновить вики»: кнопка,
 *  предлагающая обновить то, чего нет, — это кнопка, которая врёт. Каталог,
 *  журнал и схема не в счёт, снимки в `raw/` тем более: они появляются вместе
 *  со скелетом, а вики при этом ещё пуста.
 *
 *  Решает путь узла, а не его место в обходе: дерево приходит от главного
 *  процесса, и завязываться на то, как оно вложено, значит ломаться от любой
 *  перестановки. */
export function hasWikiPages(
  tree: { name: string; path: string; type: string; children?: unknown }[]
): boolean {
  return tree.some((node) => {
    if (node.type === 'dir') {
      return hasWikiPages((node.children ?? []) as typeof tree)
    }
    const path = node.path.toLowerCase()
    if (!path.startsWith('wiki/') || !path.endsWith('.md')) return false
    if (path.startsWith('wiki/raw/')) return false
    return !WIKI_SERVICE.includes(node.name.toLowerCase())
  })
}
