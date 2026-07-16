import { useState } from 'react'
import { ChevronDownIcon } from './icons'

type BottomTab = 'indexing' | 'changes' | 'log'

const TABS: { id: BottomTab; label: string }[] = [
  { id: 'indexing', label: 'Индексация' },
  { id: 'changes', label: 'Изменения' },
  { id: 'log', label: 'Журнал' }
]

const TAB_EMPTY_HINT: Record<BottomTab, string> = {
  indexing: 'Индексация появится здесь (Phase 2).',
  changes: 'Обнаруженные изменения источников появятся здесь (задача 1.15).',
  log: 'Журнал сканирований появится здесь (Phase 2).'
}

/** Bottom panel (task 1.0): a collapsible stub for indexing/changes/log —
 * real content lands in Phase 2/1.15. */
export default function BottomPanel() {
  const [collapsed, setCollapsed] = useState(false)
  const [activeTab, setActiveTab] = useState<BottomTab>('indexing')

  return (
    <div
      className={
        collapsed ? 'bottom-panel bottom-panel--collapsed' : 'bottom-panel bottom-panel--expanded'
      }
    >
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
      {!collapsed && <div className="bottom-panel__body">{TAB_EMPTY_HINT[activeTab]}</div>}
    </div>
  )
}
