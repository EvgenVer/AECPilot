import { useState } from 'react'

/** The YOLO zap in the status bar (tasks 1.6.B5.21–B5.22). Contract:
 * specs/agent-sessions.md §YOLO.
 *
 * Two rules, and both protect something outside this control:
 *
 * 1. `enabled` comes from `session.info` and nowhere else. There is no local
 *    "on" here: their `config.set` reports what it did, but the agent is what
 *    decides, and a zap lit by our own click would keep claiming a bypass the
 *    session may not have.
 * 2. SESSION SCOPE ONLY (owner decision B5-5=A). Their global scope rewrites
 *    `approvals.mode` in config.yaml to `off`/`manual`, which would go around
 *    this app's own approvals selector (task 0.17) AND destroy its `smart`
 *    mode, since their zap only knows two states. The IPC call takes no scope
 *    argument at all, and `ConfigSetParams.scope` has no `'global'` member —
 *    the global path is not something this UI can reach by accident.
 *
 * Disabled without a live session, because that is not a cosmetic difference:
 * with no session their handler flips `HERMES_YOLO_MODE` in the gateway
 * process's environment, i.e. for every session it serves. */
export default function YoloToggle({
  yolo,
  hasSession,
  onError
}: {
  yolo: boolean
  hasSession: boolean
  onError: (message: string) => void
}) {
  const [busy, setBusy] = useState(false)

  async function toggle(): Promise<void> {
    setBusy(true)
    try {
      await window.aecpilot.setYolo(!yolo)
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      className={`yolo-toggle${yolo ? ' yolo-toggle--on' : ''}`}
      onClick={() => void toggle()}
      disabled={busy || !hasSession}
      aria-pressed={yolo}
      title={
        hasSession
          ? yolo
            ? 'YOLO включён для этой сессии: агент не спрашивает одобрений. Нажмите, чтобы выключить.'
            : 'YOLO: не спрашивать одобрений в этой сессии (только в ней)'
          : 'Нет живой сессии — YOLO переключается только в её пределах'
      }
    >
      <span aria-hidden="true">⚡</span> YOLO
    </button>
  )
}
