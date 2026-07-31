import { useEffect, useState } from 'react'
import { disableWarning, MCP_STATUS_LABELS, toMcpRows, type McpRow } from './mcp-pure'
import McpServerForm from './McpServerForm'

interface TestState {
  running: boolean
  ok?: boolean
  tools?: number
  error?: string
}

/** "MCP-серверы" (tasks 1.6.B2.8–B2.12).
 *
 * Configuration comes from their REST surface — there are no `mcp.*` RPC
 * methods at all — and the live connection state from `session.info`. Every
 * write ends with a reload, because the gateway caches a connected server for
 * the life of the process and would otherwise ignore the change. */
export default function McpSection({ disabled }: { disabled: boolean }) {
  const [rows, setRows] = useState<McpRow[] | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<McpRow | undefined>(undefined)
  const [tests, setTests] = useState<Record<string, TestState>>({})
  const [reloadWarning, setReloadWarning] = useState<string | undefined>(undefined)
  const [notice, setNotice] = useState<string | undefined>(undefined)

  async function load(): Promise<void> {
    const result = await window.aecpilot.listMcpServers()
    setRows(toMcpRows(result.servers, result.live))
  }

  useEffect(() => {
    let mounted = true
    window.aecpilot
      .listMcpServers()
      .then((result) => {
        if (mounted) setRows(toMcpRows(result.servers, result.live))
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      mounted = false
    }
  }, [])

  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true)
    setError(undefined)
    try {
      await action()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function toggle(row: McpRow): Promise<void> {
    await run(async () => {
      await window.aecpilot.setMcpServerEnabled({ name: row.name, enabled: !row.enabled })
      setNotice(
        row.enabled
          ? `Сервер ${row.name} выключен. Инструменты исчезнут у агента после переподключения.`
          : `Сервер ${row.name} включён. Его инструменты появятся у агента после переподключения.`
      )
    })
  }

  async function test(row: McpRow): Promise<void> {
    setTests((prev) => ({ ...prev, [row.name]: { running: true } }))
    try {
      const result = await window.aecpilot.testMcpServer(row.name)
      setTests((prev) => ({
        ...prev,
        [row.name]: {
          running: false,
          ok: result.ok,
          tools: Array.isArray(result.tools) ? result.tools.length : undefined,
          error: result.error
        }
      }))
    } catch (err) {
      setTests((prev) => ({
        ...prev,
        [row.name]: {
          running: false,
          ok: false,
          error: err instanceof Error ? err.message : String(err)
        }
      }))
    }
  }

  async function reload(confirm: boolean): Promise<void> {
    setBusy(true)
    setError(undefined)
    try {
      const result = await window.aecpilot.reloadMcpServers(confirm)
      if (result.status === 'confirm_required') {
        setReloadWarning(result.message ?? 'ядро просит подтверждение')
        return
      }
      setReloadWarning(undefined)
      setNotice('Серверы перечитаны.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="settings-section">
      {error && <div className="settings-popover__error">{error}</div>}
      {notice && <div className="settings-section__hint">{notice}</div>}

      <div className="settings-section__head">
        <div className="settings-section__hint">
          Инструменты MCP-серверов появляются у агента после переподключения.
        </div>
        <div className="settings-section__head-actions">
          <button
            type="button"
            className="settings-popover__link-btn"
            onClick={() => void reload(false)}
            disabled={busy || disabled}
          >
            Перечитать серверы
          </button>
          <button
            type="button"
            className="settings-popover__link-btn"
            onClick={() => setAdding(true)}
            disabled={busy || disabled || adding}
          >
            Добавить сервер
          </button>
        </div>
      </div>

      {reloadWarning && (
        <div
          className="settings-section__confirm"
          role="alertdialog"
          aria-label="Перечитать серверы"
        >
          <div>{reloadWarning}</div>
          <div className="settings-section__confirm-actions">
            <button type="button" onClick={() => void reload(true)} disabled={busy}>
              Всё равно перечитать
            </button>
            <button
              type="button"
              className="settings-popover__link-btn"
              onClick={() => setReloadWarning(undefined)}
              disabled={busy}
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {adding && (
        <McpServerForm
          existingNames={(rows ?? []).map((row) => row.name)}
          busy={busy}
          onCancel={() => setAdding(false)}
          onSubmit={(body) =>
            void run(async () => {
              await window.aecpilot.addMcpServer(body)
              setAdding(false)
              setNotice(`Сервер ${body.name} добавлен.`)
            })
          }
        />
      )}

      {rows && rows.length === 0 && (
        <div className="settings-section__empty">
          Серверов нет. MCP-сервер — это отдельная программа, дающая агенту инструменты; добавьте её
          кнопкой выше.
        </div>
      )}

      <ul className="mcp-list">
        {(rows ?? []).map((row) => {
          const testState = tests[row.name]
          return (
            <li key={row.name} className="mcp-row">
              <div className="mcp-row__head">
                <span className="mcp-row__name">
                  {row.name}
                  {row.ours && <span className="provider-row__badge">наш</span>}
                </span>
                <span className="mcp-row__transport">{row.transport}</span>
                <span className={`mcp-row__status mcp-row__status--${row.status}`}>
                  {MCP_STATUS_LABELS[row.status]}
                  {row.toolCount !== undefined && ` · ${row.toolCount} инстр.`}
                </span>
              </div>

              {row.error && <div className="settings-popover__error">{row.error}</div>}
              {row.url && <div className="mcp-row__detail">{row.url}</div>}
              {row.command && (
                <div className="mcp-row__detail">
                  {row.command} {row.args.join(' ')}
                </div>
              )}
              {row.envNames.length > 0 && (
                <div className="mcp-row__detail">
                  переменные: {row.envNames.join(', ')} (значения не показываем)
                </div>
              )}
              {row.liveOnly && (
                <div className="settings-popover__warning">
                  Сервер виден агенту, но его нет в конфигурации, которую отдаёт ядро — вероятно, он
                  из другого профиля.
                </div>
              )}

              {testState && (
                <div className="mcp-row__detail">
                  {testState.running
                    ? 'проверяю…'
                    : testState.ok
                      ? `сервер отвечает, инструментов: ${testState.tools ?? 0}`
                      : `не отвечает: ${testState.error ?? 'причина не названа'}`}
                </div>
              )}

              <div className="mcp-row__actions">
                <button
                  type="button"
                  className="settings-popover__link-btn"
                  onClick={() => void test(row)}
                  disabled={busy || disabled || row.liveOnly || testState?.running}
                >
                  Проверить
                </button>
                <button
                  type="button"
                  className="settings-popover__link-btn"
                  onClick={() => void toggle(row)}
                  disabled={busy || disabled || row.liveOnly}
                >
                  {row.enabled ? 'Выключить' : 'Включить'}
                </button>
                <button
                  type="button"
                  className="settings-popover__link-btn"
                  onClick={() => setRemoving(row)}
                  disabled={busy || disabled || row.liveOnly}
                >
                  Удалить
                </button>
              </div>

              {row.enabled && disableWarning(row) && (
                <div className="settings-popover__warning">{disableWarning(row)}</div>
              )}
            </li>
          )
        })}
      </ul>

      {removing && (
        <div className="settings-section__confirm" role="alertdialog" aria-label="Удалить сервер">
          <div>
            Удалить сервер «{removing.name}» вместе с его настройками и переменными окружения?
            Отменить это нельзя.
          </div>
          <div className="settings-section__confirm-actions">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await window.aecpilot.removeMcpServer({ name: removing.name, confirmed: true })
                  setRemoving(undefined)
                  setNotice(`Сервер ${removing.name} удалён.`)
                })
              }
            >
              Удалить
            </button>
            <button
              type="button"
              className="settings-popover__link-btn"
              onClick={() => setRemoving(undefined)}
              disabled={busy}
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
