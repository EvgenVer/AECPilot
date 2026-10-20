// Задача T42: сторона сети и диска проверки новой версии; решения — в
// `update-check-pure.ts`. Один запрос на запуск приложения, по первому окну, которое
// спросит; любой сбой (нет сети, нет файла, не тот ответ) — молчание (Check T42).

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { app, ipcMain, net } from 'electron'

import { decideUpdateNotice, feedUrlFrom, type UpdateNotice } from './update-check-pure'

const TIMEOUT_MS = 10_000
/** Файл версии — несколько строк; больше — значит по адресу лежит не он. */
const MAX_FEED_BYTES = 16 * 1024

/** Адрес из `aecpilot.updateFeedUrl` в package.json приложения — настройка сборки. */
function feedSetting(): unknown {
  try {
    const pkg = JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf-8')) as {
      aecpilot?: { updateFeedUrl?: unknown }
    }
    return pkg.aecpilot?.updateFeedUrl
  } catch {
    return undefined
  }
}

async function checkOnce(): Promise<UpdateNotice | null> {
  const url = feedUrlFrom(feedSetting())
  if (!url) return null
  try {
    const response = await net.fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    if (!response.ok) return null
    const text = await response.text()
    if (text.length > MAX_FEED_BYTES) return null
    return decideUpdateNotice(text, app.getVersion())
  } catch {
    return null
  }
}

let pending: Promise<UpdateNotice | null> | null = null

export function installUpdateCheck(): void {
  ipcMain.handle('update:check', () => {
    pending ??= checkOnce()
    return pending
  })
}
