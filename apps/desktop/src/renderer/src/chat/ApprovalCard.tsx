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
    <div
      style={{
        margin: '0 12px 8px',
        borderRadius: 8,
        background: '#fff8e6',
        border: '1px solid #e8c95a',
        fontSize: 13
      }}
    >
      <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontWeight: 600 }}>Агент запрашивает разрешение</div>
        <div>{request.description}</div>
        <pre
          style={{
            margin: 0,
            whiteSpace: 'pre-wrap',
            fontFamily: 'ui-monospace, monospace',
            fontSize: 12,
            background: '#fff',
            border: '1px solid #e8c95a',
            borderRadius: 4,
            padding: 6
          }}
        >
          {request.command}
        </pre>
        {queueLength > 1 && (
          <div style={{ opacity: 0.6, fontSize: 12 }}>ещё {queueLength - 1} в очереди</div>
        )}
        {error && <div style={{ color: '#c33', fontSize: 12 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button disabled={pending} onClick={() => void respond('once')}>
            Разрешить
          </button>
          <button disabled={pending} onClick={() => void respond('session')}>
            На сессию
          </button>
          {request.allowPermanent && (
            <button disabled={pending} onClick={() => void respond('always')}>
              Всегда
            </button>
          )}
          <button
            disabled={pending}
            onClick={() => void respond('deny')}
            style={{ color: '#c33', borderColor: '#c33' }}
          >
            Отклонить
          </button>
        </div>
      </div>
    </div>
  )
}
