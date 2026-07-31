// Task 1.6.B2.1 — the screen that replaced the settings popover. What is
// worth pinning: switching sections changes the content, and the LLM section
// makes no IPC call until it is actually opened (the one good property of the
// popover this must not lose).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import SettingsScreen from './SettingsScreen'

const getLlmSettings = vi.fn()

beforeEach(() => {
  getLlmSettings.mockResolvedValue({
    model: 'gpt-5-mini',
    baseUrl: '',
    hasKey: true,
    encryptionAvailable: true,
    envOverridesKey: false
  })
  window.aecpilot = { getLlmSettings } as unknown as typeof window.aecpilot
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SettingsScreen', () => {
  it('opens on Оформление and does not touch the backend', async () => {
    render(<SettingsScreen disabled={false} onClose={() => {}} onRestarted={() => {}} />)
    expect(screen.getByRole('group', { name: 'Тема' })).toBeTruthy()
    // The popover's good property: unopened settings make no IPC call.
    expect(getLlmSettings).not.toHaveBeenCalled()
  })

  it('switching to the model section shows it and fetches only then', async () => {
    render(<SettingsScreen disabled={false} onClose={() => {}} onRestarted={() => {}} />)
    const tab = screen.getByRole('button', { name: 'Подключение к модели' })
    await act(async () => {
      tab.click()
    })
    await waitFor(() => expect(getLlmSettings).toHaveBeenCalledTimes(1))
    expect(screen.getByDisplayValue('gpt-5-mini')).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Тема' })).toBeNull()
  })

  it('the theme switch keeps working while the model section is disabled', async () => {
    // It touches no IPC at all, so an in-flight turn must not freeze it.
    render(<SettingsScreen disabled={true} onClose={() => {}} onRestarted={() => {}} />)
    const dark = screen.getByRole('button', { name: 'Тёмная' })
    expect((dark as HTMLButtonElement).disabled).toBe(false)
    await act(async () => {
      dark.click()
    })
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('closes from the header', async () => {
    const onClose = vi.fn()
    render(<SettingsScreen disabled={false} onClose={onClose} onRestarted={() => {}} />)
    await act(async () => {
      screen.getByRole('button', { name: 'Закрыть настройки' }).click()
    })
    expect(onClose).toHaveBeenCalled()
  })
})
