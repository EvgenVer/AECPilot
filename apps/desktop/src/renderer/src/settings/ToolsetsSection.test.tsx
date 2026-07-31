// Tasks 1.6.B2.6 / 1.6.B2.7 — reading toolsets, and granting capability with
// a confirmation that says what is being granted.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import ToolsetsSection from './ToolsetsSection'

const listToolsets = vi.fn()
const configureToolsets = vi.fn()

beforeEach(() => {
  listToolsets.mockResolvedValue({
    toolsets: [
      {
        name: 'files',
        description: 'Работа с файлами',
        tool_count: 2,
        enabled: true,
        tools: ['read_file', 'write_file']
      },
      { name: 'shell', description: 'Команды', tool_count: 1, enabled: false, tools: ['bash'] }
    ]
  })
  configureToolsets.mockResolvedValue({
    changed: ['shell'],
    enabled_toolsets: ['files', 'shell'],
    missing_servers: [],
    unknown: [],
    reset: false
  })
  window.aecpilot = { listToolsets, configureToolsets } as unknown as typeof window.aecpilot
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ToolsetsSection', () => {
  it('lists toolsets with their state', async () => {
    render(<ToolsetsSection disabled={false} />)
    await waitFor(() => expect(screen.getByText('files')).toBeTruthy())
    expect(screen.getByText('включён')).toBeTruthy()
    expect(screen.getByText('выключен')).toBeTruthy()
  })

  it('shows the tool names when a toolset is expanded', async () => {
    render(<ToolsetsSection disabled={false} />)
    await waitFor(() => expect(screen.getByText('files')).toBeTruthy())
    await act(async () => {
      screen.getByRole('button', { expanded: false, name: /files/ }).click()
    })
    expect(screen.getByText('read_file')).toBeTruthy()
    expect(screen.getByText('write_file')).toBeTruthy()
  })

  // The point: enabling grants the agent new capability, so the confirmation
  // has to say which.
  it('asks before enabling and names the tools the agent will get', async () => {
    render(<ToolsetsSection disabled={false} />)
    await waitFor(() => expect(screen.getByText('shell')).toBeTruthy())
    await act(async () => {
      screen.getByRole('button', { name: 'Включить' }).click()
    })
    const dialog = screen.getByRole('alertdialog')
    expect(dialog.textContent).toContain('bash')
    expect(configureToolsets).not.toHaveBeenCalled()

    await act(async () => {
      screen.getAllByRole('button', { name: 'Включить' })[1].click()
    })
    expect(configureToolsets).toHaveBeenCalledWith('enable', ['shell'])
  })

  it('disables without a confirmation — it only takes capability away', async () => {
    render(<ToolsetsSection disabled={false} />)
    await waitFor(() => expect(screen.getByText('files')).toBeTruthy())
    await act(async () => {
      screen.getByRole('button', { name: 'Выключить' }).click()
    })
    expect(configureToolsets).toHaveBeenCalledWith('disable', ['files'])
  })

  it('warns that the live agent was rebuilt when reset came back true', async () => {
    configureToolsets.mockResolvedValue({
      changed: ['files'],
      enabled_toolsets: [],
      missing_servers: [],
      unknown: [],
      reset: true
    })
    render(<ToolsetsSection disabled={false} />)
    await waitFor(() => expect(screen.getByText('files')).toBeTruthy())
    await act(async () => {
      screen.getByRole('button', { name: 'Выключить' }).click()
    })
    await waitFor(() => expect(screen.getByText(/пересобран/)).toBeTruthy())
  })

  it('says "the core does not know this toolset" instead of a generic failure', async () => {
    configureToolsets.mockResolvedValue({
      changed: [],
      enabled_toolsets: [],
      missing_servers: [],
      unknown: ['files'],
      reset: false
    })
    render(<ToolsetsSection disabled={false} />)
    await waitFor(() => expect(screen.getByText('files')).toBeTruthy())
    await act(async () => {
      screen.getByRole('button', { name: 'Выключить' }).click()
    })
    await waitFor(() => expect(screen.getByText(/не знает/)).toBeTruthy())
  })

  it('explains an empty answer instead of showing zeros', async () => {
    listToolsets.mockResolvedValue({ toolsets: [] })
    render(<ToolsetsSection disabled={false} />)
    await waitFor(() => expect(screen.getByText(/не вернуло ни одного набора/)).toBeTruthy())
  })
})
