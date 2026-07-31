// Tasks 1.6.B2a.2 / 1.6.B2a.3 — plugins. The interesting behaviour is at the
// edges: enabling third-party code is confirmed, "unchanged" is not drawn as
// a change, and an empty list explains itself.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { act } from 'react'
import PluginsSection from './PluginsSection'

const listPlugins = vi.fn()
const togglePlugin = vi.fn()

beforeEach(() => {
  listPlugins.mockResolvedValue({
    plugins: [
      {
        name: 'bundled-one',
        version: '1.0',
        description: '',
        source: 'bundled',
        status: 'not enabled'
      },
      {
        name: 'mine',
        version: '2.0',
        description: 'мой плагин',
        source: 'user',
        status: 'disabled'
      }
    ],
    userCount: 1,
    bundledCount: 1
  })
  togglePlugin.mockResolvedValue({
    ok: true,
    unchanged: false,
    plugin: { name: 'mine', version: '2.0', description: '', source: 'user', status: 'enabled' }
  })
  window.aecpilot = { listPlugins, togglePlugin } as unknown as typeof window.aecpilot
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

/** The button of a named plugin's own row — the section groups user plugins
 * before bundled ones, so positional lookup would silently target the wrong
 * plugin. */
function rowButton(pluginName: string, label: string): HTMLElement {
  const row = screen.getByText(pluginName).closest('li')
  if (!row) throw new Error(`no row for ${pluginName}`)
  return within(row as HTMLElement).getByRole('button', { name: label })
}

describe('PluginsSection', () => {
  it('separates "never enabled" from "disabled"', async () => {
    render(<PluginsSection disabled={false} />)
    await waitFor(() => expect(screen.getByText('bundled-one')).toBeTruthy())
    expect(screen.getByText('не включался')).toBeTruthy()
    expect(screen.getByText('выключен')).toBeTruthy()
  })

  it('groups user plugins apart from bundled ones', async () => {
    render(<PluginsSection disabled={false} />)
    await waitFor(() => expect(screen.getByText('Свои')).toBeTruthy())
    expect(screen.getByText('Встроенные')).toBeTruthy()
  })

  // Enabling a user plugin activates third-party code inside the agent's
  // process — no request goes out until that is confirmed.
  it('does not send anything until enabling a user plugin is confirmed', async () => {
    render(<PluginsSection disabled={false} />)
    await waitFor(() => expect(screen.getByText('mine')).toBeTruthy())
    await act(async () => {
      rowButton('mine', 'Включить').click()
    })
    expect(togglePlugin).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog').textContent).toContain('mine')

    await act(async () => {
      screen.getAllByRole('button', { name: 'Включить' }).at(-1)?.click()
    })
    expect(togglePlugin).toHaveBeenCalledWith({ name: 'mine', enable: true, confirmed: true })
  })

  it('enables a bundled plugin without a confirmation step', async () => {
    render(<PluginsSection disabled={false} />)
    await waitFor(() => expect(screen.getByText('bundled-one')).toBeTruthy())
    await act(async () => {
      rowButton('bundled-one', 'Включить').click()
    })
    expect(togglePlugin).toHaveBeenCalledWith({ name: 'bundled-one', enable: true })
  })

  it('says "already in that state" instead of reporting a change', async () => {
    togglePlugin.mockResolvedValue({
      ok: true,
      unchanged: true,
      plugin: {
        name: 'bundled-one',
        version: '',
        description: '',
        source: 'bundled',
        status: 'enabled'
      }
    })
    render(<PluginsSection disabled={false} />)
    await waitFor(() => expect(screen.getByText('bundled-one')).toBeTruthy())
    await act(async () => {
      rowButton('bundled-one', 'Включить').click()
    })
    await waitFor(() => expect(screen.getByText(/уже был в этом состоянии/)).toBeTruthy())
  })

  // The new state must come from the gateway's row, not from what we asked
  // for.
  it('takes the new state from the returned row', async () => {
    togglePlugin.mockResolvedValue({
      ok: true,
      unchanged: false,
      plugin: {
        name: 'bundled-one',
        version: '',
        description: '',
        source: 'bundled',
        status: 'disabled'
      }
    })
    render(<PluginsSection disabled={false} />)
    await waitFor(() => expect(screen.getByText('bundled-one')).toBeTruthy())
    await act(async () => {
      rowButton('bundled-one', 'Включить').click()
    })
    await waitFor(() => expect(screen.getAllByText('выключен')).toHaveLength(2))
  })

  it('explains an empty list rather than looking broken', async () => {
    listPlugins.mockResolvedValue({ plugins: [], userCount: 0, bundledCount: 0 })
    render(<PluginsSection disabled={false} />)
    await waitFor(() => expect(screen.getByText(/ставятся вне приложения/)).toBeTruthy())
  })

  it('shows the gateway error text when a toggle fails', async () => {
    togglePlugin.mockRejectedValue(new Error('toggle failed'))
    render(<PluginsSection disabled={false} />)
    await waitFor(() => expect(screen.getByText('bundled-one')).toBeTruthy())
    await act(async () => {
      rowButton('bundled-one', 'Включить').click()
    })
    await waitFor(() => expect(screen.getByText('toggle failed')).toBeTruthy())
  })
})
