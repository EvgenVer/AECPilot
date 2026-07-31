import { useState } from 'react'
import {
  buildMcpCreateBody,
  EMPTY_MCP_FORM,
  validateMcpForm,
  type McpFormValues
} from './mcp-form-pure'

/** Add-an-MCP-server form (task 1.6.B2.10).
 *
 * There is no edit form: their REST surface has POST, DELETE and the enabled
 * toggle, but no PUT for a server's body — editing would mean delete + re-add,
 * which silently loses the env map if the re-add fails. Changing a server is
 * therefore "remove it, add it again", stated rather than faked. */
export default function McpServerForm({
  existingNames,
  busy,
  onCancel,
  onSubmit
}: {
  existingNames: string[]
  busy: boolean
  onCancel: () => void
  onSubmit: (body: ReturnType<typeof buildMcpCreateBody>) => void
}) {
  const [values, setValues] = useState<McpFormValues>(EMPTY_MCP_FORM)
  const [error, setError] = useState<string | undefined>(undefined)

  function set<K extends keyof McpFormValues>(key: K, value: McpFormValues[K]): void {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  function submit(): void {
    const validation = validateMcpForm(values, existingNames)
    if (!validation.ok) {
      setError(validation.error)
      return
    }
    setError(undefined)
    onSubmit(buildMcpCreateBody(values))
  }

  return (
    <div className="mcp-form" role="group" aria-label="Новый MCP-сервер">
      <label className="settings-popover__field">
        Имя
        <input
          type="text"
          value={values.name}
          onChange={(event) => set('name', event.target.value)}
          disabled={busy}
        />
      </label>

      <div className="settings-popover__field">
        <span>Транспорт</span>
        <div className="theme-switch" role="group" aria-label="Транспорт">
          <button
            type="button"
            className={`theme-switch__option${
              values.transport === 'stdio' ? ' theme-switch__option--active' : ''
            }`}
            aria-pressed={values.transport === 'stdio'}
            onClick={() => set('transport', 'stdio')}
            disabled={busy}
          >
            Локальный (stdio)
          </button>
          <button
            type="button"
            className={`theme-switch__option${
              values.transport === 'http' ? ' theme-switch__option--active' : ''
            }`}
            aria-pressed={values.transport === 'http'}
            onClick={() => set('transport', 'http')}
            disabled={busy}
          >
            По сети (http)
          </button>
        </div>
      </div>

      {values.transport === 'http' ? (
        <label className="settings-popover__field">
          URL
          <input
            type="text"
            value={values.url}
            onChange={(event) => set('url', event.target.value)}
            placeholder="https://example.com/mcp"
            disabled={busy}
          />
        </label>
      ) : (
        <>
          <label className="settings-popover__field">
            Команда
            <input
              type="text"
              value={values.command}
              onChange={(event) => set('command', event.target.value)}
              placeholder="my-mcp-server.exe"
              disabled={busy}
            />
          </label>
          <label className="settings-popover__field">
            Аргументы
            <input
              type="text"
              value={values.args}
              onChange={(event) => set('args', event.target.value)}
              placeholder="--flag значение"
              disabled={busy}
            />
          </label>
        </>
      )}

      <label className="settings-popover__field">
        Переменные окружения (KEY=значение, по строке)
        <textarea
          value={values.env}
          onChange={(event) => set('env', event.target.value)}
          rows={3}
          disabled={busy}
        />
      </label>
      <div className="settings-section__hint">
        Значения переменных приложение не показывает и не читает обратно — их хранит ядро в своём
        config.yaml.
      </div>

      {error && <div className="settings-popover__error">{error}</div>}

      <div className="settings-section__confirm-actions">
        <button type="button" onClick={submit} disabled={busy}>
          {busy ? 'добавляю…' : 'Добавить'}
        </button>
        <button
          type="button"
          className="settings-popover__link-btn"
          onClick={onCancel}
          disabled={busy}
        >
          Отмена
        </button>
      </div>
    </div>
  )
}
