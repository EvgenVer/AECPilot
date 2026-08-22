// Видно ли, что микрофон слушает (задача 3.7b).
//
// ПОЧЕМУ ЭТО ОТДЕЛЬНОЕ ОКНО, А НЕ ЗНАЧОК В НАШЕМ. Слово-активатор работает,
// когда на приложение никто не смотрит: окно свёрнуто, человек в другой
// программе, а микрофон открыт и слушает. Значок внутри свёрнутого окна не
// виден — то есть не выполняет единственной своей работы. Поэтому индикатор
// живёт снаружи: маленькое окно поверх всех, сквозное для щелчков.
//
// ЭТО НЕ УКРАШЕНИЕ, А ПРИВАТНОСТЬ. Открытый микрофон, о котором не сказано, —
// ровно то, чего человек не прощает; требование задачи «индикатор виден» стоит
// рядом с «выключение отключает захват полностью» не случайно.
//
// ОКНО СВОЁ, А НЕ ИХ. У донора индикатор живёт в `electron/wake-indicator*.ts`
// — в коде главного процесса, которого мы не переносили (наш main наш), и в
// собственной странице, которой в перенесённом рендерере нет. Поэтому и окно, и
// страница здесь наши, а из их кода берётся только контракт состояний.

import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'

/** Фраза по умолчанию. Их умолчание называет их продукт, а фразу видно на
 * экране — см. `applyDefaultWakePhrase` в `index.ts`. */
export const DEFAULT_WAKE_PHRASE = 'hey pilot'

/** Их три состояния (`lib/wake-indicator.ts`). */
export type WakeIndicatorState = 'capturing' | 'detected' | 'hidden'

const WIDTH = 168
const HEIGHT = 44
const MARGIN = 24

let indicator: BrowserWindow | undefined
let state: WakeIndicatorState = 'hidden'

export function wakeIndicatorState(): WakeIndicatorState {
  return state
}

function ensureWindow(): BrowserWindow {
  if (indicator && !indicator.isDestroyed()) return indicator

  const work = screen.getPrimaryDisplay().workArea

  indicator = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    x: work.x + work.width - WIDTH - MARGIN,
    y: work.y + MARGIN,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/wake-indicator.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  indicator.setAlwaysOnTop(true, 'screen-saver')
  indicator.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  // Всегда сквозное: это табличка, а не элемент управления. Щёлкать по ней
  // незачем, а перехватывать чужие щелчки она не должна тем более.
  indicator.setIgnoreMouseEvents(true)

  indicator.on('closed', () => {
    indicator = undefined
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void indicator.loadURL(`${process.env.ELECTRON_RENDERER_URL}wake-indicator.html`)
  } else {
    void indicator.loadFile(join(__dirname, '../renderer/wake-indicator.html'))
  }

  return indicator
}

/** Единственный вход: рендерер главного окна говорит, что происходит с
 * захватом, а окно-индикатор появляется или исчезает. */
export function setWakeIndicatorState(raw: unknown): void {
  const next: WakeIndicatorState = raw === 'capturing' || raw === 'detected' ? raw : 'hidden'

  state = next

  if (next === 'hidden') {
    if (indicator && !indicator.isDestroyed()) indicator.hide()
    return
  }

  const window = ensureWindow()
  window.webContents.send('wake-indicator:state', next)
  // `showInactive`, а не `show`: индикатор не должен воровать фокус у той
  // программы, в которой человек работает.
  if (!window.isVisible()) window.showInactive()
}

/** Закрытие приложения. Табличка, пережившая программу, — худший из возможных
 * индикаторов: она сообщает о микрофоне, которого больше нет. */
export function stopWakeIndicator(): void {
  if (indicator && !indicator.isDestroyed()) indicator.destroy()
  indicator = undefined
  state = 'hidden'
}
