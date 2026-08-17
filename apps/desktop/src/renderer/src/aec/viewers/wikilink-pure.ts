// Разбор ссылок вида `[[Страница]]` (задача 4.6).
//
// Ссылки НЕ становятся узлами документа, и это главное решение здесь. Узел
// пришлось бы сериализовать обратно в markdown, а любая неточность обратного
// перевода означает, что редактор молча переписал файл человека — ровно то,
// чего вики обещает не делать (specs/wiki.md, «Ручная правка сохраняется»).
// Поэтому `[[…]]` остаётся обычным текстом, а подсветка и клик живут
// украшениями поверх него: документ от них не меняется ни на символ.

export type WikiLink = {
  /** Индекс закрывающей скобки + 1, в символах текста абзаца. */
  end: number
  /** Что показано человеку: подпись после `|`, иначе сама цель. */
  label: string
  start: number
  /** Куда ведёт: до `|`. */
  target: string
}

// Внутри скобок не может быть `[`, `]` и перевода строки — иначе непонятно,
// где ссылка кончается. Пустая ссылка `[[]]` не ссылка.
const WIKILINK = /\[\[([^[\]\n|]+)(?:\|([^[\]\n]*))?\]\]/g

export function findWikiLinks(text: string): WikiLink[] {
  const links: WikiLink[] = []

  for (const match of text.matchAll(WIKILINK)) {
    const target = match[1].trim()
    if (target.length === 0) continue
    const label = (match[2] ?? '').trim()
    links.push({
      end: match.index + match[0].length,
      label: label.length > 0 ? label : target,
      start: match.index,
      target
    })
  }

  return links
}

/** Ссылка, внутри которой стоит указанная позиция. Скобки считаются частью
 *  ссылки: человек целится в слово, но попасть может и в них. */
export function linkAt(text: string, offset: number): null | WikiLink {
  return findWikiLinks(text).find((link) => offset >= link.start && offset <= link.end) ?? null
}

/** Имя файла страницы. Цель может быть записана с подпапкой (`entities/ТП-1`)
 *  или с расширением — до файла доходит только последнее имя: страницы
 *  ищутся по имени во всём vault, как это принято в вики. */
export function pageFileName(target: string): null | string {
  const last = target.split(/[\\/]/).pop()?.trim() ?? ''
  if (last.length === 0 || last === '.' || last === '..') return null
  // Символы, которых не бывает в имени файла Windows, плюс управляющие: они и
  // есть цель проверки, отсюда снятое правило. Пробелы и дефисы законны —
  // «Кабельный журнал» и «ТП-1» обычные имена страниц. Отказ, а не замена:
  // подставить своё имя значит увести человека не туда, куда он целился.
  // eslint-disable-next-line no-control-regex -- управляющие символы и проверяем
  if (/[<>:"|?*\u0000-\u001f]/.test(last)) return null
  return last.toLowerCase().endsWith('.md') ? last : `${last}.md`
}

type TreeNode = { children?: TreeNode[]; name: string; path: string; type: 'dir' | 'file' }

/** Путь существующей страницы с таким именем — где угодно в vault. Регистр не
 *  важен: ссылку пишет человек или агент, и `[[тп-1]]` должно находить
 *  `ТП-1.md`. Первое совпадение в обходе, а не «лучшее»: две страницы с одним
 *  именем — это дефект вики, и его ловит lint (задача 4.11), а не переход. */
export function findPage(tree: TreeNode[], fileName: string): null | string {
  const wanted = fileName.toLowerCase()

  const walk = (nodes: TreeNode[]): null | string => {
    for (const node of nodes) {
      if (node.type === 'file' && node.name.toLowerCase() === wanted) return node.path
      const found = node.children ? walk(node.children) : null
      if (found) return found
    }
    return null
  }

  return walk(tree)
}
