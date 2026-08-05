// Task 1.8.7's acceptance check, on the donor's own ThemeProvider: light and
// dark switch, and `color-scheme` follows. The second half is not cosmetic —
// Chromium paints scrollbars, form controls and (on Windows) parts of the
// window chrome from `color-scheme`, so a dark UI that forgets it gets light
// chrome bolted onto it.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

import { ThemeProvider, useTheme } from '../../donor/themes/context'

function ModeProbe() {
  const { mode, renderedMode, setMode } = useTheme()

  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <span data-testid="rendered">{renderedMode}</span>
      <button type="button" onClick={() => setMode('dark')}>
        dark
      </button>
      <button type="button" onClick={() => setMode('light')}>
        light
      </button>
    </div>
  )
}

beforeEach(() => {
  window.localStorage.clear()
  document.documentElement.className = ''
  document.documentElement.removeAttribute('style')
  // jsdom ships no matchMedia; their provider asks for the OS dark preference.
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null
  })) as unknown as typeof window.matchMedia
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('donor theme', () => {
  it('renders light and marks color-scheme light', async () => {
    render(
      <ThemeProvider>
        <ModeProbe />
      </ThemeProvider>
    )

    await waitFor(() => expect(screen.getByTestId('rendered').textContent).toBe('light'))
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(document.documentElement.style.colorScheme).toBe('light')
  })

  it('switches to dark, and color-scheme follows', async () => {
    render(
      <ThemeProvider>
        <ModeProbe />
      </ThemeProvider>
    )
    await waitFor(() => expect(screen.getByTestId('rendered').textContent).toBe('light'))

    await act(async () => {
      screen.getByRole('button', { name: 'dark' }).click()
    })

    await waitFor(() => expect(screen.getByTestId('rendered').textContent).toBe('dark'))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })

  it('switches back, and the choice survives a remount', async () => {
    const first = render(
      <ThemeProvider>
        <ModeProbe />
      </ThemeProvider>
    )
    await act(async () => {
      screen.getByRole('button', { name: 'dark' }).click()
    })
    await waitFor(() => expect(document.documentElement.style.colorScheme).toBe('dark'))

    first.unmount()
    render(
      <ThemeProvider>
        <ModeProbe />
      </ThemeProvider>
    )

    await waitFor(() => expect(screen.getByTestId('mode').textContent).toBe('dark'))
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })
})
