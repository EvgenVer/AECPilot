// Задача T42.2 (их `external-open-failed`, решение владельца 2026-10-19): ссылка, которую
// ОС открыть не смогла, не должна оставаться мёртвым кликом. Отказ `shell.openExternal`
// уходит всем окнам; их диалог (`components/external-open-failed-dialog.tsx`) показывает
// адрес, чтобы человек мог скопировать его и открыть сам. Решение «можно ли открывать»
// по-прежнему принимает `external-link-policy.ts` — сюда приходят только разрешённые.

import { BrowserWindow, shell } from 'electron'

export const EXTERNAL_OPEN_FAILED_CHANNEL = 'external-open:failed'

function reportFailure(url: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  console.warn(`aecpilot: could not open ${url}: ${message}`)
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(EXTERNAL_OPEN_FAILED_CHANNEL, { url, message })
  }
}

/** Открывает уже разрешённый адрес; при отказе ОС сообщает окнам и пробрасывает ошибку. */
export async function openExternalReporting(url: string): Promise<void> {
  try {
    await shell.openExternal(url)
  } catch (error: unknown) {
    reportFailure(url, error)
    throw error
  }
}

/** То же для мест, где ответа никто не ждёт (переход по ссылке, `window.open`). */
export function openExternalInBackground(url: string): void {
  openExternalReporting(url).catch(() => {
    // уже сообщено окнам
  })
}
