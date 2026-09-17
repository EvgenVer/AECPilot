// Проверка самой обвязки на mock-шлюзе (задача 3F.1): окно поднимается,
// проект открывается тем же путём, что у человека, образец vault собирается
// целиком, свидетельство пишется. Тесты без номера позиции — в отчёт не идут.

import { test, expect } from '@playwright/test'
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { hideFirstRunSurfaces, mainWindow, openProject, standFixture } from '../lib/app'
import { evidencePath, record } from '../lib/evidence'
import { addPdf, makeSampleVault, SAMPLE } from '../lib/vault'

const stand = standFixture({ mode: 'mock', label: 'blocks-00-stand' })

test('стенд: окно на mock-шлюзе поднимается и проект открывается', async () => {
  const page = await mainWindow(stand.get())
  await openProject(stand.get(), page)
  await hideFirstRunSurfaces(page)
  await expect(page.getByRole('textbox', { name: /Message|Сообщение/ })).toBeVisible()
})

test('образец vault собирается целиком, PDF печатается из Electron', async () => {
  const sample = await makeSampleVault()
  const pdf = await addPdf(stand.get().app, sample.sourceA)
  const expected = [
    SAMPLE.docx,
    SAMPLE.txt1251,
    SAMPLE.txtUtf8,
    SAMPLE.xlsx,
    SAMPLE.xlsxBig,
    SAMPLE.csv1251,
    SAMPLE.csvUtf8,
    SAMPLE.pdf,
    join(SAMPLE.brokenDir, 'битый.pdf'),
    join(SAMPLE.brokenDir, 'битый.docx'),
    join(SAMPLE.brokenDir, 'битый.xlsx'),
    join('подпапка', 'письмо.txt')
  ]
  for (const name of expected) {
    expect(existsSync(join(sample.sourceA, name)), `нет файла ${name}`).toBe(true)
  }
  expect(statSync(pdf).size).toBeGreaterThan(10000)
  expect(readFileSync(pdf).subarray(0, 5).toString()).toBe('%PDF-')
  // cp1251 — не UTF-8: та же строка в двух файлах даёт разные байты.
  const win1251 = readFileSync(join(sample.sourceA, SAMPLE.txt1251))
  const utf8 = readFileSync(join(sample.sourceA, SAMPLE.txtUtf8))
  expect(win1251.equals(utf8)).toBe(false)
  expect(utf8.toString('utf-8')).toContain(SAMPLE.txtLine)
  expect(existsSync(join(sample.vault, 'wiki', `${SAMPLE.wikiPage}.md`))).toBe(true)
  expect(existsSync(join(sample.sourceB, 'протокол.txt'))).toBe(true)
  rmSync(sample.root, { force: true, recursive: true })
})

// eslint-disable-next-line no-empty-pattern
test('0.0.1 свидетельство пишется со снимком и стенограммой', async ({}, testInfo) => {
  const page = await mainWindow(stand.get())
  await record(testInfo, page, { note: 'проверка обвязки', transcript: 'ход: нет' })
  const lines = readFileSync(evidencePath, 'utf-8')
    .split('\n')
    .filter((line) => line.trim() !== '')
  const mine = lines.map((line) => JSON.parse(line)).filter((entry) => entry.position === '0.0.1')
  expect(mine.length).toBeGreaterThan(0)
  expect(mine[0]).toMatchObject({ verdict: 'pass', transcript: 'ход: нет' })
  expect(mine[0].shot).toMatch(/^0\.0\.1(-\d+)?\.png$/)
})
