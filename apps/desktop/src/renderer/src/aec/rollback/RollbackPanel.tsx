// Snapshots of the agent's edits, and the way back (UR14, contract
// `specs/checkpoints-rollback.md`). Ours: the donor has a git review surface,
// which SPEC excludes (HX6) — this speaks to `rollback.*` instead and says
// "changes in my documents", never "commits".
//
// The screen's real job is the EMPTY list. An agent that edited files can still
// produce zero snapshots, because the core files a snapshot under the first
// ancestor directory carrying one of nine project markers, while our calls
// always address the session's cwd. `describeRollback` turns that into a named
// reason instead of a blank panel — the diagnosis itself lives in
// `main/checkpoint-scope-pure.ts`.

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'

import { Button } from '../../donor/components/ui/button'
import { useAecT } from '../../shared/i18n'
import type { RollbackCheckpoint, RollbackDiffResult } from '../../../../shared/gateway/types'

import {
  DIFF_CHANGE_KEY,
  describeRollback,
  explainScope,
  formatCheckpointTime,
  isDiffMaybeTruncated,
  parseDiffFiles,
  parseDiffLines,
  type RollbackView
} from './rollback-pure'

const CHECKPOINTS_KEY = ['aec', 'checkpoints'] as const

/** What the user is being asked to confirm. Restoring overwrites files in the
 * vault, so the confirmation names exactly what will be overwritten — a whole
 * snapshot or one file — rather than asking "are you sure?".
 *
 * `when` travels with the hash because the dialog names the snapshot the way
 * the list does: by its time. The hash is an id, never shown — it is a git
 * concept, and this screen does not use them (SPEC HX6, task 3.3). */
type Pending = { hash: string; filePath?: string; when: string }

/** How a snapshot is named on screen. */
const whenOf = (checkpoint: RollbackCheckpoint): string =>
  formatCheckpointTime(checkpoint.timestamp)

const LINE_CLASS: Record<string, string> = {
  add: 'text-emerald-500',
  del: 'text-destructive',
  hunk: 'text-(--ui-text-secondary)',
  meta: 'text-(--ui-text-secondary)',
  context: ''
}

