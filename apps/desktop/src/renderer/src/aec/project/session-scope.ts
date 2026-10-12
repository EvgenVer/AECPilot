// Сеансы — по открытому проекту (задача 3L.1, D-206, SPEC UR46).
//
// Требование задачи 1.20 — в списке только сеансы открытого проекта — держал
// наш канал `sessions:list`. Боковая панель донора берёт сеансы у ядра сама
// (`projects.tree`) и этого фильтра не видит: после переезда на неё список
// показывал сеансы всех проектов. У донора есть свой «вход» в проект — панель
// показывает только его сеансы, а новый сеанс начинается в его папке. Входить
// надо в ЯВНЫЙ проект ядра: авто-проект по папке сеанса появляется только с
// первым сеансом, и вход в несуществующий донор сбрасывает. Поэтому на папку
// нашего проекта заводится проект ядра (или находится заведённый раньше), и
// панель входит в него — при открытии проекта и при каждом подключении к ядру.
// При смене проекта открытый сеанс прежнего закрывается: следующее сообщение
// начинает новый сеанс в папке нового.

import type { OpenProject } from '../../../../shared/ipc'
import { requestFreshSession } from '../../donor/store/profile'
import { createProject, goToProject, projectProfile } from '../../donor/store/projects'
import { $gatewayState } from '../../donor/store/session'
import type { ProjectInfo, ProjectsPayload } from '../../donor/types/hermes'
import { gatewayBridge } from '../../shared/gateway-bridge'

/** Одна папка — независимо от направления косых черт, хвостовой черты и, у
 *  пути с буквой диска, регистра. */
export function folderKey(path: string): string {
  const slashed = path.trim().replace(/\\/g, '/').replace(/\/+$/, '')
  return /^[a-zA-Z]:/.test(slashed) ? slashed.toLowerCase() : slashed
}

/** Проект ядра, заведённый на папку этого проекта, если он есть. */
export function projectForVault(
  projects: readonly ProjectInfo[],
  vaultPath: string
): null | ProjectInfo {
  const key = folderKey(vaultPath)
  return (
    projects.find(
      (project) =>
        !project.archived &&
        (project.folders.some((folder) => folderKey(folder.path) === key) ||
          (project.primary_path !== null && folderKey(project.primary_path) === key))
    ) ?? null
  )
}

/** Найти или завести проект ядра на папку проекта и войти в него. Список
 *  читается прямо у ядра: неудачное чтение оставило бы у донора прежний
 *  список, и по нему завёлся бы второй проект на ту же папку. */
export async function scopeSessionsToProject(project: OpenProject): Promise<void> {
  const profile = projectProfile()
  if (!profile) return
  const listed = await gatewayBridge().request<ProjectsPayload>('projects.list', { profile })
  const core =
    projectForVault(listed.projects ?? [], project.vaultPath) ??
    (await createProject({
      folders: [project.vaultPath],
      name: project.name,
      primaryPath: project.vaultPath
    }))
  if (core) goToProject(core.id)
}

/** Держать панель сеансов на открытом проекте. Шаги идут по одному: открытие
 *  проекта и подключение к ядру приходят почти вместе, и два параллельных шага
 *  завели бы два проекта ядра на одну папку.
 *
 *  Смена проекта ещё и закрывает открытый сеанс — свежим черновиком донора
 *  (`requestFreshSession`, тем же, чем он отвечает на удаление проекта
 *  открытого сеанса). Иначе следующее сообщение ушло бы в сеанс прежнего
 *  проекта, в его папку. Черновик просится ПОСЛЕ входа в проект ядра: новый
 *  сеанс донор начинает в папке входа.
 *
 *  Кроме случая, когда вместо чата открыта наша страница («Проект», «Индекс»,
 *  «Память»): черновик донора уводит на маршрут нового чата и закрыл бы
 *  страницу, с которой человек проект и сменил (3L.10, приёмка 2.3.2). Чата
 *  перед ним нет, а уйдёт он со страницы сам — в сеанс нового проекта из
 *  списка или в новый чат; сеансов прежнего в списке уже нет. */
/** Начало маршрутов наших страниц (`workspace-pages.ts`; модуль не берём —
 *  он тянет роутер донора). */
const WORKSPACE_PAGE_HASH = '#/aec-'

export function followOpenProjectSessions(): void {
  let current: null | OpenProject = null
  let queue: Promise<void> = Promise.resolve()

  const sync = (switched = false): void => {
    const project = current
    if (!project) return
    const fresh = switched && !window.location.hash.startsWith(WORKSPACE_PAGE_HASH)
    if ($gatewayState.get() !== 'open') {
      if (fresh) requestFreshSession()
      return
    }
    queue = queue
      .then(() => scopeSessionsToProject(project))
      .catch((error: unknown) => {
        console.warn('aecpilot: could not scope sessions to the open project', error)
      })
      .then(() => {
        if (fresh) requestFreshSession()
      })
  }

  void window.aecpilot.getCurrentProject().then((project) => {
    current = project ?? null
    sync()
  })
  window.aecpilot.onProjectOpened((project) => {
    const switched =
      current !== null && folderKey(current.vaultPath) !== folderKey(project.vaultPath)
    current = project
    sync(switched)
  })
  $gatewayState.listen((state) => {
    if (state === 'open') sync()
  })
}
