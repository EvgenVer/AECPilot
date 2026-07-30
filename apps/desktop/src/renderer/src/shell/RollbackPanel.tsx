import { useCallback, useEffect, useState } from 'react'
import {
  DIFF_CHANGE_LABEL,
  describeRollback,
  explainScope,
  formatCheckpointTime,
  isDiffMaybeTruncated,
  parseDiffFiles,
  parseDiffLines,
  shortHash,
  type RollbackView
} from './rollback-pure'
import type { RollbackListing } from '../../../shared/ipc'
import type { RollbackDiffResult } from '../../../shared/gateway/types'

/** What the user is being asked to confirm. Restoring overwrites files in the
 * vault, so the confirmation names exactly what will be overwritten — a whole
 * snapshot or one file — rather than asking "точно?". */
type Pending = { hash: string; filePath?: string }

/** Snapshots of the agent's edits, and the way back (task 1.6.C2, contract
 * `specs/checkpoints-rollback.md`).
 *
 * The screen's real job is the empty list: an agent that edited files can
 * still produce zero snapshots here, because hermes files a snapshot under the
 * first ancestor directory carrying one of nine project markers, while our
 * `rollback.*` calls always address the session's cwd. `describeRollback`
 * turns that into a named reason instead of a blank list — see
 * `main/checkpoint-scope-pure.ts` for the diagnosis itself. */
