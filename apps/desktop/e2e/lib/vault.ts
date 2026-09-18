// Образец проекта для автоприёмки (задача 3F.1). Одна папка на прогон:
//
//   <root>/vault/         — папка проекта (createProject сюда): заметки с
//                           wikilinks и одна готовая страница вики
//   <root>/source-a/      — документы, которые подключаются источником:
//                           DOCX/TXT (python), XLSX/CSV/PDF и битые (здесь)
//   <root>/source-b/      — второй, независимый источник
//
// DOCX и TXT в cp1251 делает `fixtures/make_vault.py` (python-docx уже стоит);
// XLSX — exceljs, потому что у формулы нужно ЗАКЭШИРОВАННОЕ значение, как в
// файле из Excel, а openpyxl его не пишет; PDF печатается из самого Electron —
// единственный способ получить кириллицу в PDF без новой зависимости.

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as ExcelJS from 'exceljs'
import type { ElectronApplication } from '@playwright/test'

const desktopDir = join(__dirname, '..', '..')
const repoRoot = join(desktopDir, '..', '..')
const rootPython = join(repoRoot, '.venv', 'Scripts', 'python.exe')

export interface SampleVault {
  root: string
  vault: string
  sourceA: string
  sourceB: string
}

/** Что лежит в образце — имена и опорные строки для проверок. */
export const SAMPLE = {
  docx: 'ПЗ.docx',
  docxSection: 'Кабельный журнал',
  txt1251: 'заметка-1251.txt',
  txtUtf8: 'заметка-utf8.txt',
  txtLine: 'Кабель ВВГнг-LS 3х2,5 — прокладка в лотке',
  xlsx: 'ведомость.xlsx',
  xlsxSheet: 'Ведомость',
  xlsxSecondSheet: 'Спецификация',
  xlsxMergedHeader: 'Ведомость кабелей',
  xlsxDate: '2026-08-17',
  xlsxFormulaValue: 24,
  xlsxBig: 'большая.xlsx',
  xlsxBigRows: 20001,
  csv1251: 'нагрузки.csv',
  csvUtf8: 'список.csv',
  pdf: 'отчёт.pdf',
  pdfPages: 17,
  /** Строка на странице 7 — цель ссылки «на место». */
  pdfPage7Line: 'Расчётная нагрузка щита ЩС-1 составляет 42 кВт',
  /** Фраза на странице 5, разорванная переносом строки (блок 16, позиция 13). */
  pdfSplitPhrase: 'СП 20.13330 нагрузки',
  brokenDir: 'битые',
  wikiPage: 'ТП-1',
  notes: 'заметки.md',
  sourceMd: 'README.md'
} as const

async function makeXlsx(folder: string): Promise<void> {
  const book = new ExcelJS.Workbook()
  const sheet = book.addWorksheet(SAMPLE.xlsxSheet)
  sheet.mergeCells('A1:C1')
  sheet.getCell('A1').value = SAMPLE.xlsxMergedHeader
  sheet.addRow(['Маркировка', 'Длина, м', 'Дата'])
  sheet.addRow(['Л-1', 12, new Date(Date.UTC(2026, 7, 17))])
  sheet.addRow(['Л-2', 20, new Date(Date.UTC(2026, 7, 18))])
  sheet.addRow(['Итого', { formula: 'B3+B4', result: 32 }, null])
  // C5 — цель ссылки «Ведомость!C5» (блок 19): формула со значением.
  sheet.getCell('C5').value = { formula: 'B4+4', result: SAMPLE.xlsxFormulaValue }
  sheet.getColumn(3).numFmt = 'yyyy-mm-dd'
  const second = book.addWorksheet(SAMPLE.xlsxSecondSheet)
  second.addRow(['Позиция', 'Кол-во'])
  second.addRow(['Автомат 16 А', 4])
  await book.xlsx.writeFile(join(folder, SAMPLE.xlsx))

  const big = new ExcelJS.Workbook()
  const rows = big.addWorksheet('Данные')
  rows.addRow(['№', 'Значение', 'Примечание'])
  for (let i = 1; i <= SAMPLE.xlsxBigRows; i += 1) {
    rows.addRow([i, i * 1.5, `строка ${i}`])
  }
  await big.xlsx.writeFile(join(folder, SAMPLE.xlsxBig))
}

function makeCsvUtf8(folder: string): void {
  const rows = ['Позиция,Кол-во,Ед.', 'Автомат 16 А,4,шт', 'Кабель ВВГнг-LS 3х2.5,120,м']
  writeFileSync(join(folder, SAMPLE.csvUtf8), rows.join('\n') + '\n', 'utf-8')
}

