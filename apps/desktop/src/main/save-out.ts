// Сохранение наружу — сторона Electron (задача 3.27).
//
// Решения живут в `save-out-pure.ts`; здесь только то, что без Electron и без
// диска не проверить: показать диалог, дойти до файла, записать.
//
// ОДИН ПОРЯДОК ДЛЯ ВСЕХ ТРЁХ ГЛАГОЛОВ: сначала источник (и отказ, если он не
// проходит), потом диалог, и только потом запись. Диалог после проверки — это
// не мелочь: человек не должен выбирать место для файла, который ему всё равно
// не отдадут.

import * as fs from 'node:fs/promises'
import { Buffer } from 'node:buffer'
import { BrowserWindow, dialog, type SaveDialogOptions } from 'electron'

import { isInside, resolveArtifactPath } from './artifact-files-pure'
import {
  classifySaveSource,
  planSaveDialog,
  safeFileName,
  type SaveDialogPlan,
  type SaveDialogRequest
} from './save-out-pure'
import { mainT } from './i18n'

export interface SaveOutcome {
  saved: boolean
  /** Человек закрыл диалог. Не ошибка — про отмену не сообщают. */
  canceled?: boolean
  path?: string
  error?: string
}

export function saveOutsideProject(): string {
  return mainT('saveOut.outsideProject')
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function askWhereToSave(
  window: BrowserWindow | undefined,
  plan: SaveDialogPlan
): Promise<string | null> {
  const options: SaveDialogOptions = {
    ...(plan.title === undefined ? {} : { title: plan.title }),
    ...(plan.filters === undefined ? {} : { filters: plan.filters }),
    defaultPath: plan.defaultPath,
    properties: ['createDirectory', 'showOverwriteConfirmation']
  }

  const result = window
    ? await dialog.showSaveDialog(window, options)
    : await dialog.showSaveDialog(options)

  return result.canceled || !result.filePath ? null : result.filePath
}

/** Спрашивает место и выполняет запись. Отмена — это `saved: false` без
 * `error`: вызывающая сторона донора показывает уведомление только на `true`,
 * а ошибку — только на исключении. */
async function writeWhereChosen(
  window: BrowserWindow | undefined,
  suggestedName: string,
  write: (target: string) => Promise<void>
): Promise<SaveOutcome> {
  const target = await askWhereToSave(window, { defaultPath: suggestedName })
  if (!target) return { saved: false, canceled: true }

  try {
    await write(target)
    return { saved: true, path: target }
  } catch (error: unknown) {
    return { saved: false, error: mainT('saveOut.writeFailed', messageOf(error)) }
  }
}

/** Доводит путь от модели до настоящего места на диске.
 *
 * Проверка двухслойная — ровно та же, что у `artifacts:preview`: лексическая
 * принадлежность проекту, затем `realpath`. Без второго слоя ссылка, лежащая
 * внутри проекта, вынесла бы наружу любой файл, на который она указывает. */
async function resolveInsideProject(
  projectRoot: string | undefined,
  value: unknown
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const resolved = resolveArtifactPath(projectRoot, value)
  if (!resolved.ok) return { ok: false, error: resolved.error }
  if (!resolved.insideProject) return { ok: false, error: saveOutsideProject() }

  try {
    const realPath = await fs.realpath(resolved.absPath)
    if (!isInside(projectRoot, realPath)) return { ok: false, error: saveOutsideProject() }

    const info = await fs.stat(realPath)
    if (!info.isFile()) return { ok: false, error: mainT('common.notAFileDot') }

    return { ok: true, path: realPath }
  } catch {
    return { ok: false, error: mainT('saveOut.fileGone') }
  }
}

/** Их `selectSavePath`: нативный диалог «сохранить как» сам по себе. Пишет по
 * выбранному пути не он, а тот, кто его позвал (экспорт профиля отдаёт путь
 * шлюзу, и архив собирает шлюз). */
export function selectSavePath(
  window: BrowserWindow | undefined,
  request: SaveDialogRequest | undefined
): Promise<string | null> {
  return askWhereToSave(window, planSaveDialog(request, 'untitled'))
}

/** Их `saveImageFromUrl`: кнопка «сохранить» у картинки в ленте, в результате
 * инструмента и в лупе скрепки. `source` — это `src` того самого `<img>`. */
export async function saveImageOut(
  window: BrowserWindow | undefined,
  projectRoot: string | undefined,
  source: unknown
): Promise<SaveOutcome> {
  const classified = classifySaveSource(source)

  if (classified.kind === 'refused') return { saved: false, error: classified.error }

  if (classified.kind === 'bytes') {
    const bytes = Buffer.from(classified.base64, 'base64')
    if (bytes.byteLength === 0) return { saved: false, error: mainT('saveOut.imageEmpty') }

    return writeWhereChosen(window, classified.suggestedName, async (target) => {
      await fs.writeFile(target, bytes)
    })
  }

  const resolved = await resolveInsideProject(projectRoot, classified.value)
  if (!resolved.ok) return { saved: false, error: resolved.error }

  return writeWhereChosen(
    window,
    safeFileName(resolved.path, classified.suggestedName),
    async (target) => {
      await fs.copyFile(resolved.path, target)
    }
  )
}

/** Их `saveGatewayFile`: файл, который сделал агент, — наружу.
 *
 * `profile` из их запроса здесь не при чём: профиль выбирает, К КАКОМУ шлюзу
 * обращаться, а шлюз у нас один и запущен этим же приложением. Когда появится
 * удалённый режим (задача 3.13b), файл будет лежать на чужой машине, и та
 * ветка — не копирование, а выкачивание через соединение; её и добавит 3.13b. */
export async function saveFileOut(
  window: BrowserWindow | undefined,
  projectRoot: string | undefined,
  payload: { path?: unknown; suggestedName?: unknown }
): Promise<SaveOutcome> {
  const resolved = await resolveInsideProject(projectRoot, payload.path)
  if (!resolved.ok) return { saved: false, error: resolved.error }

  const fallback = safeFileName(resolved.path, 'untitled')

  return writeWhereChosen(window, safeFileName(payload.suggestedName, fallback), async (target) => {
    await fs.copyFile(resolved.path, target)
  })
}
