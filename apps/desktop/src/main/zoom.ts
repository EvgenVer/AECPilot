// Масштаб интерфейса — электронная половина (задача 3.26). Решения и шкала
// живут в `zoom-pure.ts` рядом с тестами.
//
// Что здесь: применение масштаба к каждому окну (включая новые), сохранение
// между запусками, рассылка изменений в рендерер и горячие клавиши
// Ctrl +/-/0 — их `store/zoom.ts` прямо обещает, что изменение с клавиатуры
// вернётся в интерфейс тем же путём, что и нажатие в настройках.

import { app, BrowserWindow, type WebContents } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import {
  clampPercent,
  levelForPercent,
  parseZoomJson,
  serializeZoom,
  steppedPercent,
  ZOOM_DEFAULT_PERCENT
} from './zoom-pure'

let current = ZOOM_DEFAULT_PERCENT
let loaded = false

function statePath(): string {
  return join(app.getPath('userData'), 'zoom.json')
}

function persist(percent: number): void {
  try {
    const path = statePath()
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, serializeZoom(percent), 'utf-8')
  } catch (error: unknown) {
    // Несохранённый масштаб не повод отменять действие: на экране он уже тот,
    // о котором попросили.
    console.error('aecpilot: could not persist zoom', error)
  }
}

/** Текущий масштаб. При первом обращении поднимается с диска. */
export function zoomPercent(): number {
  if (!loaded) {
    loaded = true
    try {
      current = parseZoomJson(readFileSync(statePath(), 'utf-8'))
    } catch {
      current = ZOOM_DEFAULT_PERCENT
    }
  }
  return current
}

function broadcast(percent: number): void {
  const level = levelForPercent(percent)
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('zoom:changed', { level, percent })
  }
}

/** Ставит масштаб всем окнам, сохраняет его и рассылает в рендерер. */
export function setZoomPercent(percent: unknown): { level: number; percent: number } {
  const next = clampPercent(typeof percent === 'number' ? percent : Number(percent))
  current = next
  loaded = true

  const level = levelForPercent(next)
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.setZoomLevel(level)
  }

  persist(next)
  broadcast(next)

  return { level, percent: next }
}

/** Применяет сохранённый масштаб к окну. Зовётся при создании каждого окна —
 * второе окно должно открываться в том же масштабе, что и первое. */
export function applyZoom(contents: WebContents): void {
  contents.setZoomLevel(levelForPercent(zoomPercent()))
}

/** Ctrl +/-/0 на любом окне. Ловится до страницы: внутри ленты те же сочетания
 * ничего не значат, а у Chromium свой зум, который разошёлся бы с нашим. */
export function installZoomShortcuts(win: BrowserWindow): void {
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !(input.control || input.meta) || input.alt) return

    const key = input.key
    const isIn = key === '=' || key === '+'
    const isOut = key === '-' || key === '_'
    const isReset = key === '0'
    if (!isIn && !isOut && !isReset) return

    event.preventDefault()
    setZoomPercent(
      isReset ? ZOOM_DEFAULT_PERCENT : steppedPercent(zoomPercent(), isIn ? 'in' : 'out')
    )
  })
}
