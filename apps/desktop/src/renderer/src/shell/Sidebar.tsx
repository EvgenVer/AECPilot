import { ACTIVITIES, type ActivityId } from './activities'

const SIDEBAR_EMPTY_HINT: Record<ActivityId, string> = {
  explorer: 'Дерево vault и источников появится здесь (задачи 1.3–1.8).',
  qa: 'Поиск по проекту появится здесь (Phase 2).',
  wiki: 'Дерево страниц вики появится здесь (Phase 3).',
  sources: 'Список подключённых источников появится здесь (задача 1.7).',
  memory: 'Записи памяти появятся здесь (Phase 4).',
  documents: 'Мастер генерации документов появится здесь (Phase 4).',
  agent: 'Персона, скиллы, MCP-серверы агента появятся здесь (Phase 4).'
}

/** Contextual sidebar (task 1.0): content depends on the active rail
 * activity. Every activity is a stub for this task — an empty state naming
 * the section, per the coordinator's scope decision. */
export default function Sidebar({ active }: { active: ActivityId }) {
  const activity = ACTIVITIES.find((item) => item.id === active)
  return (
    <aside className="sidebar">
      <div className="sidebar__header">{activity?.label}</div>
      <div className="sidebar__empty">{SIDEBAR_EMPTY_HINT[active]}</div>
    </aside>
  )
}
