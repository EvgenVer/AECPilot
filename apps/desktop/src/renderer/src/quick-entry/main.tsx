// The global-hotkey capture window (task 3.15, UR13 via the donor's Quick
// Entry). Its own renderer entry, not a route of the main one: mounting the
// full application to show one input would boot their whole shell a second
// time, and this window has to appear in the time it takes to press a chord.
//
// It carries NO gateway connection and no session state. The text goes to main,
// which submits it through the same path the normal composer uses — one submit
// pipeline, no second RPC (the donor's own rule for this window, and it holds
// here for a different reason: our gateway lives in main to begin with).

import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'

import '../donor/styles.css'

type Target = 'current' | 'new'

function QuickEntry(): React.JSX.Element {
  const [text, setText] = useState('')
  const [target, setTarget] = useState<Target>('current')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const input = useRef<HTMLTextAreaElement>(null)

  // The window is shown by a shortcut, so focus cannot wait for a click, and it
  // is re-taken every time main shows it again (the window is hidden, not
  // destroyed — recreating it would cost the very moment this feature buys).
  useEffect(() => {
    const focus = (): void => {
      input.current?.focus()
      setError(undefined)
    }

    focus()
    window.addEventListener('focus', focus)

    return () => window.removeEventListener('focus', focus)
  }, [])

  async function send(): Promise<void> {
    const value = text.trim()
    if (!value || sending) return

    setSending(true)
    setError(undefined)
    try {
      const result = await window.quickEntry.submit(value, target)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setText('')
      window.quickEntry.hide()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-screen flex-col gap-2 bg-(--ui-bg-secondary) p-3">
      <textarea
        aria-label="Сообщение агенту"
        className="min-h-0 flex-1 resize-none rounded-[4px] bg-(--ui-bg-quaternary) px-2 py-1.5 text-sm text-(--ui-text-primary) outline-none focus-visible:ring-[0.1875rem] focus-visible:ring-ring/50"
        disabled={sending}
        onChange={(event) => setText(event.target.value)}
        // Enter sends, Shift+Enter breaks the line — the composer's habit.
        // Escape hides: the window is summoned mid-thought and must leave the
        // same way.
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            window.quickEntry.hide()
            return
          }
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            void send()
          }
        }}
        placeholder="Что сделать? Enter — отправить, Esc — скрыть"
        ref={input}
        value={text}
      />

      <div className="flex items-center justify-between gap-2 text-xs text-(--ui-text-secondary)">
        <label className="flex items-center gap-1.5">
          Куда:
          <select
            className="rounded-[4px] bg-(--ui-bg-quaternary) px-1.5 py-1 text-(--ui-text-primary) outline-none"
            disabled={sending}
            onChange={(event) => setTarget(event.target.value as Target)}
            value={target}
          >
            <option value="current">в текущую сессию</option>
            <option value="new">в новую сессию</option>
          </select>
        </label>

        {error ? (
          <span className="truncate text-(--ui-error)" title={error}>
            {error}
          </span>
        ) : (
          <span>{sending ? 'Отправляю…' : 'Окно поверх остальных'}</span>
        )}
      </div>
    </div>
  )
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <QuickEntry />
  </StrictMode>
)
