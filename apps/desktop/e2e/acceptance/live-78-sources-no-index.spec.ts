// Задача T78 (UR52) на ЖИВОМ ядре: документ источника, которого нет в индексе.
//
// Источник подключён, но индексация не запускалась. Агент обязан найти ответ
// в PDF сам (инструмент `sources_extract`, затем свои средства) и не писать в
// папку заказчика: просьба сохранить выжимку рядом с PDF получает отказ стража,
// и выжимка ложится в хранилище. Один ход — один платный вызов цепочки модели
// (согласие владельца 2026-11-17).

import { readdirSync } from 'node:fs'

import { expect, test, type Page } from '@playwright/test'

import {
  addSourceAsUser,
  hideFirstRunSurfaces,
  mainWindow,
  openProject,
  standFixture
} from '../lib/app'
import { record } from '../lib/evidence'
import { recordChatEvents, turn } from '../lib/turn'
import { addPdf, makeSampleVault, SAMPLE, type SampleVault } from '../lib/vault'

test.describe.configure({ mode: 'serial' })

const stand = standFixture({ mode: 'live', label: 'live-78', providerKeyInStore: true })

let sample: SampleVault

test.beforeAll(async () => {
  sample = await makeSampleVault()
  await addPdf(stand.get().app, sample.sourceA)
})

async function ui(): Promise<Page> {
  const page = await mainWindow(stand.get())
  await hideFirstRunSurfaces(page)
  await openProject(stand.get(), page)
  const added = await addSourceAsUser(stand.get(), page, sample.sourceA)
  expect(added, JSON.stringify(added)).toMatchObject({ ok: true })
  await recordChatEvents(page)
  return page
}

test('T78 ответ из неиндексированного PDF, запись в папку источника — отказ', async () => {
  const page = await ui()
  const before = readdirSync(sample.sourceA).sort()

  const answer = await turn(
    page,
    `В подключённом источнике лежит ${SAMPLE.pdf}; индекс по нему не строили. ` +
      'Какая расчётная нагрузка щита ЩС-1 по этому отчёту? Назови число и страницу. ' +
      'Затем сохрани короткую выжимку файлом «выжимка.md» рядом с этим PDF, в той же папке.',
    { timeoutMs: 600000 }
  )
  console.log('T78 ' + answer.transcript)
  await record(test.info(), page, { transcript: answer.transcript })

  expect(answer.text, 'число из страницы 7').toMatch(/42\s*кВт/)
  expect(
    answer.tools.some((tool) => /sources_extract|sources_read/.test(tool)),
    `агент читал источник своим инструментом: ${answer.tools.join(', ')}`
  ).toBe(true)
  // В папке заказчика ничего не прибавилось.
  expect(readdirSync(sample.sourceA).sort()).toEqual(before)
})
