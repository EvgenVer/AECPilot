// Инструкции проекта: состояние и решение человека (задача 3.8а, SPEC UR29).
//
// Читается при каждом открытии проекта, потому что вопрос «доверяем ли мы
// инструкциям ЭТОЙ папки» задаётся заново для каждой папки — и потому что
// содержимое могло измениться между двумя открытиями.

import { atom } from 'nanostores'

import type { ProjectSkillsView } from '../../../../shared/ipc'

export const EMPTY: ProjectSkillsView = { state: 'none', skills: [], shadowed: [] }

export const $projectSkills = atom<ProjectSkillsView>(EMPTY)

/** Открыт ли разбор — окно со списком инструкций. Отдельно от состояния:
 * человек может закрыть его и открыть снова из строки состояния. */
export const $projectSkillsOpen = atom<boolean>(false)

export async function refreshProjectSkills(): Promise<ProjectSkillsView> {
  const view = await window.aecpilot.getProjectSkills()
  $projectSkills.set(view)
  return view
}

export async function trustProjectSkills(trusted: boolean): Promise<void> {
  $projectSkills.set(await window.aecpilot.setProjectSkillsTrust(trusted))
  $projectSkillsOpen.set(false)
}
