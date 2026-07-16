import ApprovalsModeSelect from '../chat/ApprovalsModeSelect'
import type { GatewayConnectionState } from '../../../shared/gateway/types'

const CONNECTION_LABEL: Record<GatewayConnectionState, string> = {
  connecting: 'Подключение…',
  ready: 'Подключено',
  reconnecting: 'Переподключение…',
  closed: 'Отключено'
}

function dotClassName(state: GatewayConnectionState): string {
  if (state === 'ready') return 'statusbar__dot'
  if (state === 'closed') return 'statusbar__dot statusbar__dot--off'
  return 'statusbar__dot statusbar__dot--pending'
}

/** Status bar (task 1.0): the only functionally-live indicators are the
 * gateway connection state and the approvals mode (moved here from the chat
 * header per the approved design) — model/index/changes counters are
 * deferred to the phases that actually wire them (Phase 2+), so they are
 * intentionally omitted rather than faked. */
export default function StatusBar({
  connectionState,
  approvalsDisabled,
  onApprovalsError
}: {
  connectionState: GatewayConnectionState
  approvalsDisabled: boolean
  onApprovalsError: (message: string) => void
}) {
  return (
    <div className="statusbar">
      <div className="statusbar__item">
        <span className={dotClassName(connectionState)} />
        {CONNECTION_LABEL[connectionState]}
      </div>
      <div className="statusbar__sep" />
      <div className="statusbar__item">
        <ApprovalsModeSelect disabled={approvalsDisabled} onError={onApprovalsError} />
      </div>
      <div className="statusbar__spacer" />
      <div className="statusbar__item" title="Язык интерфейса (en/ru — Phase 4)">
        RU
      </div>
    </div>
  )
}
