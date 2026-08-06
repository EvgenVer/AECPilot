// The gate decides which of the two applications is on screen, so its whole
// contract is: never show the wrong one, and never flash.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

import { ProjectGate } from './ProjectGate'
import { AecI18nProvider } from '../../shared/i18n'

let openedCallback: (() => void) | undefined
const getCurrentProject = vi.fn()
const unsubscribe = vi.fn()

beforeEach(() => {
  window.localStorage.clear()
  openedCallback = undefined
  window.aecpilot = {
    getCurrentProject,
    listRecentProjects: vi.fn().mockResolvedValue([]),
    onProjectOpened: (cb: () => void) => {
      openedCallback = cb
      return unsubscribe
    }
  } as unknown as typeof window.aecpilot
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderGate() {
  return render(
    <AecI18nProvider>
      <ProjectGate>
        <div>их приложение</div>
      </ProjectGate>
    </AecI18nProvider>
  )
}

describe('ProjectGate', () => {
  it('paints nothing until main has answered', () => {
    getCurrentProject.mockReturnValue(new Promise(() => {}))
    const { container } = renderGate()
    // Not "Welcome for a moment, then the app" — that flash would hit every
    // start with a project already open, which is the common case.
    expect(container.textContent).toBe('')
  })

  it('shows their application when a project is already open', async () => {
    getCurrentProject.mockResolvedValue({ name: 'Объект-X', vaultPath: 'D:/vault' })
    renderGate()
    await waitFor(() => expect(screen.getByText('их приложение')).toBeTruthy())
  })

  it('shows our project screen when there is none', async () => {
    getCurrentProject.mockResolvedValue(null)
    renderGate()
    await waitFor(() => expect(screen.getByText('Создать проект')).toBeTruthy())
    expect(screen.queryByText('их приложение')).toBeNull()
  })

  it('hands over to their application once a project opens', async () => {
    getCurrentProject.mockResolvedValue(null)
    renderGate()
    await waitFor(() => expect(screen.getByText('Создать проект')).toBeTruthy())

    openedCallback?.()

    await waitFor(() => expect(screen.getByText('их приложение')).toBeTruthy())
    expect(screen.queryByText('Создать проект')).toBeNull()
  })

  it('drops its subscription on unmount', async () => {
    getCurrentProject.mockResolvedValue(null)
    const view = renderGate()
    await waitFor(() => expect(screen.getByText('Создать проект')).toBeTruthy())
    view.unmount()
    expect(unsubscribe).toHaveBeenCalled()
  })
})
