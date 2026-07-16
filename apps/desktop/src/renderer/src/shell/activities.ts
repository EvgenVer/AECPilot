// Shared activity list for the workspace shell (task 1.0). Every activity
// beyond the chat dock is a stub in this task — the rail switches the
// sidebar/center empty-state label, but no real content is built yet (see
// TASKS.md 1.3+/1.6+/etc for the real screens).

export type ActivityId = 'explorer' | 'qa' | 'wiki' | 'sources' | 'memory' | 'documents' | 'agent'

export interface Activity {
  id: ActivityId
  label: string
}

export const ACTIVITIES: Activity[] = [
  { id: 'explorer', label: 'Проводник' },
  { id: 'qa', label: 'Q&A' },
  { id: 'wiki', label: 'Вики' },
  { id: 'sources', label: 'Источники' },
  { id: 'memory', label: 'Память' },
  { id: 'documents', label: 'Документы' },
  { id: 'agent', label: 'Агент' }
]
