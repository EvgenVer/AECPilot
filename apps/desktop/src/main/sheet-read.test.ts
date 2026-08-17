// Задача 4.3. Книга собирается тем же exceljs и тут же читается обратно —
// круговорот проверяет ровно то, из-за чего таблица выглядит неправильно:
// дата, приехавшая числом, формула вместо своего значения и объединённый
// заголовок, повторённый в каждой своей клетке.

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { Workbook } from 'exceljs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { readSheets } from './sheet-read'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aecpilot-sheet-'))
})

afterEach(() => {
  fs.rmSync(dir, { force: true, recursive: true })
})

async function writeWorkbook(build: (workbook: Workbook) => void): Promise<string> {
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.default.Workbook()
  build(workbook)
  const file = path.join(dir, 'книга.xlsx')
  await workbook.xlsx.writeFile(file)
  return file
}

describe('чтение книги', () => {
  it('отдаёт строки листа как текст', async () => {
    const file = await writeWorkbook((workbook) => {
      const sheet = workbook.addWorksheet('Кабели')
      sheet.addRow(['Марка', 'Сечение'])
      sheet.addRow(['ВВГнг', 2.5])
    })

    const result = await readSheets(file)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.sheets[0].name).toBe('Кабели')
    expect(result.sheets[0].rows).toEqual([
      ['Марка', 'Сечение'],
      ['ВВГнг', '2.5']
    ])
  })

  it('дата показывается датой, а не числом', async () => {
    const file = await writeWorkbook((workbook) => {
      workbook.addWorksheet('Лист').addRow([new Date(Date.UTC(2026, 7, 17))])
    })

    const result = await readSheets(file)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // В файле это число 46251; показать его человеку значит показать не то,
    // что он видит в Excel.
    expect(result.sheets[0].rows[0][0]).toBe('2026-08-17')
  })

  it('у формулы показывается её значение', async () => {
    const file = await writeWorkbook((workbook) => {
      const sheet = workbook.addWorksheet('Лист')
      sheet.addRow([2, 3])
      sheet.getCell('C1').value = { formula: 'A1+B1', result: 5 }
    })

    const result = await readSheets(file)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // Сверяют цитату, а не пересчитывают книгу: «=A1+B1» тут бесполезно.
    expect(result.sheets[0].rows[0][2]).toBe('5')
  })

  it('объединённый заголовок стоит один раз, а не в каждой клетке', async () => {
    const file = await writeWorkbook((workbook) => {
      const sheet = workbook.addWorksheet('Лист')
      sheet.addRow(['Наименование', '', ''])
      sheet.mergeCells('A1:C1')
    })

    const result = await readSheets(file)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.sheets[0].rows[0]).toEqual(['Наименование', '', ''])
  })

  it('все листы книги приезжают по порядку', async () => {
    const file = await writeWorkbook((workbook) => {
      workbook.addWorksheet('ЭОМ').addRow(['а'])
      workbook.addWorksheet('ОВ').addRow(['б'])
    })

    const result = await readSheets(file)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.sheets.map((sheet) => sheet.name)).toEqual(['ЭОМ', 'ОВ'])
  })

  it('битый файл даёт ошибку, а не падение', async () => {
    const file = path.join(dir, 'битая.xlsx')
    fs.writeFileSync(file, 'это не книга')

    const result = await readSheets(file)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.length).toBeGreaterThan(0)
  })
})
