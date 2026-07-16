import { useState } from 'react'
import type { ApprovalRequest } from './chat-state'

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

  async function respond(choice: 'once' | 'session' | 'always' | 'deny'): Promise<void> {
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
  }

  return (
    <div className="approval-card">
      <div className="approval-card__head">Агент запрашивает разрешение</div>
      <div className="approval-card__desc">{request.description}</div>
      <pre className="approval-card__cmd">{request.command}</pre>
      {queueLength > 1 && (
        <div className="approval-card__queue">ещё {queueLength - 1} в очереди</div>
      )}
      {error && <div className="approval-card__error">{error}</div>}
      <div className="approval-card__actions">
        <button
          type="button"
          className="approval-card__btn approval-card__btn--primary"
          disabled={pending}
          onClick={() => void respond('once')}
        >
          Разрешить
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
            onClick={() => void respond('always')}
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
          Отклонить
        </button>
      </div>
    </div>
  )
}
