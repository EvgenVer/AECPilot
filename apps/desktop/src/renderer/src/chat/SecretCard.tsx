import { useState } from 'react'
import type { InteractiveRequest } from './chat-state'

type SecretRequest = Extract<InteractiveRequest, { kind: 'secret' }>

function LockIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

/** A tool is asking for a secret it could not find (task 1.5.D1), per design
 * design/screens/Chat.html §5.9. Blocking: the agent core is stopped until
 * answered or until 300 s elapse.
 *
 * SECURITY (specs/agent-chat.md §Security). The entered value:
 *  - lives ONLY in this component's local state, and is wiped as soon as the
 *    call returns — success or failure;
 *  - is never placed in chat state, the transcript or session history;
 *  - is never logged, and is never interpolated into an error message (only
 *    the gateway's own status text is shown, which cannot contain it);
 *  - is masked on screen, with autofill/spellcheck disabled so the OS and
 *    the browser engine do not retain it either.
 *
 * "Пропустить" sends an empty value — hermes documents that as a legitimate
 * skip, so the agent resumes immediately instead of stalling. */
export default function SecretCard({
  request,
  onResolved
}: {
  request: SecretRequest
  onResolved: (requestId: string) => void
}) {
  const [value, setValue] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  async function send(secret: string): Promise<void> {
    setPending(true)
    setError(undefined)
    try {
      await window.aecpilot.respondSecret(request.requestId, secret)
      setValue('') // wipe before unmounting
      onResolved(request.requestId)
    } catch (err) {
      // Only the gateway's own message — never the value.
      setError(err instanceof Error ? err.message : String(err))
      setValue('')
      setPending(false)
    }
  }

  return (
    <div className="secret-card">
      <div className="secret-card__head">
        <span className="secret-card__icon">
          <LockIcon />
        </span>
        <span className="secret-card__title">Требуется секрет</span>
      </div>

      <div className="secret-card__desc">
        {request.prompt || 'Инструмент запрашивает секретное значение.'}
        {request.envVar && (
          <>
            {' '}
            Будет сохранено агентом как <code className="secret-card__var">{request.envVar}</code>.
          </>
        )}
      </div>
      <div className="secret-card__note">
        Значение уходит агенту напрямую — приложение его не сохраняет и не пишет в журнал.
      </div>

      <form
        className="secret-card__form"
        onSubmit={(e) => {
          e.preventDefault()
          if (!pending && value !== '') void send(value)
        }}
      >
        <input
          className="secret-card__input"
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Вставьте значение"
          disabled={pending}
          // "new-password" rather than "off": Chromium ignores `off` on
          // password fields and may still offer to autofill/save them.
          autoComplete="new-password"
          spellCheck={false}
          aria-label="Секретное значение"
        />
        <button type="submit" className="secret-card__submit" disabled={pending || value === ''}>
          Отправить
        </button>
        <button
          type="button"
          className="secret-card__skip"
          disabled={pending}
          onClick={() => void send('')}
        >
          Пропустить
        </button>
      </form>

      {error && <div className="secret-card__error">{error}</div>}
    </div>
  )
}
