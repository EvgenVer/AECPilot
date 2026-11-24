// Блок 58 чек-листа (T59, UR49) на моке: диктовка глазами человека. Мок ничего не
// распознаёт — проверяется наш путь: без модели микрофон закрыт и открывается окно согласия;
// с моделью запись уходит ядру, текст встаёт в поле и сам не отправляется.
//
// Вместо микрофона Chromium читает файл (`--use-file-for-fake-audio-capture`), а разрешения
// решает наш главный процесс — флага, раздающего их самому (`--use-fake-ui-…`), здесь нет.
// За подставным шлюзом ядра этой установки нет, и стоят ли в нём пакеты распознавания, окно не
// спрашивает. Настоящее распознавание — `live-59-dictation`.

import { existsSync, mkdirSync, mkdtempSync, rmSync, truncateSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import { DICTATION_MARKER, DICTATION_MODEL, dictationModelDir } from '../../src/main/dictation-pure'
import { hideFirstRunSurfaces, mainWindow, openProject, standFixture } from '../lib/app'
import { record } from '../lib/evidence'

test.describe.configure({ mode: 'serial' })

const temp = mkdtempSync(join(tmpdir(), 'aec-e2e-dictation-'))
const wav = join(temp, 'tone.wav')

/** Two seconds of a tone, 16 kHz mono: enough for the recorder to have something to send. */
function writeTone(path: string): void {
  const samples = 32_000
  const data = Buffer.alloc(44 + samples * 2)
  data.write('RIFF', 0)
  data.writeUInt32LE(36 + samples * 2, 4)
  data.write('WAVEfmt ', 8)
  data.writeUInt32LE(16, 16)
  data.writeUInt16LE(1, 20)
  data.writeUInt16LE(1, 22)
  data.writeUInt32LE(16_000, 24)
  data.writeUInt32LE(32_000, 28)
  data.writeUInt16LE(2, 32)
  data.writeUInt16LE(16, 34)
  data.write('data', 36)
  data.writeUInt32LE(samples * 2, 40)
  for (let i = 0; i < samples; i += 1) {
    data.writeInt16LE(Math.round(Math.sin((i * 2 * Math.PI * 330) / 16_000) * 12_000), 44 + i * 2)
  }
  writeFileSync(path, data)
}
writeTone(wav)

const stand = standFixture({
  mode: 'mock',
  label: 'blocks-58',
  args: ['--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav}`]
})

test.afterAll(() => rmSync(temp, { recursive: true, force: true }))

let projectOpened = false

async function ui(): Promise<Page> {
  const page = await mainWindow(stand.get())
  await hideFirstRunSurfaces(page)
  if (!projectOpened) {
    await openProject(stand.get(), page)
    projectOpened = true
  }
  return page
}

function profileDir(): string {
  const dir = stand.get().profileDir
  if (!dir) throw new Error('the stand has no profile copy')
  return dir
}

const microphone = (page: Page) =>
  page.getByRole('button', { name: /^(Voice dictation|Голосовая диктовка)$/ }).first()

/** A press on the page without a person: what a script of the window could do by itself. */
async function openMicrophone(page: Page): Promise<string> {
  return page.evaluate(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((track) => track.stop())
      return 'opened'
    } catch (error) {
      return error instanceof DOMException ? error.name : String(error)
    }
  })
}

/** The model folder as a finished download leaves it: sizes and the marker, no contents. */
function installModel(): void {
  const dir = dictationModelDir(profileDir())
  mkdirSync(dir, { recursive: true })
  for (const file of DICTATION_MODEL.files) {
    writeFileSync(join(dir, file.name), '')
    truncateSync(join(dir, file.name), file.size)
  }
  writeFileSync(
    join(dir, DICTATION_MARKER),
    JSON.stringify({
      id: DICTATION_MODEL.id,
      revision: DICTATION_MODEL.revision,
      files: DICTATION_MODEL.files.map(({ name, size }) => ({ name, size }))
    })
  )
}

