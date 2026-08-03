import { useEffect, useRef, useState } from 'react'
import type { HistoryMessage } from '../../../shared/gateway/types'
import { ACTIVITIES, type ActivityId } from './activities'
import {
  buildPaletteItems,
  decideDispatchAction,
  filterPaletteItems,
  groupPaletteItems,
  moveHighlight,
  PALETTE_EMPTY_HINT,
  type PaletteItem
} from './command-palette-pure'

/** Ctrl+K command palette (tasks 1.6.B5.17–B5.19). Contract:
 * specs/agent-sessions.md §Палитра команд.
 *
 * The command list comes from the gateway's own registry (`commands.catalog`),
 * so it always describes the build that is running rather than a list this app
 * would have to keep in step. Names stay English, as the core sends them
 * (owner decision B5-4).
 *
 * Everything is fetched on OPEN, not on mount: a palette that polls the gateway
 * while nobody is looking would be a background cost paid on every window. */
export default function CommandPalette({
  onSelectActivity,
  onSessionLoaded
}: {
  onSelectActivity: (id: ActivityId) => void
  onSessionLoaded: (messages: HistoryMessage[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<PaletteItem[]>([])
  const [canon, setCanon] = useState<Record<string, string>>({})
  const [warning, setWarning] = useState<string | undefined>(undefined)
  const [notice, setNotice] = useState<string | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [highlight, setHighlight] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  // Where the focus was when the palette opened, so closing it puts the user
  // back where they were rather than at the top of the document.
  const returnFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((value) => !value)
        return
      }
      // While closed the palette owns no other key — Escape belongs to
      // whatever is on screen, and a letter belongs to whatever has focus.
      if (event.key === 'Escape') {
        setOpen((value) => (value ? false : value))
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!open) {
      const target = returnFocusRef.current
      returnFocusRef.current = null
      target?.focus()
      return
    }
    returnFocusRef.current = document.activeElement as HTMLElement | null
    let mounted = true
    void Promise.resolve().then(async () => {
      inputRef.current?.focus()
      try {
        const [catalog, sessions] = await Promise.all([
          window.aecpilot.getCommandCatalog(),
          // A palette without sessions is still a palette; a palette that
          // refuses to open because one list failed is not.
          window.aecpilot.listSessions().catch(() => ({ sessions: [] }))
        ])
        if (!mounted) return
        setItems(
          buildPaletteItems({
            catalog,
            sessions: sessions.sessions,
            screens: ACTIVITIES.map((activity) => ({ id: activity.id, label: activity.label }))
          })
        )
        setCanon(catalog.canon ?? {})
        // Their handler reports a partial failure here instead of raising —
        // dropping it would leave a section silently missing.
        setWarning((catalog.warning ?? '').trim() || undefined)
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : String(err))
      }
    })
    return () => {
      mounted = false
    }
  }, [open])

  function close(): void {
    setOpen(false)
    setQuery('')
    setNotice(undefined)
    setError(undefined)
    setHighlight(0)
  }

  async function runCommand(name: string): Promise<void> {
    setError(undefined)
    setNotice(undefined)
    try {
      const result = await window.aecpilot.dispatchCommand(name, '')
      const action = decideDispatchAction(result)
      if (action.kind === 'send') {
        // The same channel the composer uses: a second submit path would be a
        // second place for the turn lifecycle to diverge.
        await window.aecpilot.submitPrompt(action.message)
        setNotice(action.notice ?? `Команда ${name} отправлена ходом.`)
        close()
        return
      }
      if (action.kind === 'output') {
        setNotice(action.text)
        return
      }
      if (action.kind === 'alias') {
        setQuery(action.target)
        setNotice(`${name} — это псевдоним для ${action.target}.`)
        return
      }
      setError(action.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function activate(item: PaletteItem): Promise<void> {
    if (item.kind === 'command') {
      await runCommand(item.value)
      return
    }
    if (item.kind === 'screen') {
      onSelectActivity(item.value as ActivityId)
      close()
      return
    }
    try {
      const { messages } = await window.aecpilot.switchSession(item.value)
      onSessionLoaded(messages)
      close()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  if (!open) return null

  const visible = filterPaletteItems(items, query, canon)
  const groups = groupPaletteItems(visible)
  const current = visible[Math.min(highlight, Math.max(visible.length - 1, 0))]

  return (
    <div className="palette-backdrop" onMouseDown={close}>
      <div
        className="palette"
        role="dialog"
        aria-label="Палитра команд"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="palette__input"
          type="text"
          value={query}
          placeholder="команда, сессия или экран"
          aria-label="Что найти"
          onChange={(event) => {
            setQuery(event.target.value)
            setHighlight(0)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              setHighlight((index) =>
                moveHighlight(visible.length, index, event.key === 'ArrowDown' ? 1 : -1)
              )
              return
            }
            if (event.key === 'Enter' && current) {
              event.preventDefault()
              void activate(current)
            }
          }}
        />

        {warning && <div className="settings-popover__warning">{warning}</div>}
        {error && <div className="settings-popover__error">{error}</div>}
        {notice && <div className="settings-section__hint">{notice}</div>}

        {visible.length === 0 && (
          <div className="settings-section__empty">{PALETTE_EMPTY_HINT}</div>
        )}

        <div className="palette__list">
          {groups.map((group) => (
            <div key={group.name}>
              <div className="settings-popover__section-title">{group.name}</div>
              <ul className="palette__group">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`palette__item${
                        item.id === current?.id ? ' palette__item--active' : ''
                      }`}
                      onMouseEnter={() =>
                        setHighlight(visible.findIndex((candidate) => candidate.id === item.id))
                      }
                      onClick={() => void activate(item)}
                    >
                      <span className="palette__label">{item.label}</span>
                      {item.hint && <span className="palette__hint">{item.hint}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
