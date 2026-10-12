// Задача 3L.1 (D-206): панель сеансов — по открытому проекту. Проверяется то,
// без чего требование ломается: проект ядра находится по папке в любом
// написании пути, второй на ту же папку не заводится, вход идёт в его id, и
// пока нет связи с ядром, ничего не делается.

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { $gatewayState } from '../../donor/store/session'
import type { ProjectInfo } from '../../donor/types/hermes'

const { createProject, goToProject, request, requestFreshSession } = vi.hoisted(() => ({
  createProject: vi.fn(),
  goToProject: vi.fn(),
  request: vi.fn(),
  requestFreshSession: vi.fn()
}))

vi.mock('../../donor/store/session', async () => {
  const { atom } = await import('nanostores')
  return { $gatewayState: atom('idle') }
})
vi.mock('../../donor/store/profile', () => ({
  requestFreshSession: () => requestFreshSession()
}))
vi.mock('../../donor/store/projects', () => ({
  createProject: (...args: unknown[]) => createProject(...args),
  goToProject: (...args: unknown[]) => goToProject(...args),
  projectProfile: () => 'default'
}))
vi.mock('../../shared/gateway-bridge', () => ({
  gatewayBridge: () => ({ request: (...args: unknown[]) => request(...args) })
}))

import {
  folderKey,
  followOpenProjectSessions,
  projectForVault,
  scopeSessionsToProject
} from './session-scope'

const coreProject = (id: string, path: string, archived = false): ProjectInfo => ({
  archived,
  board_slug: null,
  color: null,
  created_at: 0,
  description: null,
  folders: [{ added_at: 0, is_primary: true, label: null, path }],
  icon: null,
  id,
  name: id,
  primary_path: path,
  slug: id
})

beforeEach(() => {
  request.mockReset()
  createProject.mockReset()
  goToProject.mockReset()
  requestFreshSession.mockReset()
  $gatewayState.set('idle')
})

/** Окно с открытым проектом `first`; возвращает «открыть проект». */
async function openedWith(first: { name: string; vaultPath: string }) {
  let opened: ((project: { name: string; vaultPath: string }) => void) | undefined
  Object.defineProperty(window, 'aecpilot', {
    configurable: true,
    value: {
      getCurrentProject: async () => first,
      onProjectOpened: (cb: typeof opened) => {
        opened = cb
        return () => undefined
      }
    }
  })
  followOpenProjectSessions()
  await vi.waitFor(() => expect(opened).toBeDefined())
  // Открытый при старте проект доходит обещанием — дождаться его.
  await new Promise((resolve) => setTimeout(resolve, 0))
  return (project: { name: string; vaultPath: string }) => opened?.(project)
}

