// Плавающая лента — сторона Electron (задача 3.24).
//
// Границы и умолчания живут в `hud-pure.ts`; здесь окно и его повадки.
//
// ПОЧЕМУ ЭТО ОТДЕЛЬНОЕ ОКНО, А НЕ ПАНЕЛЬ. Смысл HUD — быть НАД чужой
// программой: человек работает в чертёжной или в почте, а разговор держит перед
// глазами. Панель внутри нашего окна этого не умеет по определению.
//
// СКВОЗНЫЕ ЩЕЛЧКИ — ГЛАВНОЕ СВОЙСТВО. Окно поверх всех съедает каждый щелчок в
// своём прямоугольнике, видимый он или нет, а большая часть этого
// прямоугольника — прозрачная полоса над чужим содержимым. Поэтому окно делается
// мышенепроницаемым везде, кроме тех мест, где оно и правда нарисовано; решает
// это РЕНДЕРЕР (он один знает, что под курсором), а главный процесс исполняет.
// `forward: true` оставляет поток `mousemove` живым, иначе окно, начав
// пропускать щелчки, больше не узнает, что курсор вернулся, и останется
// прозрачным навсегда.
//
// ПРОЗРАЧНОСТЬ ЗДЕСЬ — НЕ ТО, ЧТО ИСКЛЮЧЕНО HX14. Там исключена прозрачность
// ГЛАВНОГО окна как украшение; здесь она — способ существования поверхности:
// сквозь неё видно то, над чем она висит.

import { BrowserWindow, screen, shell } from 'electron'
import { join } from 'node:path'

import { decideExternalLink, isOwnRendererUrl } from './external-link-policy'
import {
  clampBounds,
  defaultHudBounds,
  movedBy,
  readBounds,
  type Bounds,
  type WorkArea
} from './hud-pure'
import { planHudWindow, windowUrl } from './windows-pure'

export interface HudState {
  open: boolean
  sessionId: null | string
}

let hud: BrowserWindow | undefined
let sessionId: null | string = null
let notify: ((state: HudState) => void) | undefined

export function hudState(): HudState {
  return { open: hud !== undefined && !hud.isDestroyed(), sessionId }
}

export function onHudChanged(callback: (state: HudState) => void): void {
  notify = callback
}

function workArea(): WorkArea {
  const point = screen.getCursorScreenPoint()
  return screen.getDisplayNearestPoint(point).workArea
}

function currentBounds(): Bounds | null {
  if (!hud || hud.isDestroyed()) return null
  return hud.getBounds()
}

/** Открывает ленту или, если она уже есть, показывает её на нужном разговоре. */
export function openHud(
  request: { sessionId?: unknown; profile?: unknown } | undefined,
  rendererUrl: string | undefined
): { ok: boolean } {
  sessionId = typeof request?.sessionId === 'string' ? request.sessionId : null

  if (hud && !hud.isDestroyed()) {
    hud.show()
    hud.focus()
    notify?.(hudState())
    return { ok: true }
  }

  const bounds = defaultHudBounds(workArea())

  hud = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  // Поверх ЛЮБОГО окна, включая полноэкранные чужие: смысл поверхности в этом.
  hud.setAlwaysOnTop(true, 'screen-saver')
  hud.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // Та же граница, что у главного окна (задача 1.6.4a): ссылка из ответа агента
  // уходит в браузер, а не открывается поверх нашего preload.
  const ownUrl = rendererUrl ?? ''
  hud.webContents.setWindowOpenHandler(({ url }) => {
    const decision = decideExternalLink(url)
    if (decision.allowed) void shell.openExternal(decision.url)
    return { action: 'deny' }
  })
  hud.webContents.on('will-navigate', (event, url) => {
    if (isOwnRendererUrl(url, ownUrl)) return
    event.preventDefault()
    const decision = decideExternalLink(url)
    if (decision.allowed) void shell.openExternal(decision.url)
  })

  hud.on('closed', () => {
    hud = undefined
    notify?.(hudState())
  })

  const plan = planHudWindow(sessionId, request?.profile)

  if (process.env.ELECTRON_RENDERER_URL) {
    void hud.loadURL(windowUrl(process.env.ELECTRON_RENDERER_URL, plan))
  } else {
    void hud.loadFile(join(__dirname, '../renderer/index.html'), {
      query: plan.query,
      ...(plan.hash === '' ? {} : { hash: plan.hash })
    })
  }

  notify?.(hudState())
  return { ok: true }
}

export function closeHud(): { ok: boolean } {
  const window = hud
  hud = undefined
  sessionId = null

  if (window && !window.isDestroyed()) window.close()
  else notify?.(hudState())

  return { ok: true }
}

/** Пропускать щелчки насквозь. Решение принимает рендерер — он один знает, что
 * под курсором; здесь только исполнение. */
export function setHudIgnoreMouse(ignore: unknown): void {
  if (!hud || hud.isDestroyed()) return
  hud.setIgnoreMouseEvents(ignore === true, { forward: true })
}

export function moveHudBy(delta: unknown): void {
  const bounds = currentBounds()
  if (!bounds || !hud || hud.isDestroyed()) return

  const requested = (delta ?? {}) as Record<string, unknown>
  const numeric = (key: string): number =>
    typeof requested[key] === 'number' && Number.isFinite(requested[key])
      ? (requested[key] as number)
      : 0

  hud.setBounds(
    movedBy(
      bounds,
      {
        x: numeric('x'),
        y: numeric('y'),
        width: numeric('width'),
        height: numeric('height')
      },
      workArea()
    )
  )
}

/** Точные границы — их лента задаёт по высоте содержимого. Окно нерастягиваемое
 * (иначе на краях появляются захваты, которых у полосы быть не должно), поэтому
 * на время записи изменяемость включается и сразу возвращается назад — это их
 * же приём, см. `app/hud/resize-handle.ts`. */
export function setHudBounds(raw: unknown): void {
  const requested = readBounds(raw)
  if (!requested || !hud || hud.isDestroyed()) return

  const wasResizable = hud.isResizable()
  if (!wasResizable) hud.setResizable(true)
  hud.setBounds(clampBounds(requested, workArea()))
  if (!wasResizable) hud.setResizable(false)
}

/** Материал окна macOS. На других системах его нет — и ответ об этом честный,
 * чтобы их стекло не считало, что применилось. */
export function setHudVibrancy(on: unknown): { ok: boolean } {
  if (!hud || hud.isDestroyed()) return { ok: false }
  if (process.platform !== 'darwin') return { ok: false }

  hud.setVibrancy(on === true ? 'hud' : null)
  return { ok: true }
}

export function setHudSession(value: unknown): void {
  sessionId = typeof value === 'string' ? value : null
}

/** Закрытие приложения. Лента — вспомогательное окно, и переживать выход ей
 * незачем. */
export function stopHud(): void {
  if (hud && !hud.isDestroyed()) hud.destroy()
  hud = undefined
}
