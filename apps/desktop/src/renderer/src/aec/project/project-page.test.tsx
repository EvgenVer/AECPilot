// Задача 3H.28 (D-191, решение владельца 2026-10-08): в простом режиме строки
// состояния нет, и страница «Проект» — единственное место, где видно, какой
// проект открыт. Значит на ней то же, что в меню проекта: имя и путь, создать,
// открыть, недавние, настройки — и значки инструкций и расписаний.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AecI18nProvider } from '../../shared/i18n'
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

  it('показывает значок инструкций проекта', async () => {
    $projectSkills.set({ ...$projectSkills.get(), state: 'trusted', skills: [{}, {}] } as never)
    renderPage()
    expect(await screen.findByText('Инструкции проекта: 2')).toBeTruthy()
  })

  // T53.3 (решение 0017): рутины запускает планировщик ядра в едином шлюзе, у каждой —
  // своя пауза на её экране. Общего выключателя «Расписания» больше нет.
  it('общего выключателя расписаний на странице нет', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Нагатинская' })
    expect(screen.queryByText(/^Расписания:/)).toBeNull()
  })
})