export default function RollbackPanel() {
  const [listing, setListing] = useState<RollbackListing | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<string | undefined>(undefined)
  const [diff, setDiff] = useState<RollbackDiffResult | undefined>(undefined)
  const [pending, setPending] = useState<Pending | undefined>(undefined)
  const [outcome, setOutcome] = useState<string | undefined>(undefined)

  const refresh = useCallback(async (): Promise<void> => {
    setError(undefined)
    try {
      setListing(await window.aecpilot.listCheckpoints())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  // Mount only. Deferred to a microtask so the effect body itself does not
  // drive a state update (react-hooks/set-state-in-effect); everything after
  // this is driven by clicks.
  useEffect(() => {
    queueMicrotask(() => void refresh())
  }, [refresh])

  const openDiff = useCallback(async (hash: string): Promise<void> => {
    setSelected(hash)
    setDiff(undefined)
    setOutcome(undefined)
    setLoading(true)
    try {
      setDiff(await window.aecpilot.diffCheckpoint(hash))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  const restore = useCallback(
    async (target: Pending): Promise<void> => {
      setPending(undefined)
      setOutcome(undefined)
      try {
        const result = await window.aecpilot.restoreCheckpoint({ ...target, confirmed: true })
        // Their handler passes the manager's own verdict through, so a refusal
        // arrives as a successful call with `success: false`.
        setOutcome(
          result.success
            ? target.filePath
              ? `Файл ${target.filePath} восстановлен.`
              : 'Снимок восстановлен.'
            : `Не удалось восстановить: ${result.error ?? 'причина не названа'}`
        )
        if (result.success) await refresh()
      } catch (e: unknown) {
        setOutcome(`Не удалось восстановить: ${e instanceof Error ? e.message : String(e)}`)
      }
    },
    [refresh]
  )

  if (error !== undefined) {
    return (
      <div className="rollback">
        <p className="rollback__error">{error}</p>
        <button type="button" className="rollback__link" onClick={() => void refresh()}>
          Повторить
        </button>
      </div>
    )
  }

  if (listing === undefined) return <div className="rollback__note">Загружаю снимки…</div>

  const view: RollbackView = describeRollback(listing)

  return (
    <div className="rollback">
      {view.kind === 'disabled' && (
        <p className="rollback__note">Чекпойнты выключены — снимки правок агента не сохраняются.</p>
      )}

      {(view.kind === 'unavailable' || (view.kind === 'list' && view.warning)) && (
        <ScopeWarning scope={view.kind === 'unavailable' ? view.scope : view.warning!} />
      )}

      {view.kind === 'empty' && (
        <p className="rollback__note">Снимков пока нет — агент ещё ничего не правил.</p>
      )}

      {view.kind === 'list' && (
        <ul className="rollback__list" aria-label="Снимки">
          {view.checkpoints.map((checkpoint) => (
            <li key={checkpoint.hash}>
              <button
                type="button"
                className={`rollback__row${
                  selected === checkpoint.hash ? ' rollback__row--selected' : ''
                }`}
                onClick={() => void openDiff(checkpoint.hash)}
              >
                <span className="rollback__time">{formatCheckpointTime(checkpoint.timestamp)}</span>
                <span className="rollback__hash">{shortHash(checkpoint.hash)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {outcome && <p className="rollback__outcome">{outcome}</p>}

      {loading && <p className="rollback__note">Считаю различия…</p>}

      {selected && diff && !loading && (
        <DiffView
          hash={selected}
          diff={diff}
          onRestoreFile={(filePath) => setPending({ hash: selected, filePath })}
          onRestoreAll={() => setPending({ hash: selected })}
        />
      )}

      {pending && (
        <ConfirmRestore
          pending={pending}
          onCancel={() => setPending(undefined)}
          onConfirm={() => void restore(pending)}
        />
      )}
    </div>
  )
}

function ScopeWarning({ scope }: { scope: Parameters<typeof explainScope>[0] }) {
  const { title, detail } = explainScope(scope)
  return (
    <div className="rollback__warning">
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  )
}

function DiffView({
  hash,
  diff,
  onRestoreFile,
  onRestoreAll
}: {
  hash: string
  diff: RollbackDiffResult
  onRestoreFile: (filePath: string) => void
  onRestoreAll: () => void
}) {
  const files = parseDiffFiles(diff.diff)
  const lines = parseDiffLines(diff.diff)

  if (diff.stat === '' && diff.diff === '') {
    // Their handler answers two empty strings both for "nothing changed" and
    // for "no such snapshot", and cannot tell us which. Saying both is honest;
    // picking one would be a guess.
    return (
      <div className="rollback__diff">
        <p className="rollback__note">
          Различий нет — либо с этого снимка ничего не менялось, либо самого снимка уже нет (шлюз
          эти два случая не различает).
        </p>
      </div>
    )
  }

  return (
    <div className="rollback__diff">
      <div className="rollback__diff-head">
        <span>Изменения с снимка {shortHash(hash)}</span>
        <button type="button" className="rollback__link" onClick={onRestoreAll}>
          Восстановить всё
        </button>
      </div>

      {isDiffMaybeTruncated(diff.diff) && (
        <p className="rollback__note">
          Шлюз обрезает патч по 4000 символов и не помечает обрез — ниже, скорее всего, показана не
          вся разница.
        </p>
      )}

      <ul className="rollback__files" aria-label="Файлы снимка">
        {files.map((file) => (
          <li className="rollback__file" key={file.path}>
            <span className="rollback__file-path">{file.path}</span>
            <span className="rollback__file-change">{DIFF_CHANGE_LABEL[file.change]}</span>
            {file.binary && <span className="rollback__file-change">двоичный</span>}
            <button
              type="button"
              className="rollback__link"
              onClick={() => onRestoreFile(file.path)}
            >
              Восстановить файл
            </button>
          </li>
        ))}
      </ul>

      <pre className="rollback__patch">
        {lines.map((line, index) => (
          <span className={`rollback__line rollback__line--${line.kind}`} key={index}>
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
  return (
    <div className="rollback__confirm" role="alertdialog" aria-label="Подтверждение восстановления">
      <p>
        {pending.filePath
          ? `Файл ${pending.filePath} будет перезаписан состоянием из снимка ${shortHash(pending.hash)}. Текущее содержимое пропадёт.`
          : `Все файлы будут перезаписаны состоянием из снимка ${shortHash(pending.hash)}, а последний ход исчезнет из истории сессии. Текущее содержимое пропадёт.`}
      </p>
      <p className="rollback__note">
        Файлы, созданные ПОСЛЕ снимка, при восстановлении не удаляются — это поведение ядра.
      </p>
      <button type="button" className="rollback__danger" onClick={onConfirm}>
        Восстановить
      </button>
      <button type="button" className="rollback__link" onClick={onCancel}>
        Отмена
      </button>
    </div>
  )
}
