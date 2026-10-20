// Задача T42.3. Скрытая вкладка браузера остаётся для Chromium гостем в фокусе; жест
// «назад» должен уйти окну, а не невидимой странице. Electron подменён: тесту нужны
// только «гость в фокусе», его история и адресат сообщения окну.

import type { BrowserWindow, WebContents } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ focused: null as unknown }))

vi.mock('electron', () => ({
  ipcMain: { on: vi.fn() },
  webContents: {
    fromId: vi.fn(),
    getFocusedWebContents: () => state.focused
  }
}))

import { notePreviewGuestHidden, sendPreviewNavCommand } from './preview-nav'

interface FakeGuest {
  guest: WebContents
  goBack: ReturnType<typeof vi.fn>
}

let nextId = 100

function fakeGuest(host: WebContents): FakeGuest {
  const goBack = vi.fn()
  const guest = {
    id: nextId++,
    hostWebContents: host,
    isDestroyed: () => false,
    getType: () => 'webview',
    once: vi.fn(),
    reload: vi.fn(),
    navigationHistory: {
      canGoBack: () => true,
      canGoForward: () => true,
      goBack,
      goForward: vi.fn()
    }
  } as unknown as WebContents
  return { guest, goBack }
}

function fakeWindow(): {
  win: BrowserWindow
  contents: WebContents
  send: ReturnType<typeof vi.fn>
} {
  const send = vi.fn()
  const contents = { isDestroyed: () => false, send } as unknown as WebContents
  const win = { isDestroyed: () => false, webContents: contents } as unknown as BrowserWindow
  return { win, contents, send }
}

describe('скрытый гость предпросмотра и жесты (T42.3)', () => {
  beforeEach(() => {
    state.focused = null
  })

  it('видимый гость в фокусе листается сам, окну ничего не уходит', () => {
    const { win, contents, send } = fakeWindow()
    const { guest, goBack } = fakeGuest(contents)
    state.focused = guest

    sendPreviewNavCommand(win, 'back')

    expect(goBack).toHaveBeenCalledOnce()
    expect(send).not.toHaveBeenCalled()
  })

  it('скрытый гость не листается — жест уходит окну; вернувшийся листается снова', () => {
    const { win, contents, send } = fakeWindow()
    const { guest, goBack } = fakeGuest(contents)
    state.focused = guest

    notePreviewGuestHidden(contents, guest, true)
    sendPreviewNavCommand(win, 'back')
    expect(goBack).not.toHaveBeenCalled()
    expect(send).toHaveBeenCalledWith('preview-nav', 'back')

    notePreviewGuestHidden(contents, guest, false)
    sendPreviewNavCommand(win, 'back')
    expect(goBack).toHaveBeenCalledOnce()
  })

  it('окно не может скрыть чужого гостя', () => {
    const { win, contents } = fakeWindow()
    const other = fakeWindow().contents
    const { guest, goBack } = fakeGuest(contents)
    state.focused = guest

    notePreviewGuestHidden(other, guest, true)
    sendPreviewNavCommand(win, 'back')

    expect(goBack).toHaveBeenCalledOnce()
  })
})
