// Сворачивание в трей (задача 3G.23, D-146; решение владельца 2026-09-28 —
// «всё для Windows»). Перенос их `electron/minimize-to-tray.ts` (Hermes
// Desktop, MIT, v2026.9.24) в наш главный процесс: окно у них уже есть
// (`donor/app/settings/minimize-to-tray-setting.tsx`), ему нужен только этот
// канал. Отличия от их файла:
//   - иконка — значок самого исполняемого файла (`app.getFileIcon`): своего
//     файла иконки у приложения нет, а без иконки трея не бывает;
//   - подписи трея — наши, на языке интерфейса (`i18n.ts`) и пересобираются при его смене;
//   - нет их слежки за хозяином трея под Linux (`tray-host`) и выхода «для
//     передачи» (`isQuittingForHandoff`): ни того, ни другого у нас нет.
// Выключено по умолчанию и хранится только на этой машине — как у них.

import { app, BrowserWindow, ipcMain, Menu, nativeImage, Tray } from 'electron'
import type { NativeImage } from 'electron'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { mainT, onUiLanguageChange } from './i18n'

export interface MinimizeToTrayStatus {
  enabled: boolean
  available: boolean
}

interface Options {
  preferencesPath: string
  getIcon: () => Promise<NativeImage>
  restoreMainWindow: () => void
  log: (message: string) => void
}

export function createMinimizeToTray(options: Options) {
  let enabled = false
  let quitting = false
  let tray: Tray | null = null
  let pending: Promise<unknown> = Promise.resolve()
  const hidden = new Set<BrowserWindow>()

  const status = (): MinimizeToTrayStatus => ({ enabled, available: !!tray && !tray.isDestroyed() })

  const broadcast = (): void => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('minimize-to-tray:changed', status())
    }
  }

  const released = (win: BrowserWindow): void => {
    if (hidden.delete(win) && process.platform === 'win32') win.setSkipTaskbar(false)
  }

  const restoreHidden = (): void => {
    for (const win of [...hidden]) {
      if (win.isDestroyed()) {
        hidden.delete(win)
        continue
      }
      released(win)
      if (win.isMinimized()) win.restore()
      win.showInactive()
    }
  }

  const restore = (): void => {
    restoreHidden()
    options.restoreMainWindow()
  }

  const destroyTray = (): void => {
    tray?.destroy()
    tray = null
  }

  /** Меню собирается заново, а не хранится: подписи зависят от языка интерфейса. */
  const trayMenu = (): Menu =>
    Menu.buildFromTemplate([
      { label: mainT('tray.show'), click: restore },
      { type: 'separator' },
      // Обычный выход — с тем же вопросом о незаконченной работе.
      { label: mainT('tray.quit'), click: () => app.quit() }
    ])

  // Переключили язык — уже стоящий в трее значок получает меню на новом языке
  // (задача T27); следующий показ меню прочтёт его, а не старое.
  onUiLanguageChange(() => {
    if (tray && !tray.isDestroyed()) tray.setContextMenu(trayMenu())
  })

  const apply = async (on: boolean): Promise<MinimizeToTrayStatus> => {
    enabled = on
    if (!on) {
      restoreHidden()
      destroyTray()
    } else if (!status().available && !quitting) {
      try {
        const icon = await options.getIcon()
        if (icon.isEmpty()) throw new Error('No usable tray icon')
        tray = new Tray(icon.resize({ width: 16, height: 16 }))
        tray.setToolTip('AECPilot')
        tray.setContextMenu(trayMenu())
        tray.on('click', restore)
        tray.on('double-click', restore)
      } catch (error) {
        restoreHidden()
        destroyTray()
        options.log(
          `aecpilot: tray unavailable; ordinary window behavior retained: ${String(error)}`
        )
      }
    }
    broadcast()
    return status()
  }

  function registerWindow(win: BrowserWindow, { closeToTray = false } = {}): void {
    const hide = (): boolean => {
      if (!enabled || !status().available || quitting) return false
      hidden.add(win)
      if (process.platform === 'win32') win.setSkipTaskbar(true)
      win.hide()
      return true
    }

    win.on('minimize', hide)
    if (closeToTray) {
      win.on('close', (event) => {
        if (hide()) event.preventDefault()
      })
    }
    // Конец сеанса Windows не обязан присылать before-quit; держать его нельзя.
    win.on('query-session-end', () => {
      quitting = true
    })
    win.on('show', () => released(win))
    win.on('restore', () => released(win))
    win.on('closed', () => hidden.delete(win))
  }

  function start(): Promise<MinimizeToTrayStatus> {
    let on = false
    try {
      on =
        (JSON.parse(readFileSync(options.preferencesPath, 'utf8')) as { enabled?: unknown })
          .enabled === true
    } catch {
      // Нет файла или он испорчен — обычное поведение окна.
    }
    const operation = apply(on)
    pending = operation.catch(() => undefined)
    return operation
  }

  function setEnabled(on: boolean): Promise<MinimizeToTrayStatus> {
    // Записи из разных окон по очереди, чтобы старая не победила новую.
    const operation = pending.then(() => {
      mkdirSync(dirname(options.preferencesPath), { recursive: true })
      writeFileSync(`${options.preferencesPath}.tmp`, JSON.stringify({ enabled: on }), 'utf8')
      renameSync(`${options.preferencesPath}.tmp`, options.preferencesPath)
      return apply(on)
    })
    pending = operation.catch(() => undefined)
    return operation
  }

  ipcMain.handle('minimize-to-tray:get', status)
  ipcMain.handle('minimize-to-tray:set', (_event, on: unknown) => setEnabled(on === true))
  app.on('will-quit', destroyTray)

  return {
    start,
    registerWindow,
    /** Звать только ПОСЛЕ того, как вопрос о работе принял выход: «Остаться»
     * должно оставить трей и спрятанные окна как были. */
    beginQuit: (): void => {
      quitting = true
    }
  }
}

/** Значок исполняемого файла — единственная иконка, которая у приложения есть. */
export function executableIcon(): Promise<NativeImage> {
  return app.getFileIcon(process.execPath, { size: 'small' }).catch(() => nativeImage.createEmpty())
}
