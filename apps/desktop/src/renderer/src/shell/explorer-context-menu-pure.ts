// Pure logic for task 1.5.7's per-node context menu (Sidebar.tsx): which
// commands appear for a right-clicked node, and in what order/grouping —
// independent of React/react-arborist so it's unit-testable on its own (same
// convention as explorer-search-pure.ts / source-status-pure.ts). Grouping
// mirrors design/screens/Explorer.html's own context-menu mockup: read-only
// operations first, a separator, then write operations with delete last.
//
// A source node (any depth) is read-only by construction
// (specs/workspace-sources.md's "Гарантия read-only") and only ever gets the
// read section — no create/rename/delete, at any level.

export type ExplorerNodeKind = 'vault-dir' | 'vault-file' | 'source'

export type ContextMenuAction =
  'show-in-explorer' | 'copy-path' | 'rename' | 'create-file' | 'create-dir' | 'delete'

export interface ContextMenuItem {
  action: ContextMenuAction
  label: string
  /** Rendered in the danger color (task 1.5.7: only "Удалить" today). */
  danger?: boolean
}

/** One group of the menu; the renderer draws a divider between sections
 * (Sidebar.tsx's `ExplorerContextMenu`). */
export type ContextMenuSection = ContextMenuItem[]

// Identical for every node kind — "показать в проводнике"/"копировать путь"
// work the same way for a vault folder, a vault file, or a source entry at
// any depth (task 1.5.7 extends "копировать путь" to vault nodes; it was
// source-only through task 1.5.5/1.5.6).
const READ_SECTION: ContextMenuSection = [
  { action: 'show-in-explorer', label: 'Показать в проводнике' },
  { action: 'copy-path', label: 'Копировать путь' }
]

/** Returns the ordered, grouped command list for a right-clicked node of
 * `kind`. This only decides which commands are *offered* and their order —
 * the toolbar and the context menu dispatch every action to the exact same
 * handlers (task 1.5.7's brief: "те же обработчики, что в тулбаре"). */
export function contextMenuSections(kind: ExplorerNodeKind): ContextMenuSection[] {
  if (kind === 'source') return [READ_SECTION]

  const writeSection: ContextMenuSection =
    kind === 'vault-dir'
      ? [
          { action: 'rename', label: 'Переименовать' },
          { action: 'create-file', label: 'Создать файл' },
          { action: 'create-dir', label: 'Создать папку' },
          { action: 'delete', label: 'Удалить', danger: true }
        ]
      : [
          { action: 'rename', label: 'Переименовать' },
          { action: 'delete', label: 'Удалить', danger: true }
        ]

  return [READ_SECTION, writeSection]
}
