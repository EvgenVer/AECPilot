import { useState } from 'react'
import { ACTIVITIES, type ActivityId } from './activities'
import BottomPanel from './BottomPanel'
import ArtifactsTab from '../artifacts/ArtifactsTab'
import StarmapTab from '../starmap/StarmapTab'

const CENTER_EMPTY_HINT: Record<ActivityId, string> = {
  explorer: 'Откройте файл в проводнике, чтобы увидеть его здесь.',
  qa: 'Результаты поиска появятся здесь после запроса.',
  wiki: 'Выберите страницу вики, чтобы открыть её здесь.',
  sources: 'Управление источниками появится здесь.',
  memory: 'Записи памяти появятся здесь.',
  documents: 'Мастер генерации документов появится здесь.',
  agent: 'Раздел hub-а агента появится здесь.'
}

/** The center tabs batch 7 adds (PLAN §"Карта размещения экранов": артефакты и
 * карта — табы центральной области, «там уже живут вьюеры»).
 *
 * They open and close like a document tab, and both start closed: neither is
 * something the user is in the middle of, and an app that opens two panels
 * before being asked is an app that scans the session database at startup. */
export type CenterTabId = 'artifacts' | 'starmap'

const CENTER_TABS: { id: CenterTabId; label: string }[] = [
  { id: 'artifacts', label: 'Артефакты' },
  { id: 'starmap', label: 'Карта обучения' }
]

/** Center column (task 1.0): the tab strip (empty until something is opened —
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
  const [openTabs, setOpenTabs] = useState<CenterTabId[]>([])
  const [activeTab, setActiveTab] = useState<CenterTabId | null>(null)

  function openTab(id: CenterTabId): void {
    setOpenTabs((tabs) => (tabs.includes(id) ? tabs : [...tabs, id]))
    setActiveTab(id)
  }

  function closeTab(id: CenterTabId): void {
    setOpenTabs((tabs) => {
      const next = tabs.filter((tab) => tab !== id)
      // Focus falls to whatever is left, the way a closed editor hands focus to
      // its neighbour — not to an empty center with tabs still in the strip.
      setActiveTab((current) => (current === id ? (next.at(-1) ?? null) : current))
      return next
    })
  }

  return (
    <div className="center">
      <div className="center__tabstrip" role="tablist" aria-label="Открытые документы">
        {openTabs.map((id) => {
          const tab = CENTER_TABS.find((item) => item.id === id)
          return (
            <div
              key={id}
              className={`center__tab${activeTab === id ? ' center__tab--active' : ''}`}
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === id}
                className="center__tab-label"
                onClick={() => setActiveTab(id)}
              >
                {tab?.label}
              </button>
              <button
                type="button"
                className="center__tab-close"
                aria-label={`Закрыть «${tab?.label}»`}
                onClick={() => closeTab(id)}
              >
                ×
              </button>
            </div>
          )
        })}
      </div>
      <div className="center__body">
        {activeTab === 'artifacts' ? (
          <ArtifactsTab />
        ) : activeTab === 'starmap' ? (
          <StarmapTab />
        ) : (
          <div className="center__empty">
            <strong>{activity?.label}</strong>
            <span>{CENTER_EMPTY_HINT[active]}</span>
            <div className="center__openers">
              {CENTER_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className="center__opener"
                  onClick={() => openTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <BottomPanel height={bottomHeight} onResize={onResizeBottom} onCommit={onCommitSizes} />
    </div>
  )
}
