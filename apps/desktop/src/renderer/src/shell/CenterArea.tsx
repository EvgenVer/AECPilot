import { ACTIVITIES, type ActivityId } from './activities'
import BottomPanel from './BottomPanel'

const CENTER_EMPTY_HINT: Record<ActivityId, string> = {
  explorer: 'Откройте файл в проводнике, чтобы увидеть его здесь.',
  qa: 'Результаты поиска появятся здесь после запроса.',
  wiki: 'Выберите страницу вики, чтобы открыть её здесь.',
  sources: 'Управление источниками появится здесь.',
  memory: 'Записи памяти появятся здесь.',
  documents: 'Мастер генерации документов появится здесь.',
  agent: 'Раздел hub-а агента появится здесь.'
}

/** Center column (task 1.0): an empty tab strip (no open documents yet —
 * viewers/editor land in Phase 1/3) plus the collapsible bottom panel. The
 * bottom panel's height (task 1.6.L2) is owned by Shell with the other panel
 * sizes and passed straight through. */
export default function CenterArea({
  active,
  bottomHeight,
  onResizeBottom,
  onCommitSizes
}: {
  active: ActivityId
  bottomHeight: number
  onResizeBottom: (height: number) => void
  onCommitSizes: () => void
}) {
  const activity = ACTIVITIES.find((item) => item.id === active)
  return (
    <div className="center">
      <div className="center__tabstrip" role="tablist" aria-label="Открытые документы" />
      <div className="center__body">
        <div className="center__empty">
          <strong>{activity?.label}</strong>
          <span>{CENTER_EMPTY_HINT[active]}</span>
        </div>
      </div>
      <BottomPanel height={bottomHeight} onResize={onResizeBottom} onCommit={onCommitSizes} />
    </div>
  )
}
