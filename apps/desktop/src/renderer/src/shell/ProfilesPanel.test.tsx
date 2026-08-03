// Task 1.6.B5.23 — profiles. The shapes here come from
// `runtime/profiles-probe.mjs`, which measured the routes against a live
// gateway before this screen existed. What is pinned: creating, switching
// (including the honest wording about the running core), deleting behind a
// confirmation, and the refusal to delete the profile in use.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import ProfilesPanel from './ProfilesPanel'

const listProfiles = vi.fn()
const createProfile = vi.fn()
const deleteProfile = vi.fn()
const useProfile = vi.fn()

beforeEach(() => {
  listProfiles.mockResolvedValue({
    profiles: [
      { name: 'default', path: 'D:\\dev-profile', isDefault: true, model: 'gpt-5', skillCount: 8 },
      {
        name: 'estimates',
        path: 'D:\\dev-profile\\profiles\\estimates',
        isDefault: false,
        model: 'opus',
        description: 'для смет',
        skillCount: 12
      }
    ],
    current: 'default',
    launched: 'default',
    active: 'default'
  })
  createProfile.mockResolvedValue({ ok: true })
  deleteProfile.mockResolvedValue({ ok: true })
  useProfile.mockResolvedValue({ ok: true, current: 'estimates' })
  window.aecpilot = {
    listProfiles,
    createProfile,
    deleteProfile,
    useProfile
  } as unknown as typeof window.aecpilot
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderPanel() {
  const onSessionLoaded = vi.fn()
  render(<ProfilesPanel onSessionLoaded={onSessionLoaded} />)
  return { onSessionLoaded }
}

describe('ProfilesPanel', () => {
  it('lists profiles and marks the one in use', async () => {
    renderPanel()
    await waitFor(() => expect(screen.getByText('estimates')).toBeTruthy())
    expect(screen.getByText('текущий')).toBeTruthy()
    expect(screen.getByText('для смет')).toBeTruthy()
  })

  it('creates a profile and re-reads the list', async () => {
    renderPanel()
    await waitFor(() => expect(screen.getByText('estimates')).toBeTruthy())
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Имя нового профиля'), {
        target: { value: 'drafts' }
      })
    })
    await act(async () => {
      fireEvent.click(screen.getByText('Создать'))
    })
    expect(createProfile).toHaveBeenCalledWith('drafts')
    expect(listProfiles).toHaveBeenCalledTimes(2)
  })

  it('switches profile, clears the transcript, and says what did NOT happen', async () => {
    const { onSessionLoaded } = renderPanel()
    await waitFor(() => expect(screen.getByText('estimates')).toBeTruthy())
    await act(async () => {
      fireEvent.click(screen.getByText('estimates'))
    })
    expect(useProfile).toHaveBeenCalledWith('estimates')
    // The open session belonged to the previous profile.
    expect(onSessionLoaded).toHaveBeenCalledWith([])
    // Their POST /api/profiles/active does not retarget a running process, and
    // the screen must not let the user believe otherwise.
    await waitFor(() => expect(screen.getByText(/не переезжает/)).toBeTruthy())
  })

  it('does not delete before the confirmation is given', async () => {
    renderPanel()
    await waitFor(() => expect(screen.getByText('estimates')).toBeTruthy())
    // Index 1: the first row is `default`, whose delete is off by design.
    await act(async () => {
      fireEvent.click(screen.getAllByText('Удалить')[1] as HTMLElement)
    })
    expect(deleteProfile).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.click(screen.getByRole('alertdialog').querySelector('button') as HTMLElement)
    })
    expect(deleteProfile).toHaveBeenCalledWith({ name: 'estimates', confirmed: true })
  })

  it('offers no delete for the profile in use or for default', async () => {
    listProfiles.mockResolvedValue({
      profiles: [
        { name: 'default', path: 'D:\\dev-profile', isDefault: true },
        { name: 'estimates', path: 'D:\\p\\estimates', isDefault: false }
      ],
      current: 'estimates',
      launched: 'default',
      active: 'default'
    })
    renderPanel()
    await waitFor(() => expect(screen.getByText('текущий')).toBeTruthy())
    // Both buttons off: one is the profile in use, the other is the hermes
    // home itself. main refuses both again, so this is the first of two gates.
    for (const button of screen.getAllByText('Удалить')) {
      expect((button as HTMLButtonElement).disabled).toBe(true)
    }
  })

  it('shows the core refusal text when main declines the delete', async () => {
    deleteProfile.mockRejectedValue(new Error('Это профиль, под которым сейчас работает ядро'))
    renderPanel()
    await waitFor(() => expect(screen.getByText('estimates')).toBeTruthy())
    await act(async () => {
      fireEvent.click(screen.getAllByText('Удалить')[1] as HTMLElement)
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('alertdialog').querySelector('button') as HTMLElement)
    })
    await waitFor(() => expect(screen.getByText(/сейчас работает ядро/)).toBeTruthy())
    expect(screen.getByText('estimates')).toBeTruthy()
  })

  it('shows the REST failure instead of an empty list', async () => {
    listProfiles.mockRejectedValue(new Error('Интерфейс ядра недоступен'))
    renderPanel()
    await waitFor(() => expect(screen.getByText(/Интерфейс ядра недоступен/)).toBeTruthy())
  })
})
