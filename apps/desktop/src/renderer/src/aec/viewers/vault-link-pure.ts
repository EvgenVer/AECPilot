// Задача T75 (UR55, замечание владельца 5 на 0.1.0): ссылки и картинки в md —
// как в хранилище Obsidian. Здесь правила без DOM и без моста, каждое прибито
// тестом.
//
// Виды ссылок:
// - `[[страница]]` — страница вики по имени во всём vault (задача 4.6);
// - `[[файл.pdf]]`, `[[файл.docx]]` — файл по имени, с расширением;
// - `[текст](путь)` — путь от папки этого md-файла (или от корня vault, если
//   начинается с `/`);
// - `![](путь)` и `![[картинка.png]]` — картинка из vault.

/** Расширения файлов, на которые ведёт `[[…]]` как на файл, а не на страницу. */
const FILE_EXT_RE = /\.(md|markdown|pdf|docx|xlsx|csv|txt|png|jpe?g|gif|webp|bmp|svg)$/i
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|svg)$/i

const MIME_BY_EXT: Record<string, string> = {
  bmp: 'image/bmp',
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp'
}

export function isImageName(name: string): boolean {
  return IMAGE_EXT_RE.test(name)
}

export function imageMime(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return MIME_BY_EXT[ext] ?? 'application/octet-stream'
}

/** Имя файла, на который ведёт `[[цель]]`: с известным расширением — как есть,
 *  иначе страница вики `.md`. Подпапка отбрасывается — ищем по имени. Символы,
 *  которых не бывает в имени файла Windows, — отказ (`null`). */
export function linkFileName(target: string): null | string {
  const last = target.split(/[\\/]/).pop()?.trim() ?? ''
  if (last.length === 0 || last === '.' || last === '..') return null
  // eslint-disable-next-line no-control-regex -- управляющие символы и проверяем
  if (/[<>:"|?*\u0000-\u001f]/.test(last)) return null
  return FILE_EXT_RE.test(last) ? last : `${last}.md`
}

/** Ведёт ли ссылка наружу — на страницу в сети или в почту. */
export function isExternalHref(href: string): boolean {
  return /^(?:https?:|mailto:)/i.test(href.trim())
}

/** Путь `[текст](путь)` относительно vault: от папки md-файла `fromRel`, а `/…`
 *  — от корня vault. Якорь `#…` и запрос `?…` отбрасываются, `%20` и прочее
 *  раскодируются. Выход за корень vault, абсолютный путь диска, внешняя ссылка
 *  и цитата `#cite` — `null`: такие ссылки ведут не в файл vault. */
export function resolveVaultLink(fromRel: string, href: string): null | string {
  const raw = href.trim()
  if (raw === '' || raw.startsWith('#') || isExternalHref(raw)) return null
  if (/^[a-z]+:/i.test(raw) || /^[A-Za-z]:[\\/]/.test(raw) || raw.startsWith('\\\\')) return null

  let path = raw.replace(/[?#].*$/, '')
  try {
    path = decodeURIComponent(path)
  } catch {
    // битая последовательность — оставляем как написано
  }
  path = path.replace(/\\/g, '/')

  const base = path.startsWith('/') ? [] : fromRel.split('/').slice(0, -1)
  const parts = [...base]
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (parts.length === 0) return null
      parts.pop()
      continue
    }
    parts.push(part)
  }
  return parts.length ? parts.join('/') : null
}

/** Ссылки-вставки `![[…]]` в тексте блока: где стоит восклицательный знак
 *  перед `[[`. Возвращает позиции `[[` найденных ссылок. */
export function isEmbedAt(text: string, linkStart: number): boolean {
  return linkStart > 0 && text[linkStart - 1] === '!'
}