function makeBroken(folder: string): void {
  const dir = join(folder, SAMPLE.brokenDir)
  mkdirSync(dir, { recursive: true })
  const junk = Buffer.from('это не документ, а мусор в файле с чужим расширением\n'.repeat(40))
  for (const name of ['битый.pdf', 'битый.docx', 'битый.xlsx']) {
    writeFileSync(join(dir, name), junk)
  }
}

function makeVaultFiles(vault: string): void {
  mkdirSync(join(vault, 'notes'), { recursive: true })
  mkdirSync(join(vault, 'wiki'), { recursive: true })
  writeFileSync(
    join(vault, 'notes', SAMPLE.notes),
    [
      '# Заметки',
      '',
      `Питание от [[${SAMPLE.wikiPage}]], резерв — [[трансформаторная|${SAMPLE.wikiPage}]].`,
      '',
      '- первый пункт',
      '- второй пункт',
      '',
      '| Линия | Длина |',
      '|---|---|',
      '| Л-1 | 12 м |',
      ''
    ].join('\n'),
    'utf-8'
  )
  writeFileSync(
    join(vault, 'wiki', `${SAMPLE.wikiPage}.md`),
    `# ${SAMPLE.wikiPage}\n\nТрансформаторная подстанция 2х630 кВА.\n`,
    'utf-8'
  )
}

/** Собрать образец: папка проекта, два источника, документы всех типов
 *  (кроме PDF — см. `addPdf`, ему нужно окно приложения). */
export async function makeSampleVault(): Promise<SampleVault> {
  const root = mkdtempSync(join(tmpdir(), 'aecpilot-sample-'))
  const vault = join(root, 'vault')
  const sourceA = join(root, 'source-a')
  const sourceB = join(root, 'source-b')
  mkdirSync(vault, { recursive: true })
  mkdirSync(sourceA, { recursive: true })
  mkdirSync(sourceB, { recursive: true })

  const out = execFileSync(
    rootPython,
    [join(desktopDir, 'e2e', 'fixtures', 'make_vault.py'), sourceA],
    {
      encoding: 'utf8',
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    }
  )
  if (!out.includes('VAULT_PY_OK')) throw new Error(`make_vault.py не отчитался: ${out}`)

  await makeXlsx(sourceA)
  makeCsvUtf8(sourceA)
  makeBroken(sourceA)
  makeVaultFiles(vault)
  writeFileSync(join(sourceB, 'протокол.txt'), 'Протокол совещания: решений нет.\n', 'utf-8')
  // .md В ИСТОЧНИКЕ: открывается на чтение, а не в редакторе (блок 20, шаг 7).
  writeFileSync(
    join(sourceA, SAMPLE.sourceMd),
    '# Описание источника\n\nПапка с документами проекта.\n',
    'utf-8'
  )

  return { root, vault, sourceA, sourceB }
}

function pdfHtml(): string {
  const pages: string[] = []
  for (let n = 1; n <= SAMPLE.pdfPages; n += 1) {
    const body: string[] = [`<h1>Страница ${n}</h1>`]
    body.push(`<p>Отчёт по расчёту нагрузок, лист ${n} из ${SAMPLE.pdfPages}.</p>`)
    if (n === 3) body.push('<p>Ведомость кабелей приведена в приложении.</p>')
    if (n === 5) {
      const [head, tail] = [SAMPLE.pdfSplitPhrase.slice(0, 11), SAMPLE.pdfSplitPhrase.slice(12)]
      body.push(`<p>Расчёт выполнен по ${head}<br>${tail} и воздействия.</p>`)
    }
    if (n === 7) body.push(`<p>${SAMPLE.pdfPage7Line}.</p>`)
    for (let k = 0; k < 6; k += 1) {
      body.push(`<p>Строка ${k + 1} листа ${n}: нагрузка группы ${k + 1} принята по заданию.</p>`)
    }
    pages.push(`<section style="page-break-after: always">${body.join('')}</section>`)
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;font-size:12pt}</style></head><body>${pages.join('')}</body></html>`
}

/** Напечатать `отчёт.pdf` (17 страниц) из скрытого окна Electron — кириллица
 *  в PDF без новой зависимости. Возвращает путь к файлу. */
export async function addPdf(app: ElectronApplication, folder: string): Promise<string> {
  const out = join(folder, SAMPLE.pdf)
  // Байты возвращаются base64: у главного процесса в `evaluate` нет `require`,
  // а файл пишет и так процесс тестов.
  const base64 = await app.evaluate(async ({ BrowserWindow }, html) => {
    const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
    try {
      await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
      const data = await win.webContents.printToPDF({ pageSize: 'A4' })
      return data.toString('base64')
    } finally {
      win.destroy()
    }
  }, pdfHtml())
  writeFileSync(out, Buffer.from(base64, 'base64'))
  return out
}
