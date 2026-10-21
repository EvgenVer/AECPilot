// Задача T35.2 (решение владельца 2026-10-20): окно «Ключи моделей» на сервере.
//
// У установки «только сервер» нет главного окна, а ключи провайдеров живут только в
// нашем шифрованном хранилище (решение R2) — без этого окна сервер не мог
// индексировать. Открывается пунктом трея и повторным запуском `AECPilot.exe` на
// сервере (ярлык поверх уже работающего сервера). Правила — `server-keys-pure.ts`.
//
// Своё маленькое окно со своим preload: ему не нужен ни один из ~150 вызовов главного
// окна. Канал отвечает только этому окну — запрос из любого другого содержимого
// отклоняется, даже если оно как-то узнало имя канала.

import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { join } from 'node:path'

import { mainT } from './i18n'
import type { MainCatalogKey } from './i18n-catalog'
import { parseServerKeySave, type ServerKeyRow } from './server-keys-pure'

export interface ServerKeysDeps {
  /** Строки окна — имена и признаки, без значений. */
  rows: () => Promise<ServerKeyRow[]>
  encryptionAvailable: () => boolean
  /** Записать (или удалить при `null`) и перезапустить ядро сервера. */
  save: (
    envVar: string,
    key: string | null
  ) => Promise<{ stored: boolean; restarted: boolean; error?: string }>
  rendererUrl?: string
}

export interface ServerKeysView {
  encryptionAvailable: boolean
  rows: ServerKeyRow[]
  strings: Record<string, string>
}

const STRING_KEYS = [
  'serverKeys.title',
  'serverKeys.intro',
  'serverKeys.stored',
  'serverKeys.notStored',
  'serverKeys.envWins',
  'serverKeys.name',
  'serverKeys.value',
  'serverKeys.save',
  'serverKeys.remove',
  'serverKeys.close',
  'serverKeys.saving',
  'serverKeys.noEncryption'
] as const satisfies readonly MainCatalogKey[]

let keysWindow: BrowserWindow | undefined
let installed = false

function fromKeysWindow(event: IpcMainInvokeEvent): boolean {
  return Boolean(keysWindow && !keysWindow.isDestroyed() && event.sender === keysWindow.webContents)
}

function installHandlers(deps: ServerKeysDeps): void {
  if (installed) return
  installed = true

  ipcMain.handle('server-keys:view', async (event): Promise<ServerKeysView> => {
    if (!fromKeysWindow(event)) throw new Error('server-keys: not the keys window')
    const strings: Record<string, string> = {}
    for (const key of STRING_KEYS) strings[key] = mainT(key)
    return { encryptionAvailable: deps.encryptionAvailable(), rows: await deps.rows(), strings }
  })

  ipcMain.handle('server-keys:save', async (event, payload: unknown) => {
    if (!fromKeysWindow(event)) throw new Error('server-keys: not the keys window')
    const parsed = parseServerKeySave(payload)
    if (!parsed.ok) {
      return { ok: false, message: mainT(`serverKeys.${parsed.error}`) }
    }
    const outcome = await deps.save(parsed.envVar, parsed.key)
    if (!outcome.stored) return { ok: false, message: mainT('serverKeys.noEncryption') }
    if (!outcome.restarted) {
      return { ok: false, message: mainT('serverKeys.restartFailed', outcome.error ?? '') }
    }
    return {
      ok: true,
      message: mainT(parsed.key === null ? 'serverKeys.removed' : 'serverKeys.saved')
    }
  })

  ipcMain.on('server-keys:close', (event) => {
    if (keysWindow && !keysWindow.isDestroyed() && event.sender === keysWindow.webContents) {
      keysWindow.close()
    }
  })
}

export function openServerKeysWindow(deps: ServerKeysDeps): void {
  installHandlers(deps)
  if (keysWindow && !keysWindow.isDestroyed()) {
    if (keysWindow.isMinimized()) keysWindow.restore()
    keysWindow.show()
    keysWindow.focus()
    return
  }

  const win = new BrowserWindow({
    width: 560,
    height: 620,
    minWidth: 420,
    minHeight: 360,
    show: false,
    title: mainT('serverKeys.title'),
    autoHideMenuBar: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/server-keys.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  })
  win.setMenu(null)
  keysWindow = win
  win.on('closed', () => {
    if (keysWindow === win) keysWindow = undefined
  })

  // Одна форма — никуда не уходит и ничего не открывает.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event) => event.preventDefault())
  win.once('ready-to-show', () => {
    win.show()
    win.focus()
  })

  if (deps.rendererUrl) {
    void win.loadURL(new URL('server-keys.html', deps.rendererUrl).toString())
  } else {
    void win.loadFile(join(__dirname, '../renderer/server-keys.html'))
  }
}
