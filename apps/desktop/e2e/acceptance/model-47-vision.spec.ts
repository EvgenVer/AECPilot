// Блок 47 чек-листа (задача 3F.9) на ЖИВОМ ядре: зрение, картинки и видео.
// Чертёж и ролик — фикстуры `e2e/fixtures` (собраны один раз: план этажа с
// подписями помещений; красный квадрат, едущий слева направо, и надпись BETON).

import { copyFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import { hideFirstRunSurfaces, mainWindow, openProject, standFixture } from '../lib/app'
import { record } from '../lib/evidence'
import { eventCount, eventsSince, recordChatEvents, turn } from '../lib/turn'

test.describe.configure({ mode: 'serial' })

const stand = standFixture({ mode: 'live', label: 'model-47' })
const fixtures = join(__dirname, '..', 'fixtures')

let projectOpened = false

async function ui(): Promise<Page> {
  const page = await mainWindow(stand.get())
  await hideFirstRunSurfaces(page)
  if (!projectOpened) {
    for (const name of ['plan-1.png', 'red-square.mp4']) {
      copyFileSync(join(fixtures, name), join(stand.get().projectDir, name))
    }
    await openProject(stand.get(), page)
    projectOpened = true
  }
  await recordChatEvents(page)
  return page
}

test('47.1.1 агент отвечает по содержанию чертежа', async () => {
  const page = await ui()
  const result = await turn(
    page,
    'Посмотри на чертёж plan-1.png в папке проекта. Какие помещения на нём и какая у каждого площадь?',
    { expectTool: /vision|image|read_file/ }
  )
  console.log('47.1 ' + result.transcript)
  expect(result.text, 'названы помещения').toMatch(/кухн/i)
  expect(result.text).toMatch(/спальн/i)
  expect(result.text, 'названы площади').toMatch(/12/)
  expect(result.text).toMatch(/18/)
  await record(test.info(), page, { transcript: result.transcript })
})

// D-124: генерация картинок у ядра включается только ключом FAL или явно
// выбранным провайдером (`image_gen.provider`); ключ OpenAI сам платного
// провайдера не включает. У стенда нет ни того, ни другого — модель рисует
// скриптом. Выбор провайдера — решение владельца.
test.fixme('47.2.1 картинка сгенерирована и видна в ленте', async () => {
  const page = await ui()
  const mark = await eventCount(page)
  const result = await turn(
    page,
    'Сгенерируй картинку: эскиз фасада двухэтажного кирпичного дома. Сохрани её в папке проекта.',
    { expectTool: /image_generate|image/ }
  )
  console.log('47.2 ' + result.transcript)
  console.log(
    '47.2 RAW ' +
      JSON.stringify((await eventsSince(page, mark)).filter((e) => e.type === 'tool.complete')).slice(0, 1200)
  )
  expect(result.tools.join(','), 'вызвана генерация').toMatch(/image_generate/)
  const images = page.locator('[data-slot="aui_assistant-message-root"]').last().locator('img')
  await expect(images.first(), 'картинка видна в ленте').toBeVisible({ timeout: 30000 })
  await record(test.info(), page, { transcript: result.transcript })
})

// D-125: `video_analyze` вызывается, но модель стенда видео не принимает —
// агент честно отвечает отказом (предел записан в 3E.19). Модель для видео —
// решение владельца.
test.fixme('47.3.1 агент отвечает по содержанию видео', async () => {
  const page = await ui()
  const result = await turn(
    page,
    'Посмотри видео red-square.mp4 в папке проекта инструментом video_analyze. Что в нём происходит и какое слово написано в кадре?',
    // Модель может звать разбор видео из скрипта — подтверждается только то,
    // что касается этого ролика.
    { approve: /video_analyze|red-square/, expectTool: /video|execute_code/ }
  )
  console.log('47.3 ' + result.transcript)
  expect(result.tools.join(','), 'вызван разбор видео').toMatch(/video_analyze|execute_code/)
  expect(result.text, 'ответ по содержанию').toMatch(/красн|квадрат|BETON|бетон/i)
  await record(test.info(), page, { transcript: result.transcript })
})
