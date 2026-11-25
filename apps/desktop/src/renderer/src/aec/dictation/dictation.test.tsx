// The dictation gate and its dialog (UR49, task T59): a press without the model opens the
// consent and records nothing; a download starts only from the button; a server's window
// explains where dictation is turned on instead of offering a download.

import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AecI18nProvider } from '../../shared/i18n'
import type { DictationStatus } from '../../../../shared/ipc'

import DictationDialog from './DictationDialog'
import { $dictation, $dictationOpen, dictationReady, requestMicrophone } from './store'
import { useDictationGate } from './use-dictation-gate'

const getDictation = vi.fn()
const setupDictation = vi.fn()
const removeDictation = vi.fn()
const requestFromMain = vi.fn()
let push: (status: DictationStatus) => void = () => {}

function status(patch: Partial<DictationStatus> = {}): DictationStatus {
  return {
    remote: false,
    engine: true,
    installed: false,
    ready: false,
    leftovers: false,
    busy: false,
    progress: null,
    error: null,
    model: {
      id: 'turbo',
      repo: 'dropbox-dash/faster-whisper-large-v3-turbo',
      license: 'MIT',
      sizeBytes: 486_000_000
    },
    ...patch
  }
}

const READY = status({ installed: true, ready: true })

beforeEach(() => {
  getDictation.mockResolvedValue(status())
  setupDictation.mockResolvedValue({ ok: true })
  removeDictation.mockResolvedValue({ ok: true })
  window.aecpilot = {
    getDictation,
    setupDictation,
    removeDictation,
    requestMicrophone: requestFromMain,
    onDictation: (cb: (next: DictationStatus) => void) => {
      push = cb
      return () => {}
    }
  } as unknown as typeof window.aecpilot
  $dictation.set(null)
  $dictationOpen.set(false)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function show(): void {
  render(
    <AecI18nProvider>
      <DictationDialog />
    </AecI18nProvider>
  )
}

describe('the gate in front of the recorder', () => {
  it('no model — the consent opens and nothing records', async () => {
    const record = vi.fn()
    const { result } = renderHook(() => useDictationGate(record, 'idle'))
    act(() => result.current())
    await waitFor(() => expect($dictationOpen.get()).toBe(true))
    expect(record).not.toHaveBeenCalled()
    expect(setupDictation).not.toHaveBeenCalled()
  })

  it('a ready model — one press, one recording, no dialog', async () => {
    $dictation.set(READY)
    const record = vi.fn()
    const { result } = renderHook(() => useDictationGate(record, 'idle'))
    act(() => {
      result.current()
      result.current()
    })
    await waitFor(() => expect(record).toHaveBeenCalledTimes(1))
    expect($dictationOpen.get()).toBe(false)
  })

  it('installed since the window opened — the press asks main and records', async () => {
    $dictation.set(status())
    getDictation.mockResolvedValue(READY)
    const record = vi.fn()
    const { result } = renderHook(() => useDictationGate(record, 'idle'))
    act(() => result.current())
    await waitFor(() => expect(record).toHaveBeenCalledTimes(1))
  })

  it('a press that stops the recording asks nobody', () => {
    const record = vi.fn()
    const { result } = renderHook(() => useDictationGate(record, 'recording'))
    act(() => result.current())
    expect(record).toHaveBeenCalledTimes(1)
    expect(getDictation).not.toHaveBeenCalled()
  })

  it('the composer gone before the answer — nothing records', async () => {
    let answer: (status: DictationStatus) => void = () => {}
    getDictation.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    const record = vi.fn()
    const { result, unmount } = renderHook(() => useDictationGate(record, 'idle'))
    act(() => result.current())
    unmount()
    await act(async () => answer(READY))
    expect(record).not.toHaveBeenCalled()
  })

  it('main refuses a press that looked ready — the stale answer goes, the dialog explains', async () => {
    $dictation.set(READY)
    requestFromMain.mockResolvedValue(false)
    getDictation.mockResolvedValue(
      status({ installed: true, error: 'ядро не настроено распознавать' })
    )
    $dictationOpen.set(false)
    expect(await requestMicrophone()).toBe(false)
    expect($dictation.get()?.ready).toBe(false)
    expect($dictationOpen.get()).toBe(true)
    show()
    expect((await screen.findByTestId('dictation-error')).textContent).toContain('не настроено')
    expect(screen.getByTestId('dictation-installed').textContent).not.toContain('включена')
  })

  it('main out of reach is «not ready», not an exception', async () => {
    getDictation.mockRejectedValue(new Error('gone'))
    expect(await dictationReady()).toBe(false)
  })
})

describe('the consent dialog', () => {
  it('names the source, the size and the license before anything is downloaded', async () => {
    $dictationOpen.set(true)
    show()
    await screen.findByTestId('dictation-download')
    const text = screen.getByTestId('dictation-dialog').textContent ?? ''
    expect(text).toContain('Hugging Face')
    expect(text).toContain('dropbox-dash/faster-whisper-large-v3-turbo')
    expect(text).toContain('486')
    expect(text).toContain('MIT')
    expect(text).toContain('Звук никуда не отправляется')
    expect(setupDictation).not.toHaveBeenCalled()
  })

  it('«Не скачивать» closes and downloads nothing', async () => {
    $dictationOpen.set(true)
    show()
    await screen.findByTestId('dictation-download')
    fireEvent.click(screen.getByText('Не скачивать'))
    expect($dictationOpen.get()).toBe(false)
    expect(setupDictation).not.toHaveBeenCalled()
  })

  it('the button starts the download, the progress is in words, an error is shown', async () => {
    setupDictation.mockResolvedValue({ ok: false, error: 'нет сети' })
    $dictationOpen.set(true)
    show()
    fireEvent.click(await screen.findByTestId('dictation-download'))
    expect(setupDictation).toHaveBeenCalledTimes(1)
    act(() =>
      push(status({ busy: true, progress: { doneBytes: 100_000_000, totalBytes: 486_000_000 } }))
    )
    expect(screen.getByTestId('dictation-progress').textContent).toContain('100 из 486')
    act(() => push(status({ error: 'нет сети' })))
    expect((await screen.findByTestId('dictation-error')).textContent).toBe('нет сети')
  })

  it('installed — only removal is offered', async () => {
    getDictation.mockResolvedValue(READY)
    $dictationOpen.set(true)
    show()
    fireEvent.click(await screen.findByTestId('dictation-remove'))
    expect(removeDictation).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('dictation-download')).toBeNull()
  })

  it('leftovers of an abandoned download can be deleted', async () => {
    getDictation.mockResolvedValue(status({ leftovers: true }))
    $dictationOpen.set(true)
    show()
    await screen.findByTestId('dictation-download')
    fireEvent.click(screen.getByTestId('dictation-remove'))
    expect(removeDictation).toHaveBeenCalledTimes(1)
  })

  it('a window of a server offers no download here', async () => {
    getDictation.mockResolvedValue(status({ remote: true }))
    $dictationOpen.set(true)
    show()
    expect((await screen.findByTestId('dictation-remote')).textContent).toContain('в трее')
    expect(screen.queryByTestId('dictation-download')).toBeNull()
    expect(screen.queryByTestId('dictation-remove')).toBeNull()
  })

  it('no recognition packages — said in words, no download', async () => {
    getDictation.mockResolvedValue(status({ engine: false }))
    $dictationOpen.set(true)
    show()
    await screen.findByTestId('dictation-engine-missing')
    expect(screen.queryByTestId('dictation-download')).toBeNull()
  })
})
