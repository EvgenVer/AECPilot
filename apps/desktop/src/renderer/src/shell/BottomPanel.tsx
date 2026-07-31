import { useState } from 'react'
import { ChevronDownIcon } from './icons'
import PanelResizer from './PanelResizer'
import { PANEL_BOUNDS } from './panel-sizes-pure'
import ProcessesTab from './ProcessesTab'

type BottomTab = 'indexing' | 'changes' | 'log' | 'processes'

const TABS: { id: BottomTab; label: string }[] = [
  { id: 'indexing', label: 'Индексация' },
  { id: 'changes', label: 'Изменения' },
  { id: 'log', label: 'Журнал' },
  { id: 'processes', label: 'Процессы' }
]

const TAB_EMPTY_HINT: Record<BottomTab, string> = {
  indexing: 'Индексация появится здесь (Phase 2).',
  changes: 'Обнаруженные изменения источников появятся здесь (задача 1.15).',
  log: 'Журнал сканирований появится здесь (Phase 2).',
  processes: ''
}

/** Bottom panel (task 1.0): a collapsible stub for indexing/changes/log —
 * real content lands in Phase 2/1.15. Its height is draggable while expanded
 * (task 1.6.L2); the value itself lives in Shell with the other panel sizes,
 * so it is persisted and reset the same way. Collapsed, there is nothing to
 * resize — the panel is then just its header — so the separator is not
 * rendered at all. */
export default function BottomPanel({
  height,
  onResize,
  onCommit
}: {
  height: number
  onResize: (height: number) => void
  onCommit: () => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [activeTab, setActiveTab] = useState<BottomTab>('indexing')

  return (
    <div
      className={
        collapsed ? 'bottom-panel bottom-panel--collapsed' : 'bottom-panel bottom-panel--expanded'
      }
    >
      {!collapsed && (
        <PanelResizer
          label="Изменить высоту нижней панели"
          orientation="horizontal"
          size={height}
          min={PANEL_BOUNDS.bottom.min}
          max={PANEL_BOUNDS.bottom.max}
          defaultSize={PANEL_BOUNDS.bottom.default}
          direction={-1}
          onResize={onResize}
          onCommit={onCommit}
        />
      )}
      <div className="bottom-panel__header">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={
              tab.id === activeTab
                ? 'bottom-panel__tab bottom-panel__tab--active'
                : 'bottom-panel__tab'
            }
            onClick={() => {
              setActiveTab(tab.id)
              setCollapsed(false)
            }}
          >
            {tab.label}
          </button>
        ))}
        <div className="bottom-panel__spacer" />
        <button
          type="button"
          className="bottom-panel__collapse"
          aria-label={collapsed ? 'Развернуть нижнюю панель' : 'Свернуть нижнюю панель'}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((value) => !value)}
        >
          <ChevronDownIcon
            width={14}
            height={14}
            style={{ transform: collapsed ? 'rotate(-90deg)' : undefined }}
          />
        </button>
      </div>
      {!collapsed && (
        <div className="bottom-panel__body">
          {activeTab === 'processes' ? (
            // `active` gates the polling: a collapsed panel or another tab
            // means nobody can see the list, and a timer hitting the gateway
            // for it would be pure waste (task 1.6.B2a.4).
            <ProcessesTab active={!collapsed && activeTab === 'processes'} />
          ) : (
            TAB_EMPTY_HINT[activeTab]
          )}
        </div>
      )}
    </div>
  )
}
