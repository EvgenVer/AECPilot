import { useState } from 'react'
import type { InteractiveRequest } from './chat-state'

type SudoRequest = Extract<InteractiveRequest, { kind: 'sudo' }>

function ShieldIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2 3 7v10l9 5 9-5V7z" />
      <path d="M12 8v4M12 16h.01" />
    </svg>
  )
}

/** A tool asked to elevate privileges (task 1.5.D1). Blocking: the agent core
 * stops for up to 120 s waiting for an answer.
 *
 * Product decision (owner, 2026-07-20): this app NEVER collects an OS
 * password. The card exists so the request is visible and can be dismissed
 * immediately rather than stalling the agent — it only ever declines. There
 * is no password field here, and `declineSudo` takes no password argument, so
 * no code path can send one.
 *
 * Elevation is a Unix mechanism and is not expected on Windows at all; this
 * is a "don't hang if it ever happens" safeguard, not a supported flow. */
export default function SudoCard({
  request,
  onResolved
}: {
  request: SudoRequest
  onResolved: (requestId: string) => void
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  async function decline(): Promise<void> {
    setPending(true)
    setError(undefined)
    try {
      await window.aecpilot.declineSudo(request.requestId)
      onResolved(request.requestId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPending(false)
    }
  }

  return (
    <div className="sudo-card">
      <div className="sudo-card__head">
        <span className="sudo-card__icon">
          <ShieldIcon />
        </span>
        <span className="sudo-card__title">Запрошены повышенные права</span>
      </div>
      <div className="sudo-card__desc">
        Агент попросил выполнить команду с правами администратора. Приложение не запрашивает
        системный пароль — запрос будет отклонён, агент продолжит без повышения прав.
      </div>
      {error && <div className="sudo-card__error">{error}</div>}
      <button
        type="button"
        className="sudo-card__btn"
        disabled={pending}
        onClick={() => void decline()}
      >
        Отклонить и продолжить
      </button>
    </div>
  )
}
