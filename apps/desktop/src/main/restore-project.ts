// Задача 3G.20 (находка D-89): после перезапуска приложение открывает последний
// проект само — тем же путём, что `project:open`.
//
// `currentProject` жил только в памяти главного процесса, и после перезапуска
// гейт показывал экран выбора с этим же проектом в «недавних». Восстановление
// идёт ДО подъёма ядра и до первого окна: регистрация MCP-серверов проекта
// ложится в конфиг раньше, чем ядро его прочтёт, а гейт на первый же вопрос
// получает проект — без мелькания экрана выбора.
//
// Проект, который открыть нельзя (папки нет, `project.json` битый или его нет),
// — не ошибка запуска: остаётся экран выбора, молча. Решать, что делать с
// пропавшим проектом, человеку, а не старту приложения.

import { type OpenProject, type OpenProjectResult, openProject } from './project-manager'
import type { RecentProject } from './recents-pure'

export type RestoreOutcome = 'restored' | 'none' | 'unavailable'

export async function restoreLastProject(
  recents: RecentProject[],
  activate: (project: OpenProject) => Promise<void>,
  open: (vaultPath: string) => OpenProjectResult = openProject
): Promise<RestoreOutcome> {
  const last = recents[0]
  if (!last) return 'none'

  const result = open(last.vaultPath)
  if ('needsInit' in result || !result.ok) return 'unavailable'

  await activate(result.project)
  return 'restored'
}