describe('проект ядра на папку проекта (3L.1)', () => {
  it('папка одна и та же в любом написании пути', () => {
    expect(folderKey('C:\\Проекты\\Мост\\')).toBe(folderKey('c:/Проекты/Мост'))
    expect(folderKey('/home/user/Мост/')).toBe('/home/user/Мост')
  })

  it('находит заведённый проект по папке, архивный не считается', () => {
    const archived = coreProject('p_old', 'D:/Объекты/Мост', true)
    expect(projectForVault([archived], 'D:/Объекты/Мост')).toBeNull()
    const projects = [archived, coreProject('p_1', 'D:\\Объекты\\Мост')]
    expect(projectForVault(projects, 'd:/объекты/мост/')?.id).toBe('p_1')
  })

  it('заведённый раньше — только вход, второй проект не заводится', async () => {
    request.mockResolvedValue({ active_id: null, projects: [coreProject('p_1', 'D:\\Мост')] })
    await scopeSessionsToProject({ name: 'Мост', vaultPath: 'D:\\Мост' })
    expect(request).toHaveBeenCalledWith('projects.list', { profile: 'default' })
    expect(createProject).not.toHaveBeenCalled()
    expect(goToProject).toHaveBeenCalledWith('p_1')
  })

  it('нет проекта — заводится на папку проекта, и панель входит в него', async () => {
    request.mockResolvedValue({ active_id: null, projects: [] })
    createProject.mockResolvedValue(coreProject('p_new', 'D:\\Мост'))
    await scopeSessionsToProject({ name: 'Мост', vaultPath: 'D:\\Мост' })
    expect(createProject).toHaveBeenCalledWith({
      folders: ['D:\\Мост'],
      name: 'Мост',
      primaryPath: 'D:\\Мост'
    })
    expect(goToProject).toHaveBeenCalledWith('p_new')
  })

  it('список не прочитался — проект не заводится вслепую', async () => {
    request.mockRejectedValue(new Error('gateway is not connected'))
    await expect(scopeSessionsToProject({ name: 'Мост', vaultPath: 'D:\\Мост' })).rejects.toThrow()
    expect(createProject).not.toHaveBeenCalled()
  })

  it('открытие проекта ждёт связи с ядром и не заводит двух проектов', async () => {
    let opened: ((project: { name: string; vaultPath: string }) => void) | undefined
    Object.defineProperty(window, 'aecpilot', {
      configurable: true,
      value: {
        getCurrentProject: async () => ({ name: 'Мост', vaultPath: 'D:\\Мост' }),
        onProjectOpened: (cb: typeof opened) => {
          opened = cb
          return () => undefined
        }
      }
    })
    const projects: ProjectInfo[] = []
    request.mockImplementation(async () => ({ active_id: null, projects: [...projects] }))
    createProject.mockImplementation(async () => {
      const created = coreProject('p_new', 'D:\\Мост')
      projects.push(created)
      return created
    })

    followOpenProjectSessions()
    await vi.waitFor(() => expect(opened).toBeDefined())
    expect(request).not.toHaveBeenCalled()

    $gatewayState.set('open')
    opened?.({ name: 'Мост', vaultPath: 'D:\\Мост' })
    await vi.waitFor(() => expect(goToProject).toHaveBeenCalledTimes(2))
    expect(createProject).toHaveBeenCalledTimes(1)
    expect(goToProject).toHaveBeenNthCalledWith(2, 'p_new')
  })

  it('другой проект — открытый сеанс закрывается после входа в его проект ядра', async () => {
    request.mockResolvedValue({
      active_id: null,
      projects: [coreProject('p_a', 'D:\\Мост'), coreProject('p_b', 'D:\\Тоннель')]
    })
    $gatewayState.set('open')
    const open = await openedWith({ name: 'Мост', vaultPath: 'D:\\Мост' })
    await vi.waitFor(() => expect(goToProject).toHaveBeenCalledWith('p_a'))
    expect(requestFreshSession).not.toHaveBeenCalled()

    open({ name: 'Тоннель', vaultPath: 'D:\\Тоннель' })
    await vi.waitFor(() => expect(requestFreshSession).toHaveBeenCalledTimes(1))
    expect(goToProject).toHaveBeenLastCalledWith('p_b')
    expect(goToProject.mock.invocationCallOrder.at(-1)).toBeLessThan(
      requestFreshSession.mock.invocationCallOrder[0]
    )
  })

  it('тот же проект снова — сеанс остаётся открытым', async () => {
    request.mockResolvedValue({ active_id: null, projects: [coreProject('p_a', 'D:\\Мост')] })
    $gatewayState.set('open')
    const open = await openedWith({ name: 'Мост', vaultPath: 'D:\\Мост' })

    open({ name: 'Мост', vaultPath: 'd:/мост/' })
    await vi.waitFor(() => expect(goToProject).toHaveBeenCalledTimes(2))
    expect(requestFreshSession).not.toHaveBeenCalled()
  })

  it('смена проекта со страницы «Проект» не уводит с неё в новый чат (3L.10)', async () => {
    request.mockResolvedValue({
      active_id: null,
      projects: [coreProject('p_a', 'D:\\Мост'), coreProject('p_b', 'D:\\Тоннель')]
    })
    $gatewayState.set('open')
    const open = await openedWith({ name: 'Мост', vaultPath: 'D:\\Мост' })
    window.location.hash = '#/aec-project'

    open({ name: 'Тоннель', vaultPath: 'D:\\Тоннель' })
    await vi.waitFor(() => expect(goToProject).toHaveBeenLastCalledWith('p_b'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(requestFreshSession).not.toHaveBeenCalled()
    window.location.hash = ''
  })

  it('без связи с ядром смена проекта всё равно закрывает сеанс прежнего', async () => {
    const open = await openedWith({ name: 'Мост', vaultPath: 'D:\\Мост' })

    open({ name: 'Тоннель', vaultPath: 'D:\\Тоннель' })
    expect(requestFreshSession).toHaveBeenCalledTimes(1)
    expect(request).not.toHaveBeenCalled()
  })
})
