// Задача 3H.28 (D-191, решение владельца 2026-10-08): в простом режиме строки
// состояния нет, и страница «Проект» — единственное место, где видно, какой
// проект открыт. Значит на ней то же, что в меню проекта: имя и путь, создать,
// открыть, недавние, настройки — и значки инструкций и расписаний.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AecI18nProvider } from '../../shared/i18n'
import { $cronRunner } from '../cron-runner/store'
import { $projectSkills } from '../project-skills/store'

import ProjectPage from './ProjectPage'

const openProject = vi.fn()

beforeEach(() => {
  openProject.mockResolvedValue({ ok: true })
  window.aecpilot = {
    getCurrentProject: () => Promise.resolve({ name: 'Нагатинская', vaultPath: 'D:\\p\\nag' }),
    listRecentProjects: () =>
      Promise.resolve([
        { name: 'Нагатинская', vaultPath: 'D:\\p\\nag' },
        { name: 'Школа', vaultPath: 'D:\\p\\school' }
      ]),
    openProject
  } as unknown as typeof window.aecpilot
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  $projectSkills.set({ ...$projectSkills.get(), state: 'none' })
  $cronRunner.set({ enabled: false, running: false })
})

function renderPage(): void {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AecI18nProvider>
        <ProjectPage />
      </AecI18nProvider>
    </QueryClientProvider>
  )
}

describe('страница «Проект»', () => {
  it('называет открытый проект и его папку, даёт действия меню', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Нагатинская' })).toBeTruthy())
    expect(screen.getByText('D:\\p\\nag')).toBeTruthy()
    for (const label of ['Создать проект', 'Открыть проект', 'Настройки проекта']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
  })

  it('недавние — без открытого, щелчок открывает проект', async () => {
    renderPage()
    const recent = await screen.findByRole('button', { name: 'Школа' })
    expect(screen.queryByRole('button', { name: 'Нагатинская' })).toBeNull()
    fireEvent.click(recent)
    await waitFor(() => expect(openProject).toHaveBeenCalledWith('D:\\p\\school'))
  })

  it('показывает значки инструкций проекта и расписаний', async () => {
    $projectSkills.set({ ...$projectSkills.get(), state: 'trusted', skills: [{}, {}] } as never)
    $cronRunner.set({ enabled: true, running: true })
    renderPage()
    expect(await screen.findByText('Инструкции проекта: 2')).toBeTruthy()
    expect(screen.getByText('Расписания: работают')).toBeTruthy()
  })
})
