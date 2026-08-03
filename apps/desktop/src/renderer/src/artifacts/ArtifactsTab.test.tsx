// Tasks 1.6.B7.4/B7.5 — the artifacts center tab. What is worth pinning: the
// list is a heuristic and says so (a missing file is MARKED, not hidden), an
// unreadable history explains itself instead of showing an empty list, and
// nothing here builds a `file://` or launches anything — a file is revealed
// through main, a link goes through the app's external-link policy.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import ArtifactsTab from './ArtifactsTab'

const listSessions = vi.fn()
const getSessionMessages = vi.fn()
const statArtifact = vi.fn()
const revealArtifact = vi.fn()
const previewArtifact = vi.fn()
const openExternalLink = vi.fn()

beforeEach(() => {
  listSessions.mockResolvedValue({
    sessions: [{ id: 's1', title: 'Смета', started_at: 1_780_000_000 }]
  })
  getSessionMessages.mockResolvedValue({
    messages: [
      {
        role: 'assistant',
        content:
          'Готово: D:\\proj\\out\\smeta.xlsx, ![схема](D:\\proj\\out\\scheme.png) и https://example.com/norma',
        timestamp: 1_780_000_100
      }
    ]
  })
  statArtifact.mockResolvedValue({
    ok: true,
    exists: true,
    isFile: true,
    size: 10,
    insideProject: true,
    previewable: true
  })
  revealArtifact.mockResolvedValue({ ok: true })
  previewArtifact.mockResolvedValue({ ok: true, dataUrl: 'data:image/png;base64,AAAA' })
  openExternalLink.mockResolvedValue({ ok: true })
  window.aecpilot = {
    listSessions,
    getSessionMessages,
    statArtifact,
    revealArtifact,
    previewArtifact,
    openExternalLink
  } as unknown as typeof window.aecpilot
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ArtifactsTab', () => {
  it('lists what the agent produced, tagged with its session', async () => {
    render(<ArtifactsTab />)
    await waitFor(() => expect(screen.getByText('smeta.xlsx')).toBeTruthy())
    expect(screen.getByText('scheme.png')).toBeTruthy()
    expect(screen.getByText('norma')).toBeTruthy()
    expect(screen.getAllByText(/Смета/).length).toBeGreaterThan(0)
  })

  it('narrows by kind and by search', async () => {
    render(<ArtifactsTab />)
    await waitFor(() => expect(screen.getByText('smeta.xlsx')).toBeTruthy())

    fireEvent.click(screen.getByRole('tab', { name: /Ссылки/ }))
    expect(screen.queryByText('smeta.xlsx')).toBeNull()
    expect(screen.getByText('norma')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: /Все/ }))
    fireEvent.change(screen.getByLabelText('Поиск по артефактам'), { target: { value: 'scheme' } })
    expect(screen.queryByText('smeta.xlsx')).toBeNull()
    expect(screen.getByText('scheme.png')).toBeTruthy()
  })

  // The point of checking the disk at all: the agent's file may be gone, and
  // the row has to say so rather than disappear or pretend.
  it('marks a file that is no longer on disk instead of hiding it', async () => {
    statArtifact.mockResolvedValue({
      ok: true,
      exists: false,
      isFile: false,
      size: 0,
      insideProject: true,
      previewable: false
    })
    render(<ArtifactsTab />)
    await waitFor(() => expect(screen.getAllByText('нет на диске').length).toBeGreaterThan(0))
    expect(screen.getByText('smeta.xlsx')).toBeTruthy()
  })

  it('reveals a file through main and opens a link through the link policy', async () => {
    render(<ArtifactsTab />)
    await waitFor(() => expect(screen.getByText('smeta.xlsx')).toBeTruthy())

    const row = screen.getByText('smeta.xlsx').closest('li') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'Показать в проводнике' }))
    expect(revealArtifact).toHaveBeenCalledWith('D:\\proj\\out\\smeta.xlsx')
    // No `file://` is ever built in the renderer, and nothing is launched.
    expect(openExternalLink).not.toHaveBeenCalledWith(expect.stringContaining('file://'))

    fireEvent.click(screen.getByRole('button', { name: 'Открыть ссылку' }))
    expect(openExternalLink).toHaveBeenCalledWith('https://example.com/norma')
  })

  // Required by the task: an unreadable history explains itself; an empty list
  // would read as "агент ничего не сделал".
  it('explains an unreadable history instead of drawing an empty list', async () => {
    getSessionMessages.mockRejectedValue(new Error('database is locked'))
    render(<ArtifactsTab />)
    await waitFor(() => expect(screen.getByText(/Не удалось собрать артефакты/)).toBeTruthy())
    expect(screen.getByText(/database is locked/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeTruthy()
  })

  it('explains an empty project instead of showing a blank pane', async () => {
    listSessions.mockResolvedValue({ sessions: [] })
    render(<ArtifactsTab />)
    await waitFor(() => expect(screen.getByText(/ещё не было ни одной сессии/)).toBeTruthy())
  })

  // Task 1.6.B7.5: the bytes come from main as a data-URL. The renderer never
  // reads the file itself.
  it('previews a selected image through main, never through file://', async () => {
    render(<ArtifactsTab />)
    await waitFor(() => expect(screen.getByText('scheme.png')).toBeTruthy())

    fireEvent.click(screen.getByText('scheme.png'))
    await waitFor(() => expect(previewArtifact).toHaveBeenCalledWith('D:\\proj\\out\\scheme.png'))
    const image = await screen.findByAltText('scheme.png')
    expect(image.getAttribute('src')).toBe('data:image/png;base64,AAAA')
  })

  // Required by the task: a path outside the working folder is refused WITH an
  // explanation — main answers that, and the panel shows the sentence.
  it('shows the refusal for a file outside the project instead of a broken image', async () => {
    previewArtifact.mockResolvedValue({
      ok: false,
      error: 'Предпросмотр показывает только файлы внутри рабочей папки проекта.'
    })
    render(<ArtifactsTab />)
    await waitFor(() => expect(screen.getByText('scheme.png')).toBeTruthy())

    fireEvent.click(screen.getByText('scheme.png'))
    await waitFor(() => expect(screen.getByText(/только файлы внутри рабочей папки/)).toBeTruthy())
    expect(screen.queryByAltText('scheme.png')).toBeNull()
  })

  it('says a non-image artifact has no preview rather than showing nothing', async () => {
    render(<ArtifactsTab />)
    await waitFor(() => expect(screen.getByText('smeta.xlsx')).toBeTruthy())

    fireEvent.click(screen.getByText('smeta.xlsx'))
    await act(async () => {})
    expect(screen.getByText(/Предпросмотр есть только у картинок/)).toBeTruthy()
    expect(previewArtifact).not.toHaveBeenCalled()
  })
})
