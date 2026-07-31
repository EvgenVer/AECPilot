// Pure logic behind the "Скилы" section of the Агент hub (tasks
// 1.6.B3.3–B3.9). Contract: specs/agent-skills.md.

import type { CuratorStatus, SkillRow } from '../../../shared/ipc'

export interface SkillCategory {
  name: string
  skills: SkillRow[]
}

/** Groups the flat `GET /api/skills` array by category, categories and skills
 * each in alphabetical order — the endpoint imposes none, and a list whose
 * order changes between reloads is unreadable. A skill with no category goes
 * under their own default name, `general`. */
export function groupSkillsByCategory(rows: SkillRow[] | undefined): SkillCategory[] {
  const byCategory = new Map<string, SkillRow[]>()
  for (const row of rows ?? []) {
    if (!row || typeof row.name !== 'string' || row.name === '') continue
    const category = row.category?.trim() || 'general'
    const bucket = byCategory.get(category)
    if (bucket) bucket.push(row)
    else byCategory.set(category, [row])
  }
  return [...byCategory.entries()]
    .map(([name, skills]) => ({
      name,
      skills: [...skills].sort((a, b) => a.name.localeCompare(b.name))
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function countSkills(categories: SkillCategory[]): number {
  return categories.reduce((total, category) => total + category.skills.length, 0)
}

/** A journey node id is either a bare skill name or `memory:<source>:<index>`
 * — their `parse_node_kind` (agent/learning_mutations.py) splits on exactly
 * that prefix. */
export function isMemoryNodeId(id: string): boolean {
  return id.startsWith('memory:')
}

/** The confirmation text for removing a node.
 *
 * The two outcomes are genuinely different and their own code says so:
 * `_delete_skill` archives (and tells you the restore command), `_delete_memory`
 * cuts the chunk out of the file. One shared "are you sure" would hide that
 * one of them is reversible and the other is not. */
export function describeDeleteConfirmation(id: string): string {
  if (isMemoryNodeId(id)) {
    return 'Запись памяти будет удалена безвозвратно — восстановить её нельзя.'
  }
  return `Скил «${id}» уйдёт в архив. Вернуть его можно командой ядра: hermes curator restore ${id}`
}

/** Summary line for `skills.reload`. Says "nothing changed" out loud: an
 * unchanged list after a reload otherwise reads as a button that did nothing. */
export function describeReload(result: {
  added: string[]
  removed: string[]
  total: number
}): string {
  const parts: string[] = []
  if (result.added.length > 0) parts.push(`добавлено: ${result.added.join(', ')}`)
  if (result.removed.length > 0) parts.push(`убрано: ${result.removed.join(', ')}`)
  if (parts.length === 0) parts.push('новых скилов не найдено')
  return `${parts.join('; ')} · всего ${result.total}`
}

/** The curator plate (task 1.6.B3.9).
 *
 * The first sentence is unconditional and is the point: under `hermes serve`
 * their background curator never runs, so nothing is archived by idleness no
 * matter what the config says. The rest is added only when the status actually
 * arrived — naming the thresholds shows WHAT is not happening, which is more
 * useful than "the feature is unavailable". */
export function describeCurator(status: CuratorStatus | undefined): string {
  const base =
    'Фоновый куратор под нашим запуском ядра не работает: автоархивации скилов по простою не происходит, что бы ни стояло в настройках. Архивировать и восстанавливать можно вручную.'
  if (!status) return base
  const details: string[] = []
  if (status.enabled === false) details.push('в настройках куратор выключен')
  if (status.paused) details.push('куратор поставлен на паузу')
  if (typeof status.archive_after_days === 'number') {
    details.push(`порог архивации — ${status.archive_after_days} дн. простоя`)
  }
  if (typeof status.min_idle_hours === 'number') {
    details.push(`минимальный простой — ${status.min_idle_hours} ч`)
  }
  details.push(
    status.last_run_at ? `последний прогон: ${status.last_run_at}` : 'ни разу не запускался'
  )
  return `${base} Настройки ядра: ${details.join(', ')}.`
}

export const SKILLS_EMPTY_HINT =
  'Скилов нет. Скил — это папка с SKILL.md в профиле агента; агент заводит их сам, когда учится, либо вы кладёте их туда руками.'
