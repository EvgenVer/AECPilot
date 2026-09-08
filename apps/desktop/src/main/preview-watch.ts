// Задача 3E.25 (SPEC UR22, замечание D-75): предпросмотр перерисовывается сам,
// когда файл на диске изменился. Решения — в `preview-watch-pure.ts`, здесь
// только диск и реестр наблюдателей.
//
// ЗАЧЕМ ЭТО ВООБЩЕ. Агент правит файл, а панель показывает прошлую версию —
// ровно тот разрыв «в ленте есть, в жизни нет», который запрещают UR36 и R19.
// Их панель умеет перерисовываться сама и ждёт четырёх членов моста; трёх из них
// у нас не было, и она молча не следила (`preview-pane.tsx:674` проверяет наличие
// члена). То есть поломки не было — была отсутствующая возможность.

import fs from 'node:fs'
import { basename, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'

import type { WebContents } from 'electron'

import { sameFile } from './preview-watch-pure'

export interface PreviewWatch {
  id: string
  path: string
}

interface Entry {
  watcher: fs.FSWatcher
  webContentsId: number
}

const watches = new Map<string, Entry>()
let counter = 0

/** Начинает слежение за файлом и возвращает то, чего ждёт их панель.
 *
 * Наблюдатель ставится на ПАПКУ файла (почему — в `sameFile`), `persistent:
 * false`, чтобы забытый наблюдатель не держал процесс живым. */
export function startPreviewWatch(absPath: string, sender: WebContents): PreviewWatch {
  counter += 1
  const id = `aec-watch-${counter}`
  const base = basename(absPath)
  const url = pathToFileURL(absPath).toString()

  const watcher = fs.watch(dirname(absPath), { persistent: false }, (_event, changed) => {
    if (!sameFile(base, changed === null ? null : String(changed))) return

    // Окно могло закрыться между событием и отправкой: посылать в мёртвый
    // webContents — исключение, а не «ничего не произошло».
    if (sender.isDestroyed()) {
      stopPreviewWatch(id)

      return
    }

    sender.send('preview:file-changed', { id, path: absPath, url })
  })

  // Папка могла исчезнуть вместе с файлом. Наблюдатель после этого бесполезен, и
  // держать его значит копить мёртвые записи.
  watcher.on('error', () => stopPreviewWatch(id))

  watches.set(id, { watcher, webContentsId: sender.id })

  // Страховка на случай, когда окно закрылось, не успев снять слежение: их
  // панель снимает его в размонтировании, а закрытое окно размонтирования не
  // делает.
  sender.once('destroyed', () => stopPreviewWatchesFor(sender.id))

  return { id, path: absPath }
}

/** Снимает слежение. `false` — такого наблюдателя нет (уже снят или не наш). */
export function stopPreviewWatch(id: string): boolean {
  const entry = watches.get(id)

  if (!entry) return false

  watches.delete(id)
  try {
    entry.watcher.close()
  } catch {
    // Уже закрытый наблюдатель — не ошибка вызывающего.
  }

  return true
}

export function stopPreviewWatchesFor(webContentsId: number): void {
  for (const [id, entry] of watches) {
    if (entry.webContentsId === webContentsId) stopPreviewWatch(id)
  }
}

/** Сколько наблюдателей живо. Нужно тесту «повторное открытие их не копит» — без
 * этого числа утечку пришлось бы ловить по памяти процесса. */
export function previewWatchCount(): number {
  return watches.size
}