export function RollbackPanel() {
  const t = useAecT()
  const queryClient = useQueryClient()
  // The whole checkpoint, not its hash: the screen names a snapshot by its
  // TIME everywhere (list row, diff header, confirmation), so carrying the row
  // itself keeps that label always available and needs no lookup back into a
  // list that a restore may have already changed.
  const [selected, setSelected] = useState<RollbackCheckpoint | undefined>(undefined)
  const [pending, setPending] = useState<Pending | undefined>(undefined)
  const [outcome, setOutcome] = useState<string | undefined>(undefined)

  const { data: listing, error } = useQuery({
    queryKey: CHECKPOINTS_KEY,
    queryFn: () => window.aecpilot.listCheckpoints()
  })

  const { data: diff, isFetching: diffLoading } = useQuery({
    queryKey: [...CHECKPOINTS_KEY, 'diff', selected?.hash],
    enabled: selected !== undefined,
    queryFn: () => window.aecpilot.diffCheckpoint((selected as RollbackCheckpoint).hash)
  })

  const restore = useCallback(
    async (target: Pending) => {
      setPending(undefined)
      setOutcome(undefined)
      try {
        // Only the contract's fields go over IPC — `when` is a label for this
        // screen, not part of the request.
        const result = await window.aecpilot.restoreCheckpoint({
          hash: target.hash,
          ...(target.filePath === undefined ? {} : { filePath: target.filePath }),
          confirmed: true
        })
        // Their handler passes the manager's own verdict through, so a refusal
        // arrives as a successful call with `success: false`.
        setOutcome(
          result.success
            ? target.filePath
              ? t('rollback.restoredFile', target.filePath)
              : t('rollback.restoredAll')
            : t('rollback.restoreFailed', result.error ?? t('rollback.noReason'))
        )
        if (result.success) await queryClient.invalidateQueries({ queryKey: CHECKPOINTS_KEY })
      } catch (err) {
        setOutcome(t('rollback.restoreFailed', err instanceof Error ? err.message : String(err)))
      }
    },
    [queryClient, t]
  )

  if (error) {
    return (
      <div className="flex flex-col gap-2 p-2 text-xs">
        <p className="text-destructive">{(error as Error).message}</p>
        <Button
          onClick={() => void queryClient.invalidateQueries({ queryKey: CHECKPOINTS_KEY })}
          variant="secondary"
        >
          {t('common.retry')}
        </Button>
      </div>
    )
  }

  if (!listing) {
    return <p className="p-2 text-xs text-(--ui-text-secondary)">{t('rollback.loading')}</p>
  }

  const view: RollbackView = describeRollback(listing)

  return (
    <div className="flex flex-col gap-2 overflow-auto p-2 text-xs text-(--ui-text-primary)">
      {view.kind === 'disabled' && (
        <p className="text-(--ui-text-secondary)">{t('rollback.disabled')}</p>
      )}

      {(view.kind === 'unavailable' || (view.kind === 'list' && view.warning)) && (
        <ScopeWarning scope={view.kind === 'unavailable' ? view.scope : view.warning!} />
      )}

      {view.kind === 'empty' && <p className="text-(--ui-text-secondary)">{t('rollback.empty')}</p>}

      {view.kind === 'list' && (
        <ul aria-label={t('rollback.listLabel')} className="flex flex-col gap-0.5">
          {view.checkpoints.map((checkpoint) => (
            <li key={checkpoint.hash}>
              <Button
                className={`h-auto w-full justify-between px-2 py-1 ${
                  selected?.hash === checkpoint.hash ? 'bg-(--chrome-action-hover)' : ''
                }`}
                onClick={() => {
                  setSelected(checkpoint)
                  setOutcome(undefined)
                }}
                variant="ghost"
              >
                <span>{formatCheckpointTime(checkpoint.timestamp)}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}

      {outcome && <p className="text-(--ui-text-secondary)">{outcome}</p>}
      {diffLoading && <p className="text-(--ui-text-secondary)">{t('rollback.diffLoading')}</p>}

      {selected && diff && !diffLoading && (
        <DiffView
          diff={diff}
          onRestoreAll={() => setPending({ hash: selected.hash, when: whenOf(selected) })}
          onRestoreFile={(filePath) =>
            setPending({ hash: selected.hash, filePath, when: whenOf(selected) })
          }
          when={whenOf(selected)}
        />
      )}

      {pending && (
        <ConfirmRestore
          onCancel={() => setPending(undefined)}
          onConfirm={() => void restore(pending)}
          pending={pending}
        />
      )}
    </div>
  )
}

function ScopeWarning({ scope }: { scope: Parameters<typeof explainScope>[0] }) {
  const t = useAecT()
  const { title, detail } = explainScope(scope, t)

  return (
    <div className="flex flex-col gap-1 rounded-[4px] bg-(--ui-bg-quaternary) p-2">
      <strong>{title}</strong>
      <p className="text-(--ui-text-secondary)">{detail}</p>
    </div>
  )
}

function DiffView({
  when,
  diff,
  onRestoreFile,
  onRestoreAll
}: {
  /** The snapshot's time, already formatted — the panel never shows a hash. */
  when: string
  diff: RollbackDiffResult
  onRestoreFile: (filePath: string) => void
  onRestoreAll: () => void
}) {
  const t = useAecT()

  if (diff.stat === '' && diff.diff === '') {
    // Their handler answers two empty strings both for "nothing changed" and
    // for "no such snapshot", and cannot tell us which. Saying both is honest;
    // picking one would be a guess.
    return <p className="text-(--ui-text-secondary)">{t('rollback.diffEmpty')}</p>
  }

  const files = parseDiffFiles(diff.diff)
  const lines = parseDiffLines(diff.diff)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span>{t('rollback.diffHead', when)}</span>
        <Button onClick={onRestoreAll} size="xs" variant="secondary">
          {t('rollback.restoreAll')}
        </Button>
      </div>

      {isDiffMaybeTruncated(diff.diff) && (
        <p className="text-(--ui-text-secondary)">{t('rollback.truncated')}</p>
      )}

      <ul aria-label={t('rollback.filesLabel')} className="flex flex-col gap-0.5">
        {files.map((file) => (
          <li className="flex items-center gap-2" key={file.path}>
            <span className="min-w-0 flex-1 truncate">{file.path}</span>
            <span className="text-(--ui-text-secondary)">{t(DIFF_CHANGE_KEY[file.change])}</span>
            {file.binary && (
              <span className="text-(--ui-text-secondary)">{t('rollback.binary')}</span>
            )}
            <Button onClick={() => onRestoreFile(file.path)} size="xs" variant="text">
              {t('rollback.restoreFile')}
            </Button>
          </li>
        ))}
      </ul>

      <pre className="overflow-auto rounded-[4px] bg-(--ui-bg-quaternary) p-2 font-mono text-[0.6875rem]">
        {lines.map((line, index) => (
          <span className={`block ${LINE_CLASS[line.kind] ?? ''}`} key={index}>
            {line.text || ' '}
          </span>
        ))}
      </pre>
    </div>
  )
}

function ConfirmRestore({
  pending,
  onCancel,
  onConfirm
}: {
  pending: Pending
  onCancel: () => void
  onConfirm: () => void
}) {
  const t = useAecT()

  return (
    <div
      aria-label={t('rollback.confirmLabel')}
      className="flex flex-col gap-2 rounded-[4px] bg-(--ui-bg-quaternary) p-2"
      role="alertdialog"
    >
      <p>
        {pending.filePath
          ? t('rollback.confirmFile', pending.filePath, pending.when)
          : t('rollback.confirmAll', pending.when)}
      </p>
      {/* Not a detail: the core does not delete files created AFTER the
          snapshot, so "restore" is not "go back in time". */}
      <p className="text-(--ui-text-secondary)">{t('rollback.confirmNote')}</p>
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel} variant="text">
          {t('common.cancel')}
        </Button>
        <Button onClick={onConfirm} variant="destructive">
          {t('rollback.restore')}
        </Button>
      </div>
    </div>
  )
}
