import { useEffect, useState } from 'react'

interface KeyRow {
  envVar: string
  hasKey: boolean
  envOverrides: boolean
}

/** "Доступы" — API keys per provider (task 1.6.B2.5, owner decision R2).
 *
 * The keys live in this app's safeStorage-encrypted store, not in hermes's
 * `.env`: their own `model.save_key` RPC and `PUT /api/env` both write the key
 * as plaintext, which task 0.15 ruled out and a second provider does not
 * justify.
 *
 * What crosses the IPC boundary, in both directions, is deliberately thin: a
 * key goes IN once when saved, and nothing but `hasKey` ever comes back. There
 * is no reveal, no mask, no "last 4" — showing a key back to the user requires
 * being able to fetch it, and the cheapest way not to leak it is not to have
 * that path at all.
 *
 * Which env vars appear comes from the catalogue: `key_env` of every provider
 * that authenticates with an api key. `candidates` is passed in by the screen
 * so this section makes no catalogue call of its own. */
export default function KeysSection({
  candidates,
  disabled,
  onRestarted
}: {
  candidates: string[]
  disabled: boolean
  onRestarted: () => void
}) {
  const [rows, setRows] = useState<KeyRow[] | undefined>(undefined)
  const [encryptionAvailable, setEncryptionAvailable] = useState(true)
  const [error, setError] = useState<string | undefined>(undefined)
  const [editing, setEditing] = useState<string | undefined>(undefined)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)

  async function load(): Promise<void> {
    try {
      const result = await window.aecpilot.getProviderKeys(candidates)
      setRows(result.keys)
      setEncryptionAvailable(result.encryptionAvailable)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    let mounted = true
    window.aecpilot
      .getProviderKeys(candidates)
      .then((result) => {
        if (!mounted) return
        setRows(result.keys)
        setEncryptionAvailable(result.encryptionAvailable)
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      mounted = false
    }
  }, [candidates])

  async function save(envVar: string, key: string | null): Promise<void> {
    setSaving(true)
    setError(undefined)
    try {
      const result = await window.aecpilot.saveProviderKey({ envVar, key })
      // The value is dropped from component state the moment the call
      // returns — success or failure — so a failed save cannot leave a key
      // sitting in a React tree.
      setValue('')
      setEditing(undefined)
      if (!result.ok) {
        setError(result.error ?? 'не удалось сохранить ключ')
        return
      }
      if (result.restarted) onRestarted()
      await load()
    } catch (err) {
      setValue('')
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
      setValue('')
    }
  }

  return (
    <div className="settings-section">
      {!encryptionAvailable && (
        <div className="settings-popover__danger">
          safeStorage недоступен на этой машине — ключи сохранить нельзя. В открытом виде мы их не
          пишем.
        </div>
      )}
      {error && <div className="settings-popover__error">{error}</div>}

      <div className="settings-section__hint">
        Ключи хранятся в зашифрованном виде внутри приложения и передаются агенту только через
        окружение процесса. Показать сохранённый ключ нельзя — такого пути в коде нет.
      </div>

      {rows && rows.length === 0 && (
        <div className="settings-section__empty">
          Ни один провайдер из каталога не подключается ключом. Остальные настраиваются вне
          приложения — см. раздел «Провайдеры и модели».
        </div>
      )}

      <ul className="key-list">
        {(rows ?? []).map((row) => (
          <li key={row.envVar} className="key-row">
            <div className="key-row__head">
              <span className="key-row__name">{row.envVar}</span>
              <span className={`key-row__status${row.hasKey ? ' key-row__status--set' : ''}`}>
                {row.hasKey ? 'задан' : 'не задан'}
              </span>
            </div>

            {row.envOverrides && (
              <div className="settings-popover__warning">
                runtime/dev-profile/.env задаёт эту переменную — она имеет приоритет над сохранённым
                здесь ключом (dev-режим).
              </div>
            )}

            {editing === row.envVar ? (
              <div className="key-row__editor">
                <input
                  type="password"
                  autoComplete="new-password"
                  spellCheck={false}
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  placeholder="вставьте ключ"
                  disabled={saving}
                  aria-label={`Ключ ${row.envVar}`}
                />
                <button
                  type="button"
                  onClick={() => void save(row.envVar, value)}
                  disabled={saving || value.trim() === ''}
                >
                  {saving ? 'применяю (перезапуск агента)…' : 'Сохранить'}
                </button>
                <button
                  type="button"
                  className="settings-popover__link-btn"
                  onClick={() => {
                    setValue('')
                    setEditing(undefined)
                  }}
                  disabled={saving}
                >
                  Отмена
                </button>
              </div>
            ) : (
              <div className="key-row__actions">
                <button
                  type="button"
                  className="settings-popover__link-btn"
                  onClick={() => {
                    setValue('')
                    setEditing(row.envVar)
                  }}
                  disabled={disabled || saving || !encryptionAvailable}
                >
                  {row.hasKey ? 'Заменить' : 'Задать'}
                </button>
                {row.hasKey && (
                  <button
                    type="button"
                    className="settings-popover__link-btn"
                    onClick={() => void save(row.envVar, null)}
                    disabled={disabled || saving}
                  >
                    Удалить
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
