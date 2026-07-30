import { useCallback, useEffect, useState } from 'react'
import type { ApprovalRequest } from './chat-state'

type ApprovalChoice = 'once' | 'session' | 'always' | 'deny'

/** Pinned approval request (task 0.13; parity pass 1.6.12 against their
 * `tool/approval.tsx` — see docs/parity-approvals.md).
 *
 * Keyboard mirrors theirs: Ctrl/⌘+Enter allows once, Esc denies. The composer
 * is disabled while an approval is up, so these listeners cannot steal a
 * keystroke meant for the input.
 *
 * "Всегда" writes a permanent rule into the agent's config (keyed by
 * `pattern_keys`, not by the exact command), so — like theirs — it goes
 * through a confirmation step instead of firing straight from the button. */
export default function ApprovalCard({
  request,
  queueLength,
  onResolved
}: {
  request: ApprovalRequest
  queueLength: number
  onResolved: (resolved: number) => void
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [confirmAlways, setConfirmAlways] = useState(false)

  const respond = useCallback(
    async (choice: ApprovalChoice): Promise<void> => {
      setPending(true)
      setError(undefined)
      try {
        const { resolved } = await window.aecpilot.respondApproval(choice)
        // A raced/stale request can make the gateway report 0 resolved even
        // though we're clearing our local head — still drop it locally so the
        // UI can never wedge waiting on a request the gateway already forgot.
        onResolved(Math.max(resolved, 1))
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setPending(false)
      }
    },
    [onResolved]
  )

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (pending) return
      if (confirmAlways) {
        // While the confirmation is up it owns the keyboard: Esc backs out of
        // it rather than denying the whole request.
        if (event.key === 'Escape') {
          event.preventDefault()
          setConfirmAlways(false)
        }
        return
      }
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault()
        void respond('once')
      } else if (event.key === 'Escape') {
        event.preventDefault()
        void respond('deny')
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [confirmAlways, pending, respond])

  return (
    <div className="approval-card">
      <div className="approval-card__head">Агент запрашивает разрешение</div>
      <div className="approval-card__desc">{request.description}</div>
      <pre className="approval-card__cmd">{request.command}</pre>
      {queueLength > 1 && (
        <div className="approval-card__queue">ещё {queueLength - 1} в очереди</div>
      )}
      {error && <div className="approval-card__error">{error}</div>}

      {confirmAlways ? (
        <>
          <div className="approval-card__confirm">
            Правило будет сохранено в конфиге агента навсегда
            {request.patternKeys.length > 0 && (
              <>
                {' '}
                — для шаблона <code>{request.patternKeys.join(', ')}</code>, а не только для этой
                команды
              </>
            )}
            . Продолжить?
          </div>
          <div className="approval-card__actions">
            <button
              type="button"
              className="approval-card__btn"
              disabled={pending}
              onClick={() => setConfirmAlways(false)}
            >
              Отмена
            </button>
            <button
              type="button"
              className="approval-card__btn approval-card__btn--danger"
              disabled={pending}
              onClick={() => {
                setConfirmAlways(false)
                void respond('always')
              }}
            >
              Разрешать всегда
            </button>
          </div>
        </>
      ) : (
        <div className="approval-card__actions">
          <button
            type="button"
            className="approval-card__btn approval-card__btn--primary"
            disabled={pending}
            onClick={() => void respond('once')}
          >
            Разрешить <span className="approval-card__kbd">Ctrl+↵</span>
          </button>
          <button
            type="button"
            className="approval-card__btn"
            disabled={pending}
            onClick={() => void respond('session')}
          >
            На сессию
          </button>
          {request.allowPermanent && (
            <button
              type="button"
              className="approval-card__btn"
              disabled={pending}
              onClick={() => setConfirmAlways(true)}
            >
              Всегда
            </button>
          )}
          <button
            type="button"
            className="approval-card__btn approval-card__btn--danger"
            disabled={pending}
            onClick={() => void respond('deny')}
          >
            Отклонить <span className="approval-card__kbd">Esc</span>
          </button>
        </div>
      )}
    </div>
  )
}
