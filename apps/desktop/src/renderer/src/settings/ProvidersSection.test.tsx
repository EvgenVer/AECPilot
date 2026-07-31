// Task 1.6.B2.4 — the provider list and, more importantly, the one verdict
// above it: would a prompt sent right now actually reach a model.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import ProvidersSection from './ProvidersSection'

const getModelOptions = vi.fn()
const checkRuntime = vi.fn()
const setModelConfig = vi.fn()

const catalogue = {
  model: 'gpt-5-mini',
  provider: 'openai',
  providers: [
    { slug: 'openai', name: 'OpenAI', authenticated: true, models: ['gpt-5-mini', 'gpt-5'] },
    {
      slug: 'xai',
      name: 'xAI',
      authenticated: false,
      auth_type: 'api_key',
      key_env: 'XAI_API_KEY',
      models: ['grok-4']
    }
  ]
}

beforeEach(() => {
  getModelOptions.mockResolvedValue(catalogue)
  checkRuntime.mockResolvedValue({ ok: true, provider: 'openai' })
  setModelConfig.mockResolvedValue({ key: 'model', value: 'gpt-5' })
  window.aecpilot = {
    getModelOptions,
    checkRuntime,
    setModelConfig
  } as unknown as typeof window.aecpilot
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ProvidersSection', () => {
  it('lists providers with their connection state', async () => {
    render(<ProvidersSection disabled={false} />)
    await waitFor(() => expect(screen.getByText('OpenAI')).toBeTruthy())
    expect(screen.getByText('подключён')).toBeTruthy()
    expect(screen.getByText('не подключён')).toBeTruthy()
    expect(screen.getByText(/XAI_API_KEY/)).toBeTruthy()
  })

  it('shows no banner while the runtime resolves', async () => {
    render(<ProvidersSection disabled={false} />)
    await waitFor(() => expect(screen.getByText('OpenAI')).toBeTruthy())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('names the provider and the core error when the runtime does not resolve', async () => {
    checkRuntime.mockResolvedValue({
      ok: false,
      provider: 'xai',
      error: 'No usable credentials found for xai.'
    })
    render(<ProvidersSection disabled={false} />)
    const banner = await screen.findByRole('alert')
    expect(banner.textContent).toContain('xai')
    expect(banner.textContent).toContain('No usable credentials found for xai.')
  })

  // The point of the assertion: this screen must not grow a second path to
  // `config.set {key:'model'}`. It reuses the composer picker's channel.
  it('switches the model through the existing model channel', async () => {
    render(<ProvidersSection disabled={false} />)
    await waitFor(() => expect(screen.getByText('OpenAI')).toBeTruthy())
    await act(async () => {
      screen.getByRole('button', { expanded: false, name: /OpenAI/ }).click()
    })
    await act(async () => {
      screen.getByRole('button', { name: 'gpt-5' }).click()
    })
    expect(setModelConfig).toHaveBeenCalledWith('model', 'gpt-5')
  })

  it('does not offer models of a provider that is not connected', async () => {
    render(<ProvidersSection disabled={false} />)
    await waitFor(() => expect(screen.getByText('xAI')).toBeTruthy())
    await act(async () => {
      screen.getByRole('button', { expanded: false, name: /xAI/ }).click()
    })
    expect((screen.getByRole('button', { name: 'grok-4' }) as HTMLButtonElement).disabled).toBe(
      true
    )
  })

  it('explains an empty catalogue instead of showing a blank list', async () => {
    getModelOptions.mockResolvedValue({ providers: [] })
    render(<ProvidersSection disabled={false} />)
    await waitFor(() => expect(screen.getByText(/не вернуло ни одного провайдера/)).toBeTruthy())
  })
})
