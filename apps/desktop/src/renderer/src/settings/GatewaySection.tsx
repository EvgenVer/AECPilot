import { useEffect, useState } from 'react'
import type { GatewayConnectionState } from '../../../shared/gateway/types'

const STATE_LABELS: Record<GatewayConnectionState, string> = {
  connecting: 'подключается',
  ready: 'подключён',
  reconnecting: 'переподключается',
  closed: 'нет связи'
}

/** "Шлюз" — diagnostics for the LOCAL backend (task 1.6.B2.14, owner decision
 * R4).
 *
 * Remote mode is not here: their WSS-to-someone-else's-gateway path was
 * deferred past 1.6 (decision 8). The section is shaped so it can gain a
 * "куда подключаться" control later without rearranging what is here now.
 *
 * The session token is not shown in any form. It is the credential for both
 * transports, and a diagnostics screen has no use for it — where it lives is
 * a main-process detail. */
export default function GatewaySection({
  disabled,
  onRestarted
}: {
  disabled: boolean
  onRestarted: () => void
}) {
  const [state, setState] = useState<GatewayConnectionState | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [notice, setNotice] = useState<string | undefined>(undefined)

  useEffect(() => {
    let mounted = true
    window.aecpilot
      .getGatewayState()
      .then((value) => {
        if (mounted) setState(value)
      })
      .catch(() => {
        if (mounted) setState('closed')
      })
    const unsubscribe = window.aecpilot.onGatewayState((value) => setState(value))
    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  async function restart(): Promise<void> {
    setBusy(true)
    setError(undefined)
    setNotice(undefined)
    try {
      // Reuses the settings-save path: saving with no fields changed restarts
      // the backend and nothing else, so there is one restart implementation
      // rather than two that can drift.
      const result = await window.aecpilot.saveLlmSettings({})
      if (!result.ok) {
        setError(result.error ?? 'не удалось перезапустить бэкенд')
        return
      }
      if (result.restarted) {
        onRestarted()
        setNotice('Бэкенд перезапущен, переписка текущей сессии сброшена.')
      } else {
        setNotice('Приложение подключено к внешнему шлюзу — перезапускать нечего.')
      }
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

      <div className="settings-section__row">
        <span>Состояние соединения</span>
        <strong>{state ? STATE_LABELS[state] : '…'}</strong>
      </div>

      {state === 'closed' && (
        <div className="settings-popover__warning">
          Агент недоступен: шлюз не отвечает. Перезапуск бэкенда обычно решает это.
        </div>
      )}

      <div className="settings-section__hint">
        Бэкенд hermes запускается самим приложением на локальном адресе. Журнал запуска — файл{' '}
        <code>runtime/dev-profile/serve.log</code> рядом с профилем.
      </div>

      <div className="settings-section__confirm-actions">
        <button type="button" onClick={() => void restart()} disabled={busy || disabled}>
          {busy ? 'перезапускаю…' : 'Перезапустить бэкенд'}
        </button>
      </div>
      <div className="settings-section__hint">
        Перезапуск обрывает текущую сессию агента — переписка на экране будет очищена.
      </div>
    </div>
  )
}
