// Tasks 1.6.B2.8–B2.12 — the MCP section. What is worth pinning: the live
// status is shown apart from the configuration, a destructive delete is
// confirmed, and the reload warning from the gateway is not swallowed.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import McpSection from './McpSection'

const listMcpServers = vi.fn()
const setMcpServerEnabled = vi.fn()
const addMcpServer = vi.fn()
const removeMcpServer = vi.fn()
const testMcpServer = vi.fn()
const reloadMcpServers = vi.fn()

beforeEach(() => {
  listMcpServers.mockResolvedValue({
    servers: [
      {
        name: 'aec-sources',
        transport: 'stdio',
        command: 'aec-sources.exe',
        args: [],
        enabled: true,
        envNames: []
      },
      { name: 'weather', transport: 'http', url: 'https://w.test/mcp', enabled: true, envNames: [] }
    ],
    live: [{ name: 'aec-sources', status: 'connected', tools: 3 }]
  })
  setMcpServerEnabled.mockResolvedValue({ ok: true })
  addMcpServer.mockResolvedValue({ name: 'new' })
  removeMcpServer.mockResolvedValue({ ok: true })
  testMcpServer.mockResolvedValue({ ok: true, tools: [{ name: 'a' }, { name: 'b' }] })
  reloadMcpServers.mockResolvedValue({ status: 'reloaded' })
  window.aecpilot = {
    listMcpServers,
    setMcpServerEnabled,
    addMcpServer,
    removeMcpServer,
    testMcpServer,
    reloadMcpServers
  } as unknown as typeof window.aecpilot
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('McpSection', () => {
  it('shows our sources server, marked as ours, with its live state', async () => {
    render(<McpSection disabled={false} />)
    await waitFor(() => expect(screen.getByText('aec-sources')).toBeTruthy())
    expect(screen.getByText('наш')).toBeTruthy()
    expect(screen.getByText(/подключён · 3 инстр/)).toBeTruthy()
  })

  it('warns that turning our own server off costs the agent its sources', async () => {
    render(<McpSection disabled={false} />)
    await waitFor(() =>
      expect(screen.getByText(/перестанет видеть подключённые источники/)).toBeTruthy()
    )
  })

  it('says a configured-but-not-started server is not connected yet', async () => {
    render(<McpSection disabled={false} />)
    await waitFor(() => expect(screen.getByText(/ещё не подключался/)).toBeTruthy())
  })

  it('toggling a server explains the change takes effect on reconnect', async () => {
    render(<McpSection disabled={false} />)
    await waitFor(() => expect(screen.getByText('weather')).toBeTruthy())
    await act(async () => {
      screen.getAllByRole('button', { name: 'Выключить' })[1].click()
    })
    expect(setMcpServerEnabled).toHaveBeenCalledWith({ name: 'weather', enabled: false })
    await waitFor(() =>
      expect(screen.getByText(/Сервер weather выключен.*после переподключения/)).toBeTruthy()
    )
  })

  it('reports the tool list after a successful test', async () => {
    render(<McpSection disabled={false} />)
    await waitFor(() => expect(screen.getByText('weather')).toBeTruthy())
    await act(async () => {
      screen.getAllByRole('button', { name: 'Проверить' })[1].click()
    })
    await waitFor(() => expect(screen.getByText(/инструментов: 2/)).toBeTruthy())
  })

  it('reports a failed test with the reason instead of a bare failure', async () => {
    testMcpServer.mockResolvedValue({ ok: false, error: 'spawn ENOENT', tools: [] })
    render(<McpSection disabled={false} />)
    await waitFor(() => expect(screen.getByText('weather')).toBeTruthy())
    await act(async () => {
      screen.getAllByRole('button', { name: 'Проверить' })[1].click()
    })
    await waitFor(() => expect(screen.getByText(/spawn ENOENT/)).toBeTruthy())
  })

  // The delete is irreversible on their side and takes the env map with it.
  it('confirms before deleting and sends confirmed: true', async () => {
    render(<McpSection disabled={false} />)
    await waitFor(() => expect(screen.getByText('weather')).toBeTruthy())
    await act(async () => {
      screen.getAllByRole('button', { name: 'Удалить' })[1].click()
    })
    expect(removeMcpServer).not.toHaveBeenCalled()
    const dialog = screen.getByRole('alertdialog', { name: 'Удалить сервер' })
    expect(dialog.textContent).toContain('weather')
    await act(async () => {
      screen.getAllByRole('button', { name: 'Удалить' }).at(-1)?.click()
    })
    expect(removeMcpServer).toHaveBeenCalledWith({ name: 'weather', confirmed: true })
  })

  // confirm_required is not a success: the gateway is warning that the prompt
  // cache dies with the reload, and the user should read that warning.
  it('shows the gateway reload warning and only then repeats with confirm', async () => {
    reloadMcpServers.mockResolvedValueOnce({
      status: 'confirm_required',
      message: 'это сбросит кэш промпта'
    })
    render(<McpSection disabled={false} />)
    await waitFor(() => expect(screen.getByText('weather')).toBeTruthy())
    await act(async () => {
      screen.getByRole('button', { name: 'Перечитать серверы' }).click()
    })
    expect(screen.getByText('это сбросит кэш промпта')).toBeTruthy()
    expect(reloadMcpServers).toHaveBeenCalledWith(false)
    await act(async () => {
      screen.getByRole('button', { name: 'Всё равно перечитать' }).click()
    })
    expect(reloadMcpServers).toHaveBeenCalledWith(true)
  })

  it('adds a server through the form', async () => {
    render(<McpSection disabled={false} />)
    await waitFor(() => expect(screen.getByText('weather')).toBeTruthy())
    await act(async () => {
      screen.getByRole('button', { name: 'Добавить сервер' }).click()
    })
    const setValue = (element: HTMLInputElement, next: string): void => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set
      setter?.call(element, next)
      element.dispatchEvent(new Event('input', { bubbles: true }))
    }
    await act(async () => {
      setValue(screen.getByLabelText('Имя') as HTMLInputElement, 'newsrv')
      setValue(screen.getByLabelText('Команда') as HTMLInputElement, 'run.exe')
    })
    await act(async () => {
      screen.getByRole('button', { name: 'Добавить' }).click()
    })
    expect(addMcpServer).toHaveBeenCalledWith({ name: 'newsrv', command: 'run.exe' })
  })

  it('explains an empty list instead of showing nothing', async () => {
    listMcpServers.mockResolvedValue({ servers: [], live: [] })
    render(<McpSection disabled={false} />)
    await waitFor(() => expect(screen.getByText(/Серверов нет/)).toBeTruthy())
  })

  it('surfaces the core refusal of a suspicious command as a refusal', async () => {
    addMcpServer.mockRejectedValue(
      new Error('Ядро отклонило запрос: suspicious command/args configuration')
    )
    render(<McpSection disabled={false} />)
    await waitFor(() => expect(screen.getByText('weather')).toBeTruthy())
    await act(async () => {
      screen.getByRole('button', { name: 'Добавить сервер' }).click()
    })
    const setValue = (element: HTMLInputElement, next: string): void => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set
      setter?.call(element, next)
      element.dispatchEvent(new Event('input', { bubbles: true }))
    }
    await act(async () => {
      setValue(screen.getByLabelText('Имя') as HTMLInputElement, 'evil')
      setValue(screen.getByLabelText('Команда') as HTMLInputElement, 'rm -rf /')
    })
    await act(async () => {
      screen.getByRole('button', { name: 'Добавить' }).click()
    })
    await waitFor(() =>
      expect(screen.getByText(/suspicious command\/args configuration/)).toBeTruthy()
    )
  })
})
