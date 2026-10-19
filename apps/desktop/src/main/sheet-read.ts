// Разбор XLSX для просмотрщика (задача 4.3).
//
// Здесь, в главном процессе, а не в окне: exceljs — библиотека Node, и в
// браузерной сборке она тянет за собой полифилы потоков и архиватора. Окну
// достаётся готовая таблица строк, а не файл и разборщик к нему.
//
// Только чтение. Запись exceljs умеет, но источники read-only по SPEC UR2/AC6,
// а редактора ячейки у нас нет — см. PLAN §зависимости.

import type { SheetData, SheetReadResult } from '../shared/ipc'
import { mainT } from './i18n'

/** Потолок на лист. Ведомость на сто тысяч строк существует, но переслать её в
 *  окно одним куском значит подвесить и мост, и отрисовку; а показать первые
 *  двадцать тысяч и честно сказать, что это не всё, — рабочий ответ. */
const MAX_ROWS = 20_000

/** Потолок на столбцы: у листа бывает «хвост» из тысяч пустых колонок, которые
 *  Excel помнит, а человеку они не нужны. */
const MAX_COLUMNS = 200

/** Значение ячейки как строка. exceljs отдаёт разнородное: число, дату,
 *  объект формулы с кешем, объект форматированного текста. Показываем то, что
 *  человек увидел бы в Excel, а не внутреннее представление. */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) {
    // Дата без времени — обычный случай в ведомостях; время показывается,
    // только если оно там есть.
    const iso = value.toISOString()
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso.replace('T', ' ').slice(0, 19)
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    // Формула: показываем посчитанное значение, а не саму формулу — сверяют
    // цитату, а не пересчитывают книгу.
    if ('result' in record) return cellText(record.result)
    if ('richText' in record && Array.isArray(record.richText)) {
      return record.richText.map((part) => String((part as { text?: string }).text ?? '')).join('')
    }
    if ('text' in record) return String(record.text)
    if ('error' in record) return String(record.error)
    if ('hyperlink' in record) return String(record.text ?? record.hyperlink)
    return ''
  }
  return String(value)
}

export async function readSheets(absPath: string): Promise<SheetReadResult> {
  return readWorkbook((workbook) => workbook.xlsx.readFile(absPath))
}

/** Та же книга, но из байтов: при удалённом ядре файл приходит по сети, и
 * класть его во временный ради разбора значило бы оставлять у себя копию
 * чужого документа (задача 3.13b). */
export async function readSheetsFromBuffer(bytes: Buffer): Promise<SheetReadResult> {
  // Приведение из-за собственных типов exceljs: их `Buffer` объявлен старой
  // формой, без параметра. Значение то же самое.
  return readWorkbook((workbook) => workbook.xlsx.load(bytes as unknown as ArrayBuffer))
}

async function readWorkbook(
  load: (workbook: import('exceljs').Workbook) => Promise<unknown>
): Promise<SheetReadResult> {
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.default.Workbook()

  try {
    await load(workbook)
  } catch (cause: unknown) {
    return { error: cause instanceof Error ? cause.message : String(cause), ok: false }
  }

  const sheets: SheetData[] = []

  workbook.eachSheet((worksheet) => {
    const rows: string[][] = []
    let truncated = false

    // `rowCount` у exceljs — последняя непустая строка; дыры внутри диапазона
    // приезжают пустыми, и это правильно: номер строки в ведомости значим, и
    // сжимать пропуски значило бы сдвинуть все номера.
    const rowLimit = Math.min(worksheet.rowCount, MAX_ROWS)
    if (worksheet.rowCount > MAX_ROWS) truncated = true

    for (let number = 1; number <= rowLimit; number += 1) {
      const row = worksheet.getRow(number)
      const width = Math.min(row.cellCount, MAX_COLUMNS)
      const cells: string[] = []
      for (let column = 1; column <= width; column += 1) {
        const cell = row.getCell(column)
        // Объединённая ячейка отдаёт значение хозяина из каждой своей клетки —
        // в простой сетке заголовок «Наименование» повторился бы трижды подряд
        // и выглядел бы как ошибка. Значение остаётся только в левой верхней.
        const slave = cell.isMerged && cell.master.address !== cell.address
        cells.push(slave ? '' : cellText(cell.value))
      }
      rows.push(cells)
    }

    sheets.push({
      name: worksheet.name,
      rows,
      totalRows: worksheet.rowCount,
      truncated
    })
  })

  if (sheets.length === 0) return { error: mainT('sheet.noSheets'), ok: false }
  return { ok: true, sheets }
}
