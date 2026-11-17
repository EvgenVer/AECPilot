// Переход по `[[Страница]]` (задача 4.6).
//
// Отдельным файлом от редактора: сам переход не про редактирование, его
// вызывает плагин ProseMirror, и проверять его удобнее без поднятого редактора.

import { openDocument } from './viewer-store'
import { linkFileName } from './vault-link-pure'
import { findPage } from './wikilink-pure'

/** Страница ищется по имени во всём vault, а если её нет — заводится в `wiki/`,
 *  пустой, и сразу открывается.
 *
 *  Заводится молча и намеренно: ссылка на ещё не написанную страницу — это
 *  нормальный ход работы в вики, а не ошибка, и спрашивать «создать?» на каждый
 *  переход значит мешать. Пустой файл ничего не портит, а lint (задача 4.11)
 *  потом покажет его как сироту. */
export async function openWikiPage(target: string): Promise<void> {
  // Задача T75 (UR55): `[[файл.pdf]]`, `[[файл.docx]]` — файл по имени, как в
  // Obsidian; без расширения — страница вики.
  const fileName = linkFileName(target)
  if (!fileName) return

  const existing = findPage(await window.aecpilot.getVaultTree(), fileName)
  if (existing) {
    openDocument({ locator: {}, relPath: existing })
    return
  }
  // Файла с расширением нет — ничего не заводим: пустой «PDF» был бы порчей,
  // а не обычным ходом работы вики.
  if (!/\.(md|markdown)$/i.test(fileName)) return

  const created = await window.aecpilot.createVaultFile('wiki', fileName)
  if (created.ok) openDocument({ locator: {}, relPath: `wiki/${fileName}` })
}
