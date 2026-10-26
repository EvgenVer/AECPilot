// Как ссылка находит место внутри документа (задача 4.4).
//
// Адресация родная для каждого формата (решение O4, docs/history/specs/qa-over-sources.md):
// у таблицы это `Ведомость!C5:D6` — ровно то, что Excel пишет в поле адреса, —
// у DOCX это заголовок, потому что страниц у файла нет вовсе: Word рисует их
// при печати.
//
// Разбор адреса живёт отдельно от просмотрщиков: и таблица, и текстовый
// документ ищут место одинаково, а ошибиться в переводе «C» → 3 легче, чем
// кажется — после Z идёт AA, а не BA.

export type CellRange = {
  bottom: number
  left: number
  right: number
  top: number
}

/** Номер столбца по буквам: A → 1, Z → 26, AA → 27. Регистр не важен —
 *  инженер пишет и так, и так. */
export function columnNumber(letters: string): number {
  let number = 0
  for (const letter of letters.toUpperCase()) {
    const at = letter.charCodeAt(0) - 64
    if (at < 1 || at > 26) return 0
    number = number * 26 + at
  }
  return number
}

const CELL = /^([A-Za-z]{1,3})(\d{1,7})$/

/** `C5`, `C5:D6` → границы в единицах листа (с единицы, как их видит человек).
 *  Неразбираемый адрес — это `null`, а не выделение первой ячейки: соврать про
 *  место хуже, чем открыть файл целиком. */
export function parseA1Range(range: string): CellRange | null {
  const parts = range.trim().split(':')
  if (parts.length > 2) return null

  const corners = parts.map((part) => CELL.exec(part))
  if (corners.some((corner) => corner === null)) return null

  const cells = (corners as RegExpExecArray[]).map((corner) => ({
    column: columnNumber(corner[1]),
    row: Number(corner[2])
  }))
  if (cells.some((cell) => cell.column === 0 || cell.row === 0)) return null

  const [first, second = first] = cells
  return {
    bottom: Math.max(first.row, second.row),
    left: Math.min(first.column, second.column),
    right: Math.max(first.column, second.column),
    top: Math.min(first.row, second.row)
  }
}

/** Попадает ли ячейка в названный диапазон. Индексы с нуля — так их считает
 *  сетка; границы диапазона с единицы — так их пишет человек. Перевод сделан
 *  здесь один раз, чтобы не делать его в разметке при каждой ячейке. */
export function isCited(row: number, column: number, range: CellRange | null): boolean {
  if (!range) return false
  return (
    row + 1 >= range.top &&
    row + 1 <= range.bottom &&
    column + 1 >= range.left &&
    column + 1 <= range.right
  )
}

/** Лист по имени. Точное совпадение, иначе без учёта регистра и краевых
 *  пробелов: имя листа переносится в цитату руками модели, и «ведомость»
 *  вместо «Ведомость» — обычная её вольность. `null`, если такого листа нет:
 *  открыть чужой лист хуже, чем открыть первый. */
export function findSheet(names: string[], wanted: string | undefined): null | number {
  if (!wanted) return null

  const exact = names.indexOf(wanted)
  if (exact >= 0) return exact

  const folded = wanted.trim().toLowerCase()
  const loose = names.findIndex((name) => name.trim().toLowerCase() === folded)
  return loose >= 0 ? loose : null
}

/** Заголовок из ссылки сравнивается по префиксу: цитата обрезает его по
 *  первому `]`, `#` или переводу строки (docs/history/specs/qa-over-sources.md), поэтому
 *  требовать полного совпадения значило бы не находить именно обрезанные. */
export function normalizeHeading(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase()
}

export function headingMatches(elementText: string, heading: string): boolean {
  const wanted = normalizeHeading(heading)
  if (wanted.length === 0) return false
  return normalizeHeading(elementText).startsWith(wanted)
}
