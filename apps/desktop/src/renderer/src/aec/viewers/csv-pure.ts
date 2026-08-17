// Разбор CSV для просмотрщика (задача 4.3).
//
// Своими руками, а не библиотекой: правил здесь ровно три (кавычки, удвоенная
// кавычка внутри кавычек, перенос строки внутри кавычек), и они целиком
// помещаются в один проход. Зависимость ради этого была бы дороже.
//
// Разделитель определяется, а не задаётся: русский Excel сохраняет CSV через
// точку с запятой, потому что запятая у него — десятичный разделитель. Файл с
// «1,5» и запятой-разделителем прочитался бы как две колонки вместо одной, и
// ведомость поехала бы вся.

const CANDIDATES = [';', ',', '\t', '|'] as const

/** Разделитель, дающий больше всего колонок при постоянном их числе. Считается
 *  по первым строкам: заголовок и пара строк данных отличают настоящий
 *  разделитель от знака, случайно встретившегося в тексте. */
export function detectDelimiter(text: string): string {
  const probe = text.split(/\r?\n/).filter(Boolean).slice(0, 10)
  if (probe.length === 0) return ';'

  let best = ';'
  let bestScore = 0

  for (const candidate of CANDIDATES) {
    const counts = probe.map((line) => parseLine(line, candidate).length)
    const first = counts[0]
    if (first < 2) continue
    // Постоянство важнее количества: у настоящего разделителя число колонок
    // одинаково во всех строках, у случайного — пляшет.
    const steady = counts.every((count) => count === first)
    const score = (steady ? 1000 : 0) + first
    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  }

  return best
}

/** Одна строка в поля. Отдельно от `parseCsv`, потому что определение
 *  разделителя разбирает строки по нескольку раз, пробуя кандидатов. */
function parseLine(line: string, delimiter: string): string[] {
  const fields: string[] = []
  let field = ''
  let quoted = false

  for (let at = 0; at < line.length; at += 1) {
    const char = line[at]

    if (quoted) {
      if (char !== '"') {
        field += char
      } else if (line[at + 1] === '"') {
        field += '"'
        at += 1
      } else {
        quoted = false
      }
      continue
    }

    if (char === '"') quoted = true
    else if (char === delimiter) {
      fields.push(field)
      field = ''
    } else field += char
  }

  fields.push(field)
  return fields
}

export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let at = 0; at < text.length; at += 1) {
    const char = text[at]

    if (quoted) {
      if (char !== '"') {
        field += char
      } else if (text[at + 1] === '"') {
        field += '"'
        at += 1
      } else {
        quoted = false
      }
      continue
    }

    if (char === '"') {
      quoted = true
    } else if (char === delimiter) {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      // \r\n — один конец строки, а не два.
      if (char === '\r' && text[at + 1] === '\n') at += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }

  // Последняя строка без перевода в конце файла — обычное дело.
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows
}
