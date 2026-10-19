// Доступы Microsoft Graph: что настроено и чего не хватает (задача 3E.9а, UR34).
//
// ПОЧЕМУ ОКНО НАШЕ, А НЕ ИХ. Три переменные приложения Azure AD ядро читает
// ТОЛЬКО из окружения (`GraphCredentials.from_env`), а в каталоге переменных, по
// которому рисуются их экраны доступов, их нет вовсе. Без этого окна единственный
// способ их задать — руками дописать `.env` профиля, то есть положить секрет в
// открытый файл. Здесь они уезжают в наше шифрованное хранилище (решение
// владельца R2) и доходят до ядра окружением дочернего процесса.
//
// ПОЧЕМУ РЯДОМ С ПОЛЯМИ СТОИТ СПИСОК «ЧЕГО НЕ ХВАТАЕТ». Доступ складывается из
// четырёх независимых мест, и каждое молчит, когда его нет: два плагина, канал
// уведомлений и сами учётные данные. Ввести секрет и получить тишину — самый
// дорогой способ узнать об остальных трёх.
//
// ЭТО ОКНО НЕ ЗВОНИТ В MICROSOFT. Оно показывает состояние, а не доступ: живая
// проверка требует приложения Azure AD с выданными разрешениями, и её цена — не
// наша, чтобы платить её молча при открытии окна.

import { useStore } from '@nanostores/react'
import { useState } from 'react'

import { Button } from '../../donor/components/ui/button'
import { useAecT } from '../../shared/i18n'
import { CloseOnEscape } from '../CloseOnEscape'

import { $graphAccess, $graphAccessOpen, saveGraphKey } from './graph-access-store'

/** Подпись поля по имени переменной. Имена принадлежат ядру, подписи — человеку. */
const FIELD_LABELS: Record<string, string> = {
  MSGRAPH_CLIENT_ID: 'graphAccess.clientId',
  MSGRAPH_CLIENT_SECRET: 'graphAccess.clientSecret',
  MSGRAPH_TENANT_ID: 'graphAccess.tenant'
}

function KeyRow({
  envVar,
  hasKey,
  envOverrides,
  canEncrypt
}: {
  canEncrypt: boolean
  envOverrides: boolean
  envVar: string
  hasKey: boolean
}): React.JSX.Element {
  const t = useAecT()
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const run = async (value: null | string): Promise<void> => {
    setBusy(true)
    setError(await saveGraphKey(envVar, value))
    setBusy(false)
    if (value !== null) setDraft('')
  }

  const label = t(FIELD_LABELS[envVar] ?? envVar)

  return (
    <section className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold text-(--ui-text-primary)">{label}</h3>
        <span className="text-xs text-(--ui-text-secondary)">
          {t(hasKey ? 'graphAccess.stateSet' : 'graphAccess.stateMissing')}
        </span>
      </div>
      <code className="text-xs text-(--ui-text-secondary)">{envVar}</code>
      {envOverrides && (
        <p className="text-xs text-(--ui-text-danger)">{t('graphAccess.envOverride')}</p>
      )}
      <div className="flex items-center gap-2">
        <input
          aria-label={label}
          className="min-w-0 flex-1 rounded border border-(--ui-border) bg-(--ui-bg-primary) p-1.5 font-mono text-xs text-(--ui-text-primary)"
          disabled={busy || !canEncrypt}
          onChange={(event) => {
            setDraft(event.target.value)
            setError('')
          }}
          type="password"
          value={draft}
        />
        <Button
          disabled={busy || !canEncrypt || draft.trim() === ''}
          onClick={() => void run(draft.trim())}
          size="sm"
          variant="secondary"
        >
          {t('graphAccess.save')}
        </Button>
        {hasKey && (
          <Button disabled={busy} onClick={() => void run(null)} size="sm" variant="text">
            {t('graphAccess.clear')}
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-(--ui-text-danger)">{error}</p>}
    </section>
  )
}

function Readiness(): React.JSX.Element {
  const t = useAecT()
  const state = useStore($graphAccess)

  if (!state.profileRead) {
    return <p className="text-xs text-(--ui-text-secondary)">{t('graphAccess.profileUnread')}</p>
  }

  const complete = state.keys.length > 0 && state.keys.every((key) => key.hasKey)
  const rows: [boolean, string][] = [
    [complete, 'graphAccess.needCredentials'],
    [state.readiness.plugins.pipeline, 'graphAccess.needPipeline'],
    [state.readiness.channels.notifications, 'graphAccess.needNotifications'],
    [state.readiness.plugins.channel, 'graphAccess.needChannelPlugin'],
    [state.readiness.channels.teams, 'graphAccess.needTeams']
  ]

  return (
    <ul className="flex flex-col gap-1">
      {rows.map(([done, key]) => (
        <li className="text-xs text-(--ui-text-secondary)" key={key}>
          <span className={done ? 'text-(--ui-text-primary)' : 'text-amber-500'}>
            {done ? t('graphAccess.checkDone') : t('graphAccess.checkMissing')}
          </span>
          {' — '}
          {t(key)}
        </li>
      ))}
    </ul>
  )
}

export default function GraphAccessDialog(): React.JSX.Element | null {
  const open = useStore($graphAccessOpen)
  const state = useStore($graphAccess)
  const t = useAecT()

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-(--z-modal) flex items-center justify-center bg-black/40 p-4"
      onClick={() => $graphAccessOpen.set(false)}
      role="presentation"
    >
      <CloseOnEscape onClose={() => $graphAccessOpen.set(false)} />
      <div
        aria-label={t('graphAccess.title')}
        aria-modal="true"
        className="flex max-h-[85vh] w-full max-w-xl flex-col gap-4 overflow-y-auto rounded-lg border border-(--stroke-nous) bg-(--ui-chat-bubble-background) p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <h2 className="text-sm font-semibold text-(--ui-text-primary)">{t('graphAccess.title')}</h2>
        <p className="text-xs text-(--ui-text-secondary)">{t('graphAccess.lead')}</p>
        <p className="text-xs text-amber-500">{t('graphAccess.tenantWarning')}</p>

        {!state.encryptionAvailable && (
          <p className="text-xs text-(--ui-text-danger)">{t('graphAccess.noEncryption')}</p>
        )}

        {state.keys.map((key) => (
          <KeyRow
            canEncrypt={state.encryptionAvailable}
            envOverrides={key.envOverrides}
            envVar={key.envVar}
            hasKey={key.hasKey}
            key={key.envVar}
          />
        ))}

        <p className="text-xs text-(--ui-text-secondary)">{t('graphAccess.restartNote')}</p>

        <section className="flex flex-col gap-1 border-t border-(--ui-border) pt-3">
          <h3 className="text-xs font-semibold text-(--ui-text-primary)">
            {t('graphAccess.readinessTitle')}
          </h3>
          <Readiness />
          <p className="text-xs text-(--ui-text-secondary)">{t('graphAccess.noLiveCheck')}</p>
        </section>

        <div className="flex justify-end">
          <Button onClick={() => $graphAccessOpen.set(false)} size="sm" variant="secondary">
            {t('common.close')}
          </Button>
        </div>
      </div>
    </div>
  )
}
