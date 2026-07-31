// Task 1.6.B2.5 — provider keys in OUR encrypted store (owner decision R2).
// The tests that matter here are the negative ones: a saved key must not be
// readable back anywhere, and the dev-profile `.env` override must be visible
// because it silently beats whatever is saved here.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import KeysSection from './KeysSection'

const getProviderKeys = vi.fn()
const saveProviderKey = vi.fn()

beforeEach(() => {
  getProviderKeys.mockResolvedValue({
    encryptionAvailable: true,
    keys: [
      { envVar: 'OPENAI_API_KEY', hasKey: true, envOverrides: false },
      { envVar: 'XAI_API_KEY', hasKey: false, envOverrides: false }
    ]
  })
  saveProviderKey.mockResolvedValue({ ok: true, restarted: true })
  window.aecpilot = { getProviderKeys, saveProviderKey } as unknown as typeof window.aecpilot
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const candidates = ['OPENAI_API_KEY', 'XAI_API_KEY']

describe('KeysSection', () => {
  it('shows задан/не задан per credential variable', async () => {
    render(<KeysSection candidates={candidates} disabled={false} onRestarted={() => {}} />)
    await waitFor(() => expect(screen.getByText('OPENAI_API_KEY')).toBeTruthy())
    expect(screen.getByText('задан')).toBeTruthy()
    expect(screen.getByText('не задан')).toBeTruthy()
  })

  it('warns when the dev profile .env overrides a stored key', async () => {
    getProviderKeys.mockResolvedValue({
      encryptionAvailable: true,
      keys: [{ envVar: 'OPENAI_API_KEY', hasKey: true, envOverrides: true }]
    })
    render(<KeysSection candidates={candidates} disabled={false} onRestarted={() => {}} />)
    await waitFor(() => expect(screen.getByText(/имеет приоритет/)).toBeTruthy())
  })

  it('saves a key and restarts the backend', async () => {
    const onRestarted = vi.fn()
    render(<KeysSection candidates={candidates} disabled={false} onRestarted={onRestarted} />)
    await waitFor(() => expect(screen.getByText('XAI_API_KEY')).toBeTruthy())
    await act(async () => {
      screen.getByRole('button', { name: 'Задать' }).click()
    })
    const input = screen.getByLabelText('Ключ XAI_API_KEY') as HTMLInputElement
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set
      setter?.call(input, 'sk-secret-value')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      screen.getByRole('button', { name: 'Сохранить' }).click()
    })
    expect(saveProviderKey).toHaveBeenCalledWith({ envVar: 'XAI_API_KEY', key: 'sk-secret-value' })
    expect(onRestarted).toHaveBeenCalled()
  })

  // The load-bearing one: after saving, the value must not survive anywhere in
  // the rendered tree — no confirmation echo, no masked preview, no leftover
  // input value.
  it('leaves no trace of the key value after saving', async () => {
    render(<KeysSection candidates={candidates} disabled={false} onRestarted={() => {}} />)
    await waitFor(() => expect(screen.getByText('XAI_API_KEY')).toBeTruthy())
    await act(async () => {
      screen.getByRole('button', { name: 'Задать' }).click()
    })
    const input = screen.getByLabelText('Ключ XAI_API_KEY') as HTMLInputElement
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set
      setter?.call(input, 'sk-secret-value')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      screen.getByRole('button', { name: 'Сохранить' }).click()
    })
    expect(document.body.innerHTML).not.toContain('sk-secret-value')
  })

  it('keeps the value out of the tree when the save fails too', async () => {
    saveProviderKey.mockResolvedValue({
      ok: false,
      restarted: false,
      error: 'safeStorage недоступен'
    })
    render(<KeysSection candidates={candidates} disabled={false} onRestarted={() => {}} />)
    await waitFor(() => expect(screen.getByText('XAI_API_KEY')).toBeTruthy())
    await act(async () => {
      screen.getByRole('button', { name: 'Задать' }).click()
    })
    const input = screen.getByLabelText('Ключ XAI_API_KEY') as HTMLInputElement
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set
      setter?.call(input, 'sk-secret-value')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      screen.getByRole('button', { name: 'Сохранить' }).click()
    })
    expect(document.body.innerHTML).not.toContain('sk-secret-value')
    expect(screen.getByText(/safeStorage недоступен/)).toBeTruthy()
  })

  it('offers deletion only for a variable that has a key', async () => {
    render(<KeysSection candidates={candidates} disabled={false} onRestarted={() => {}} />)
    await waitFor(() => expect(screen.getByText('OPENAI_API_KEY')).toBeTruthy())
    expect(screen.getAllByRole('button', { name: 'Удалить' })).toHaveLength(1)
    await act(async () => {
      screen.getByRole('button', { name: 'Удалить' }).click()
    })
    expect(saveProviderKey).toHaveBeenCalledWith({ envVar: 'OPENAI_API_KEY', key: null })
  })

  it('refuses to offer key entry when this machine cannot encrypt', async () => {
    getProviderKeys.mockResolvedValue({
      encryptionAvailable: false,
      keys: [{ envVar: 'OPENAI_API_KEY', hasKey: false, envOverrides: false }]
    })
    render(<KeysSection candidates={candidates} disabled={false} onRestarted={() => {}} />)
    await waitFor(() => expect(screen.getByText(/safeStorage недоступен/)).toBeTruthy())
    expect((screen.getByRole('button', { name: 'Задать' }) as HTMLButtonElement).disabled).toBe(
      true
    )
  })
})
