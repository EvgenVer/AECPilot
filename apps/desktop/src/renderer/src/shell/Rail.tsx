import { ACTIVITIES, type ActivityId } from './activities'
import { activityIcon, SettingsIcon } from './icons'

/** Left activity rail (task 1.0): switches the active activity, which
 * drives the contextual sidebar/center empty-state. Every activity besides
 * the chat dock is a stub in this task — see TASKS.md 1.3+/1.6+ etc for the
 * real screens. */
export default function Rail({
  active,
  onSelect,
  onSettings
}: {
  active: ActivityId
  onSelect: (id: ActivityId) => void
  onSettings: () => void
}) {
  return (
    <nav className="rail" aria-label="Активности">
      {ACTIVITIES.map((activity) => {
        const Icon = activityIcon(activity.id)
        const isActive = activity.id === active
        return (
          <button
            key={activity.id}
            type="button"
            title={activity.label}
            aria-label={activity.label}
            aria-pressed={isActive}
            className={isActive ? 'rail__item rail__item--active' : 'rail__item'}
            onClick={() => onSelect(activity.id)}
          >
            <Icon width={19} height={19} />
          </button>
        )
      })}
      <div className="rail__spacer" />
      <button
        type="button"
        title="Настройки"
        aria-label="Настройки"
        className="rail__item"
        onClick={onSettings}
      >
        <SettingsIcon width={19} height={19} />
      </button>
    </nav>
  )
}
