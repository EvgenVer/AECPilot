// Поиск по тексту открытого PDF (задача 4.1).
//
// pdf.js отдаёт текст кусками в порядке отрисовки, а не чтения: одно слово
// может приехать тремя элементами, а перенос строки — это флаг на элементе, а
// не символ. Поэтому искать по кускам нельзя; поиск идёт по ОДНОЙ строке на
// страницу, а рядом лежит карта «символ → кусок, откуда он взят» — она и нужна
// подсветке, чтобы показать найденное на холсте.

/** Кусок текста со страницы, в пользовательских координатах PDF. */
export type TextPiece = {
  text: string
  /** Левый край и базовая линия куска. */
  x: number
  y: number
  width: number
  height: number
  /** После куска кончается строка (`hasEOL` у pdf.js). */
  eol: boolean
}

export type SearchablePage = {
  page: number
  /** В нижнем регистре, пробельные последовательности сжаты до одного пробела. */
  text: string
  /** owner[i] — номер куска, из которого пришёл символ text[i]. */
  owner: number[]
  pieces: TextPiece[]
}

export type Match = {
  page: number
  /** Куски, по которым проходит совпадение, по порядку. */
  pieces: number[]
}

/** Минимальная длина запроса. Один символ подсветил бы полдокумента, и это не
 *  поиск, а шум. */
export const MIN_QUERY = 2

export function normalizeQuery(query: string): string {
  return query.toLowerCase().replace(/\s+/g, ' ').trim()
}

export function toSearchable(page: number, pieces: TextPiece[]): SearchablePage {
  let text = ''
  const owner: number[] = []

  pieces.forEach((piece, index) => {
    // Перенос строки в pdf.js — флаг, а не символ; без этого пробела последнее
    // слово строки слипается с первым словом следующей.
    const raw = piece.eol ? `${piece.text} ` : piece.text

    for (let at = 0; at < raw.length; at += 1) {
      // Регистр меняет длину у отдельных символов, поэтому карта заполняется по
      // получившимся символам, а не по исходным — иначе она разъедется.
      for (const char of raw[at].toLowerCase()) {
        if (/\s/.test(char)) {
          if (text.length === 0 || text.endsWith(' ')) continue
          text += ' '
        } else {
          text += char
        }
        owner.push(index)
      }
    }
  })

  // Страница почти всегда кончается переносом строки, то есть висячим пробелом.
  // Он невидим и ничему не мешает, но ломает единственный инвариант, на который
  // опирается подсветка: длина карты равна длине текста.
  if (text.endsWith(' ')) {
    text = text.slice(0, -1)
    owner.pop()
  }

  return { page, text, owner, pieces }
}

export function findMatches(pages: SearchablePage[], query: string): Match[] {
  const needle = normalizeQuery(query)
  if (needle.length < MIN_QUERY) return []

  const matches: Match[] = []

  for (const page of pages) {
    let from = 0
    for (;;) {
      const at = page.text.indexOf(needle, from)
      if (at < 0) break

      const pieces: number[] = []
      for (let index = at; index < at + needle.length; index += 1) {
        const piece = page.owner[index]
        if (piece !== undefined && pieces[pieces.length - 1] !== piece) pieces.push(piece)
      }
      matches.push({ page: page.page, pieces })

      // Совпадения не перекрываются: следующее ищется за концом текущего.
      from = at + needle.length
    }
  }

  return matches
}

/** Номер совпадения, на которое встать после смены запроса: первое на текущей
 *  странице, иначе первое вообще. Читатель ищет то, что перед глазами, — прыжок
 *  на первую страницу документа он воспримет как промах поиска. */
export function matchNearPage(matches: Match[], page: number): number {
  const at = matches.findIndex((match) => match.page >= page)
  return at < 0 ? 0 : at
}
