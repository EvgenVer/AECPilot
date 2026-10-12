// What the index holds, file by file (task 3J.10, SPEC UR44). Before this the
// page listed only the files of the run in progress: a document skipped or
// failed three runs ago was invisible, and «is this in the index?» had no
// answer. The tree reads `aec-rag inventory`; folders open on click, so a
// project of thousands of files renders only what a person opens.

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'

import { Button } from '../../donor/components/ui/button'
import { Codicon } from '../../donor/components/ui/codicon'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '../../donor/components/ui/context-menu'
import { notify } from '../../donor/store/notifications'
import { useAecT } from '../../shared/i18n'
import type { InventoryFile } from '../../../../shared/ipc'
import { PROJECT_SOURCE_ID, sourceDisplayName } from '../../../../shared/source-name'
import { useConfirm } from '../explorer/useConfirm'

import {
  type DocumentAction,
  documentActions,
  runDocumentAction,
  waitingScans
} from './document-actions'
import {
  buildInventoryTree,
  canRetry,
  type InventoryFolder,
  type InventoryNode,
  isProblem
} from './inventory-tree'

/** The codes `aec_rag/errors.py` can send; anything else is worded as `unknown`. */
const ERROR_CODES = new Set([
  'source_detached',
  'unsupported',
  'file_unreadable',
  'parse_failed',
  'ocr_failed',
  'not_indexed',
  'provider_missing',
  'provider_key',
  'provider_limit',
  'provider_unreachable',
  'graph_failed',
  'unknown'
])

export function errorCodeKey(code: string): string {
  return `index.inventory.code.${ERROR_CODES.has(code) ? code : 'unknown'}`
}

