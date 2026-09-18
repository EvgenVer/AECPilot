// Строки таблицы GFM, набранные текстом (задача 3F.4, D-94). Чистая часть —
// только распознавание строк; сам разбор в узел делает парсер редактора.

/** Ячейки строки `| а | б |`: разбито по `|`, крайние пустые (от внешних
 *  черт) отброшены. Экранированная `\|` ячейку не делит. */
export function cellsOf(line: string): string[] {
  const cells = line
    .trim()
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim())
  if (cells.length > 0 && cells[0] === '') cells.shift()
  if (cells.length > 0 && cells[cells.length - 1] === '') cells.pop()
  return cells
}

/** Строка таблицы, а не фраза с чертой: начинается с `|` и несёт хотя бы одну
 *  ячейку. Требование внешней черты слева намеренно — GFM её не требует, но без
 *  неё обычный текст вида «а | б» превращался бы в таблицу против воли. */
export function isTableRow(line: string): boolean {
  const trimmed = line.trim()
  return trimmed.startsWith('|') && cellsOf(trimmed).length > 0
}

/** Пустой ряд `|  |  |` — его схема таблицы заводит под шапкой, пока строк
 *  нет; сериализатор пишет пустую ячейку как `<br />`. */
export function isBlankRow(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed.startsWith('|')) return false
  const cells = cellsOf(trimmed)
  return cells.length > 0 && cells.every((cell) => /^(<br\s*\/?>)?$/.test(cell))
}

/** Строка-разделитель `|---|:--:|`: каждая ячейка — дефисы, по краям может
 *  стоять двоеточие выравнивания. */
export function isDelimiterRow(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed.includes('|')) return false
  const cells = cellsOf(trimmed)
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell))
}