test('58.1 без модели кнопка микрофона открывает согласие, а не микрофон', async () => {
  const page = await ui()
  await microphone(page).click()
  const dialog = page.getByTestId('dictation-dialog')
  await expect(dialog).toBeVisible({ timeout: 60_000 })
  await expect(page.getByTestId('dictation-download')).toBeVisible()
  await expect(dialog).toContainText(DICTATION_MODEL.repo)
  await expect(dialog).toContainText('Hugging Face')
  await record(test.info(), page)
  expect(await openMicrophone(page)).toBe('NotAllowedError')
  await page.getByTestId('dictation-close').click()
  await expect(dialog).toHaveCount(0)
  expect(existsSync(dictationModelDir(profileDir())), '«Не скачивать» не качает').toBe(false)
  expect(stand.get().mockOutput()).not.toContain('/api/audio/')
})

/** What the mock's core answers about its recogniser: main asks before every recording. */
async function coreSays(stt: unknown): Promise<void> {
  await fetch(`http://127.0.0.1:${stand.get().restPort}/api/_mock/stt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(stt)
  })
}

test('58.2 ядро собралось распознавать в облаке — микрофон закрыт, окно говорит почему', async () => {
  installModel()
  await coreSays({ enabled: true, provider: 'groq' })
  const page = await ui()
  await microphone(page).click()
  await expect(page.getByTestId('dictation-error')).toBeVisible({ timeout: 20_000 })
  await record(test.info(), page)
  await page.getByTestId('dictation-close').click()
  expect(await openMicrophone(page)).toBe('NotAllowedError')
})

test('58.3 модель на месте: речь становится текстом в поле и сама не отправляется', async () => {
  await coreSays({
    enabled: true,
    provider: 'local',
    local: { model: dictationModelDir(profileDir()) }
  })
  const page = await ui()
  const sent = (): number => stand.get().mockOutput().split('MOCK_RPC prompt.submit').length
  const before = sent()

  await microphone(page).click()
  const stop = page.getByRole('button', { name: /^(Stop dictation|Остановить диктовку)$/ }).first()
  await expect(stop).toBeVisible({ timeout: 20_000 })
  await record(test.info(), page)
  await page.waitForTimeout(2000)
  await stop.click()

  const line = await stand.get().waitForMockLine(/^MOCK_AUDIO /)
  expect(line).toMatch(/data:audio\/webm/)
  expect(Number(/chars=(\d+)/.exec(line)?.[1])).toBeGreaterThan(5000)
  await expect(
    page.locator('[data-slot="composer-rich-input"], [contenteditable="true"]').first()
  ).toContainText('Проверить узел опирания плиты', { timeout: 20_000 })
  expect(sent(), 'диктовка не отправляет сообщение').toBe(before)
  await record(test.info(), page)
})

test('58.4 микрофон отпущен: без нового нажатия страница его не получает', async () => {
  const page = await ui()
  await page.waitForTimeout(11_000)
  expect(await openMicrophone(page)).toBe('NotAllowedError')
  // Модель на месте, ядро местное — не хватает только нажатия. Вызов Playwright сам считается
  // нажатием, поэтому страница ждёт, пока оно истечёт.
  const asked = await page.evaluate(async () => {
    await new Promise((resolve) => setTimeout(resolve, 7000))
    return { active: navigator.userActivation.isActive, granted: await window.aecpilot.requestMicrophone() }
  })
  expect(asked).toEqual({ active: false, granted: false })
})

test('58.5 палитра: окно диктовки показывает модель и даёт её удалить', async () => {
  const page = await ui()
  await page.keyboard.press('Control+k')
  const palette = page.getByRole('dialog').last()
  await expect(palette).toBeVisible()
  await page.keyboard.type('диктовка')
  const row = palette.getByRole('option', {
    name: /Dictation: recognition model|Диктовка: модель распознавания/
  })
  await expect(row).toHaveAttribute('data-selected', 'true')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('dictation-installed')).toBeVisible()
  await page.getByTestId('dictation-remove').click()
  await expect(page.getByTestId('dictation-download')).toBeVisible()
  expect(existsSync(dictationModelDir(profileDir()))).toBe(false)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('dictation-dialog')).toHaveCount(0)
})