export function InventoryTree({ running }: { running: boolean }): React.JSX.Element | null {
  const t = useAecT()
  const [onlyProblems, setOnlyProblems] = useState(false)
  // Folders whose open/closed state the person flipped. What they flip FROM
  // depends on the mode: the whole tree is closed, the problems open.
  const [flipped, setFlipped] = useState<Set<string>>(() => new Set())
  const queryClient = useQueryClient()
  const { confirm, dialog } = useConfirm()

  // Задача 3L.6: действие по документу из строки или её меню. «Убрать» — только
  // после своего окна подтверждения (D-204); отказ — уведомлением словами.
  const act = useCallback(
    async (action: DocumentAction, file: InventoryFile): Promise<void> => {
      if (
        action === 'exclude' &&
        !(await confirm(t('index.document.excludeConfirm'), t('index.document.exclude')))
      )
        return
      const error = await runDocumentAction(action, {
        kind: 'file',
        rel: file.rel_path,
        sourceId: file.source_id
      })
      if (error) notify({ kind: 'error', title: t('index.document.failedTitle'), message: error })
      else if (action === 'exclude') {
        void queryClient.invalidateQueries({ queryKey: ['aec', 'index-status'] })
      }
    },
    [confirm, queryClient, t]
  )

  const inventory = useQuery({
    queryKey: ['aec', 'index-status', 'inventory'],
    queryFn: () => window.aecpilot.getIndexInventory()
  })
  const sources = useQuery({
    queryKey: ['aec', 'index-status', 'sources'],
    queryFn: () => window.aecpilot.listSources()
  })

  if (!inventory.data) return null
  if (!inventory.data.ok) {
    return (
      <Section>
        <div className="text-destructive">
          {t('index.inventory.loadFailed', inventory.data.error)}
        </div>
      </Section>
    )
  }
  const data = inventory.data.inventory
  if (!data.index_exists) {
    return (
      <Section>
        <div className="text-muted-foreground">{t('index.inventory.empty')}</div>
      </Section>
    )
  }

  const named = (sources.data ?? []).map((source) => ({
    id: source.id,
    name: sourceDisplayName(source)
  }))
  // Задача 3K.6: отмеченные файлы проекта — отдельным корнем, и только когда они есть.
  if (data.files.some((file) => file.source_id === PROJECT_SOURCE_ID)) {
    named.push({ id: PROJECT_SOURCE_ID, name: t('index.inventory.projectFiles') })
  }
  const roots = buildInventoryTree(data.files, named, onlyProblems)
  const problems = data.files.filter(isProblem).length

  const isOpen = (folder: InventoryFolder): boolean => {
    const key = `${folder.sourceId}/${folder.rel}`
    const byDefault = folder.rel === '' || onlyProblems
    return flipped.has(key) ? !byDefault : byDefault
  }
  const toggle = (folder: InventoryFolder): void => {
    const key = `${folder.sourceId}/${folder.rel}`
    setFlipped((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <Section>
      <div className="text-muted-foreground">
        {t('index.inventory.summary', data.summary.files, data.summary.index.indexed, problems)}
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input
          checked={onlyProblems}
          onChange={(event) => {
            setOnlyProblems(event.target.checked)
            setFlipped(new Set())
          }}
          type="checkbox"
        />
        {t('index.inventory.onlyProblems')}
      </label>
      {onlyProblems && problems === 0 ? (
        <div className="text-muted-foreground text-xs">{t('index.inventory.noProblems')}</div>
      ) : (
        <ul aria-label={t('index.inventory.title')} className="space-y-0.5 text-xs" role="tree">
          {roots.map((root) => (
            <Node
              act={act}
              depth={0}
              isOpen={isOpen}
              key={root.sourceId}
              node={root}
              running={running}
              toggle={toggle}
            />
          ))}
        </ul>
      )}
      {dialog}
    </Section>
  )
}

function Section({ children }: { children: React.ReactNode }): React.JSX.Element {
  const t = useAecT()
  return (
    <div className="border-border space-y-1 border-t pt-3">
      <div className="font-medium">{t('index.inventory.title')}</div>
      {children}
    </div>
  )
}

type Act = (action: DocumentAction, file: InventoryFile) => Promise<void>

function Node({
  act,
  depth,
  isOpen,
  node,
  running,
  toggle
}: {
  act: Act
  depth: number
  isOpen: (folder: InventoryFolder) => boolean
  node: InventoryNode
  running: boolean
  toggle: (folder: InventoryFolder) => void
}): React.JSX.Element {
  const t = useAecT()
  const indent = { paddingLeft: `${depth * 12}px` }

  if (node.kind === 'file') {
    return (
      <li role="treeitem" style={indent}>
        <FileRow act={act} file={node.file} name={node.name} running={running} />
      </li>
    )
  }

  const open = isOpen(node)
  return (
    <li aria-expanded={open} role="treeitem">
      <button
        className="hover:bg-muted flex w-full items-center gap-1 rounded text-left"
        onClick={() => toggle(node)}
        style={indent}
        type="button"
      >
        <span
          aria-hidden
          className={`codicon ${open ? 'codicon-chevron-down' : 'codicon-chevron-right'}`}
        />
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        <span
          className={
            node.problems > 0 ? 'shrink-0 text-amber-500' : 'text-muted-foreground shrink-0'
          }
        >
          {t('index.inventory.folderCount', node.files, node.problems)}
        </span>
      </button>
      {open ? (
        <ul role="group">
          {node.children.map((child) => (
            <Node
              act={act}
              depth={depth + 1}
              isOpen={isOpen}
              key={child.kind === 'file' ? child.file.rel_path : `${child.rel}/`}
              node={child}
              running={running}
              toggle={toggle}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

function FileRow({
  act,
  file,
  name,
  running
}: {
  act: Act
  file: InventoryFile
  name: string
  running: boolean
}): React.JSX.Element {
  const t = useAecT()
  const state =
    file.index === 'skipped' && file.reason
      ? t('index.inventory.skippedBecause', t(`index.inventory.reason.${file.reason}`))
      : t(`index.inventory.state.${file.index}`)
  // Задача 3L.6: «Индексировать» (бывший «Повторить») — кнопкой там, где
  // индекс отстал или сбоил; ждущие сканы — «Продолжить распознавание».
  // Все действия — в меню строки, «Убрать» — ещё и значком при наведении.
  const actions = documentActions(file, false)
  const primary: DocumentAction | null =
    waitingScans(file) > 0 ? 'continueScans' : canRetry(file) ? 'index' : null
  const label = (action: DocumentAction): string => t(`index.document.${action}`)

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="group flex flex-wrap items-center gap-x-2 pl-4">
          <span className="min-w-0 flex-1 truncate" title={file.rel_path}>
            {name}
          </span>
          <span
            className={
              file.index === 'failed'
                ? 'text-destructive shrink-0'
                : file.index === 'indexed'
                  ? 'text-muted-foreground shrink-0'
                  : 'shrink-0 text-amber-500'
            }
          >
            {state}
          </span>
          {file.scans ? (
            <span
              className={
                file.scans.failed > 0 ? 'shrink-0 text-amber-500' : 'text-muted-foreground shrink-0'
              }
              title={file.scans.error ?? undefined}
            >
              {t('index.inventory.scans', file.scans.done, file.scans.total, file.scans.failed)}
            </span>
          ) : null}
          {file.graph !== 'none' ? (
            <span className="text-muted-foreground shrink-0">
              {t(`index.inventory.graph.${file.graph}`)}
            </span>
          ) : null}
          {primary ? (
            <Button
              className="h-5 px-1.5 text-xs"
              disabled={running}
              onClick={() => void act(primary, file)}
              size="sm"
              variant="ghost"
            >
              {label(primary)}
            </Button>
          ) : null}
          {actions.includes('exclude') ? (
            <Button
              aria-label={label('exclude')}
              className="hidden group-focus-within:flex group-hover:flex"
              disabled={running}
              onClick={() => void act('exclude', file)}
              size="icon-xs"
              title={label('exclude')}
              variant="ghost"
            >
              <Codicon name="circle-slash" />
            </Button>
          ) : null}
          {file.errors.map((error) => (
            <div className="text-destructive w-full pl-2" key={error.stage} title={error.detail}>
              {t(`index.inventory.stage.${error.stage}`)}: {t(errorCodeKey(error.code))}
            </div>
          ))}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {actions.map((action) => (
          <ContextMenuItem disabled={running} key={action} onSelect={() => void act(action, file)}>
            {label(action)}
          </ContextMenuItem>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  )
}
