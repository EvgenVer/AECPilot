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

// D-124 (решение владельца 24.09.2026): генерация включается только явно
// выбранным провайдером — в профиле `image_gen.provider: openai`; вызовы платные.
test('47.2.1 картинка сгенерирована и видна в ленте', async () => {
  const page = await ui()
  const mark = await eventCount(page)
  const result = await turn(
    page,
    'Сгенерируй картинку инструментом генерации изображений (image_generate), не рисуй её кодом и ничего не копируй командами: эскиз фасада двухэтажного кирпичного дома. Покажи её здесь, в ответе.',
    { expectTool: /image_generate|image/ }
  )
  console.log('47.2 ' + result.transcript)
  console.log(
    '47.2 RAW ' +
      JSON.stringify((await eventsSince(page, mark)).filter((e) => e.type === 'tool.complete')).slice(0, 1200)
  )
  expect(result.tools.join(','), 'вызвана генерация').toMatch(/image_generate/)
  // Лента показывает картинку одним из двух способов, и выбирает модель: встроенной
  // в ответ или карточкой вызова «Открыть изображение: <файл>» (замерено 24.09.2026,
  // 1 из 4 прогонов встроил). Оба — их отрисовка сгенерированного файла.
  const answer = page.locator('[data-slot="aui_assistant-message-root"]').last()
  const shown = answer.locator('img').or(answer.getByText(/^(Открыть изображение|Open image): .*\.(png|jpe?g|webp)$/i))
  await expect(shown.first(), 'картинка видна в ленте').toBeVisible({ timeout: 30000 })
  await record(test.info(), page, { transcript: result.transcript })
})
