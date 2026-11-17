// Задача T75 (UR55): переходы по ссылкам md и картинки из vault — то, что
// трогает мост. Правила разбора — в `vault-link-pure.ts`.

import { openDocument } from './viewer-store'
import { imageMime, isExternalHref, linkFileName, resolveVaultLink } from './vault-link-pure'
import { findPage } from './wikilink-pure'

/** `[текст](путь)` из md-файла `fromRel`: файл vault — в окне документов,
 *  страница в сети — в браузере. Возвращает, съеден ли щелчок. */
export function openMarkdownLink(fromRel: string, href: string): boolean {
  if (isExternalHref(href)) {
    void window.aecpilot.openExternalLink(href.trim())
    return true
  }
  const rel = resolveVaultLink(fromRel, href)
  if (!rel) return false
  openDocument({ locator: {}, relPath: rel })
  return true
}

/** Адрес картинки для `<img>`: байты из vault через мост, в blob-URL. Путь
 *  `![](путь)` — от md-файла; `![[имя]]` — по имени во всём vault. Нет файла
 *  или это не картинка — `null`, и вместо картинки остаётся текст ссылки. */
export async function vaultImageUrl(
  fromRel: string,
  reference: { name: string } | { path: string }
): Promise<null | string> {
  let rel: null | string
  if ('name' in reference) {
    const fileName = linkFileName(reference.name)
    rel = fileName ? findPage(await window.aecpilot.getVaultTree(), fileName) : null
  } else {
    rel = resolveVaultLink(fromRel, reference.path)
  }
  if (!rel) return null
  const read = await window.aecpilot.readDocument(rel)
  if (!read.ok) return null
  return URL.createObjectURL(new Blob([read.bytes], { type: imageMime(rel) }))
}
