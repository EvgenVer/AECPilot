// Transport half of the global-hotkey mini composer (task 3.15) — the part
// that touches `globalShortcut`, `BrowserWindow` and `screen`. Every rule it
// applies lives in `quick-entry-pure.ts` next to its tests.
//
// Two properties this file exists to keep:
//   • the window is HIDDEN, never destroyed. Recreating it on each chord costs
//     the fraction of a second the whole feature is about.
//   • it holds no gateway connection and no session state. Its text arrives in
//     `index.ts` over IPC and goes out through the same `prompt.submit` the
//     composer uses.

import { BrowserWindow, globalShortcut, screen } from 'electron'
import { join } from 'node:path'

import {
  decideRegistration,
  quickEntryBounds,
  QUICK_ENTRY_HEIGHT,
  QUICK_ENTRY_WIDTH
} from './quick-entry-pure'

export interface QuickEntryDeps {
  /** Dev server URL when running under electron-vite, else undefined. */
  rendererUrl?: string
}

let quickWindow: BrowserWindow | undefined
let registered: string | undefined

function createWindow(rendererUrl?: string): BrowserWindow {
  const win = new BrowserWindow({
    width: QUICK_ENTRY_WIDTH,
    height: QUICK_ENTRY_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: join(__dirname, '../preload/quick-entry.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  // Above full-screen apps too: a capture window that loses to whatever is in
  // front of it is a capture window nobody reaches for.
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // Clicking elsewhere dismisses it, the way every quick-capture surface
  // behaves. Hidden, not closed — see the header.
  win.on('blur', () => win.hide())

  // Nothing in this window is allowed to navigate: it is one input.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event) => event.preventDefault())

  if (rendererUrl) {
    void win.loadURL(new URL('quick-entry.html', rendererUrl).toString())
  } else {
    void win.loadFile(join(__dirname, '../renderer/quick-entry.html'))
  }

  return win
}

export function showQuickEntry(deps: QuickEntryDeps): void {
  if (!quickWindow || quickWindow.isDestroyed()) {
    quickWindow = createWindow(deps.rendererUrl)
  }

  // The display under the pointer, not the primary one — the window should
  // appear where the person is already looking.
  const work = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
  quickWindow.setBounds(quickEntryBounds(work))
  quickWindow.show()
  quickWindow.focus()
}

export function hideQuickEntry(): void {
  quickWindow?.hide()
}

export interface QuickEntryStatus {
  enabled: boolean
  shortcut?: string
  reason?: 'disabled' | 'invalid' | 'taken'
}

/** Registers (or deliberately does not register) the OS shortcut.
 *
 * `taken` is the case worth naming: Electron reports a chord another app owns
 * the same way it reports success — by returning false — so the state is read
 * back rather than assumed. */
export function registerQuickEntry(
  settings: { enabled: boolean; shortcut?: string },
  deps: QuickEntryDeps
): QuickEntryStatus {
  unregisterQuickEntry()

  const decision = decideRegistration(settings)
  if (!decision.register) return { enabled: false, reason: decision.reason }

  let ok = false
  try {
    ok = globalShortcut.register(decision.accelerator, () => showQuickEntry(deps))
  } catch {
    ok = false
  }

  if (!ok || !globalShortcut.isRegistered(decision.accelerator)) {
    return { enabled: false, shortcut: decision.accelerator, reason: 'taken' }
  }

  registered = decision.accelerator

  return { enabled: true, shortcut: decision.accelerator }
}

export function unregisterQuickEntry(): void {
  if (!registered) return

  try {
    globalShortcut.unregister(registered)
  } catch {
    // Already gone (app quitting) — nothing to undo.
  }
  registered = undefined
}
