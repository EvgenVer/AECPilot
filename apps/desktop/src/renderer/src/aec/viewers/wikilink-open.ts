// Переход по `[[Страница]]` (задача 4.6).
//
// Отдельным файлом от редактора: сам переход не про редактирование, его
// вызывает плагин ProseMirror, и проверять его удобнее без поднятого редактора.

import { openDocument } from './viewer-store'
import { findPage, pageFileName } from './wikilink-pure'

/** Страница ищется по имени во всём vault, а если её нет — заводится в `wiki/`,
 *  пустой, и сразу открывается.
 *
 *  Заводится молча и намеренно: ссылка на ещё не написанную страницу — это
 *  нормальный ход работы в вики, а не ошибка, и спрашивать «создать?» на каждый
 *  переход значит мешать. Пустой файл ничего не портит, а lint (задача 4.11)
 *  потом покажет его как сироту. */
export async function openWikiPage(target: string): Promise<void> {
  const fileName = pageFileName(target)
  if (!fileName) return

  const existing = findPage(await window.aecpilot.getVaultTree(), fileName)
  if (existing) {
    openDocument({ locator: {}, relPath: existing })
    return
  }

  const created = await window.aecpilot.createVaultFile('wiki', fileName)
  if (created.ok) openDocument({ locator: {}, relPath: `wiki/${fileName}` })
}
