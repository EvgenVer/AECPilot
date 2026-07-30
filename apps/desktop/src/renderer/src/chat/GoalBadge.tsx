import { useCallback, useEffect, useState } from 'react'
import {
  NO_GOAL,
  goalBadgeLabel,
  goalControls,
  parseGoalStatus,
  shouldShowGoal,
  type GoalState
} from './goal-pure'

/** The standing goal, made visible (task 1.6.A5).
 *
 * A `/goal` does not just answer once — after every turn their judge decides
 * whether the goal is met, and if it is not, the gateway submits the next turn
 * by itself. Without this badge those turns arrive with nothing on screen
 * explaining them, and a session working on its own is indistinguishable from
 * an app that has started talking to itself.
 *
 * The state is polled rather than pushed: their gateway has no goal event, only
 * `GoalManager.status_line()` behind `/goal status`. Polling is therefore tied
 * to the only moments the state can have changed — mount, and the end of a turn
 * (which is exactly when the judge runs).
 *
 * Setting a goal is not offered here: `/goal <text>` returns a directive their
 * side expects submitted as a user turn, which typing it in the composer
 * already does. */
export default function GoalBadge() {
  const [goal, setGoal] = useState<GoalState>(NO_GOAL)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    const { output } = await window.aecpilot.dispatchGoal('status')
    setGoal(parseGoalStatus(output))
  }, [])

  // The goal state changes on the gateway's schedule, not on ours, so this is
  // a subscription to it rather than a render-driven fetch: their judge runs
  // when a turn ends, and `status.update` is what it speaks through. The one
  // fetch at mount is deferred to a microtask for the same reason — the effect
  // body itself must not drive a state update (react-hooks/set-state-in-effect).
  useEffect(() => {
    queueMicrotask(() => void refresh())
    return window.aecpilot.onChatEvent((event) => {
      if (event.type === 'message.complete' || event.type === 'error') void refresh()
    })
  }, [refresh])

  const control = useCallback(
    async (action: 'pause' | 'resume' | 'clear'): Promise<void> => {
      setBusy(true)
      try {
        await window.aecpilot.dispatchGoal(action)
        await refresh()
      } finally {
        setBusy(false)
      }
    },
    [refresh]
  )

  if (!shouldShowGoal(goal)) return null
  const controls = goalControls(goal)

  return (
    <div className={`goal-badge goal-badge--${goal.status}`} title={goal.raw}>
      <span className="goal-badge__label">{goalBadgeLabel(goal)}</span>
      {goal.text && <span className="goal-badge__text">{goal.text}</span>}
      {controls.pause && (
        <button type="button" disabled={busy} onClick={() => void control('pause')}>
          Пауза
        </button>
      )}
      {controls.resume && (
        <button type="button" disabled={busy} onClick={() => void control('resume')}>
          Возобновить
        </button>
      )}
      {controls.clear && (
        <button type="button" disabled={busy} onClick={() => void control('clear')}>
          Снять цель
        </button>
      )}
    </div>
  )
}
