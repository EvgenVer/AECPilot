// Task 1.8.6's acceptance check: switching the interface language changes what
// two different screens render. One is ours end to end (Welcome), the other is
// the screen that owns the switch (the settings language section) — so the test
// covers both "a screen reads the active locale" and "a screen sets it".
//
// Both screens read our namespaced catalog; their own catalog rides the same
// provider and is exercised by the config-client test next door.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'

import { AecI18nProvider } from './index'
import Welcome from '../../shell/Welcome'
import { LanguageSection } from '../../settings/ProjectSettingsSections'

beforeEach(() => {
  window.localStorage.clear()
  window.aecpilot = {
    listRecentProjects: vi.fn().mockResolvedValue([]),
    getProjectSettings: vi.fn().mockResolvedValue(null),
    updateProjectSettings: vi.fn().mockResolvedValue({ ok: true })
  } as unknown as typeof window.aecpilot
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderIn(children: React.ReactNode) {
  return render(<AecI18nProvider>{children}</AecI18nProvider>)
}

describe('interface language', () => {
  it('starts in Russian — the default for a fresh install', async () => {
    renderIn(<Welcome />)
    await waitFor(() => expect(screen.getByText('Создать проект')).toBeTruthy())
    expect(screen.getByText('IDE для проектной документации')).toBeTruthy()
  })

  it('starts in English when that is what the user picked before', async () => {
    window.localStorage.setItem('aecpilot.ui-language', 'en')
    renderIn(<Welcome />)
    await waitFor(() => expect(screen.getByText('New project')).toBeTruthy())
    expect(screen.getByText('An IDE for project documentation')).toBeTruthy()
  })

  it('switches both screens at once and remembers the choice', async () => {
    renderIn(
      <>
        <Welcome />
        <LanguageSection />
      </>
    )

    await waitFor(() => expect(screen.getByText('Создать проект')).toBeTruthy())

    await act(async () => {
      screen.getByRole('button', { name: 'English' }).click()
    })

    // The settings screen set it; the Welcome screen re-rendered from it.
    await waitFor(() => expect(screen.getByText('New project')).toBeTruthy())
    expect(screen.getByText('Interface language')).toBeTruthy()
    expect(window.localStorage.getItem('aecpilot.ui-language')).toBe('en')

    await act(async () => {
      screen.getByRole('button', { name: 'Русский' }).click()
    })
    await waitFor(() => expect(screen.getByText('Создать проект')).toBeTruthy())
    expect(window.localStorage.getItem('aecpilot.ui-language')).toBe('ru')
  })

  it('offers every locale the build carries, by its own name', async () => {
    renderIn(<LanguageSection />)
    await waitFor(() => expect(screen.getByText('Язык интерфейса')).toBeTruthy())
    for (const name of ['English', 'Русский', '简体中文', '日本語']) {
      expect(screen.getByRole('button', { name })).toBeTruthy()
    }
  })
})
