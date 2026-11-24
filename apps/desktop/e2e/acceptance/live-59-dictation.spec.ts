// Задача T59 (UR49) на ЖИВОМ ядре: запись владельца вместо микрофона → распознавание
// faster-whisper в процессе ядра → текст в поле сообщения. Сообщение не отправляется,
// модель агента не вызывается — прогон бесплатный.
//
// `AEC_E2E_DICTATION_MODEL` — папка с файлами модели (её скачала программа или T58): в
// профиль прогона она встаёт так же, как после «Скачать и включить». Сеть для ядра закрыта
// заведомо мёртвым прокси: распознавание обязано работать без неё.
//
// Живой микрофон здесь НЕ проверяется: Chromium читает файл. Это делает человек (блок 58).

import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

import { DICTATION_MARKER, DICTATION_MODEL, dictationModelDir } from '../../src/main/dictation-pure'
import { hideFirstRunSurfaces, mainWindow, openProject, repoRoot, standFixture } from '../lib/app'
import { record } from '../lib/evidence'

const model = process.env.AEC_E2E_DICTATION_MODEL
const sample = join(repoRoot, 'eval', 'samples', 'dictation', '3.m4a')
const ready = !!model && existsSync(join(model, 'model.bin')) && existsSync(sample)

const temp = mkdtempSync(join(tmpdir(), 'aec-e2e-dictation-live-'))
const wav = join(temp, 'phrase.wav')
if (ready) {
  execFileSync(join(repoRoot, 'runtime', '.hermes-venv', 'Scripts', 'python.exe'), [
    '-c',
    'import sys, wave, numpy as np\n' +
      'from faster_whisper.audio import decode_audio\n' +
      'audio = decode_audio(sys.argv[1], sampling_rate=16000)\n' +
      'out = wave.open(sys.argv[2], "wb")\n' +
      'out.setnchannels(1); out.setsampwidth(2); out.setframerate(16000)\n' +
      'out.writeframes((np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes())\n' +
      'out.close()\n',
    sample,
    wav
  ])
}

const stand = standFixture({
  mode: 'live',
  label: 'live-59',
  env: {
    HTTPS_PROXY: 'http://127.0.0.1:9',
    HTTP_PROXY: 'http://127.0.0.1:9',
    NO_PROXY: '127.0.0.1,localhost'
  },
  args: ['--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav}%noloop`]
})

test.afterAll(() => rmSync(temp, { recursive: true, force: true }))

test('T59 фраза инженера: из записи — в поле сообщения, без сети и без отправки', async () => {
  test.skip(!ready, 'нет модели (AEC_E2E_DICTATION_MODEL) или записей владельца')
  test.setTimeout(5 * 60_000)
  const profile = stand.get().profileDir as string
  const dir = dictationModelDir(profile)
  mkdirSync(dir, { recursive: true })
  for (const file of DICTATION_MODEL.files) {
    const from = join(model as string, file.name)
    try {
      linkSync(from, join(dir, file.name))
    } catch {
      copyFileSync(from, join(dir, file.name))
    }
  }
  writeFileSync(
    join(dir, DICTATION_MARKER),
    JSON.stringify({
      id: DICTATION_MODEL.id,
      revision: DICTATION_MODEL.revision,
      files: DICTATION_MODEL.files.map(({ name, size }) => ({ name, size }))
    })
  )

  const page = await mainWindow(stand.get())
  await hideFirstRunSurfaces(page)
  await openProject(stand.get(), page)
  await page.getByRole('button', { name: 'Голосовая диктовка' }).first().click()
  const stop = page.getByRole('button', { name: 'Остановить диктовку' }).first()
  await expect(stop).toBeVisible({ timeout: 60_000 })
  await page.waitForTimeout(8000)
  await record(test.info(), page)
  const pressed = Date.now()
  await stop.click()

  const composer = page.locator('[contenteditable="true"]').first()
  await expect(composer).toContainText(/защитн/i, { timeout: 120_000 })
  const seconds = (Date.now() - pressed) / 1000
  const text = (await composer.innerText()).trim()
  console.log(`[live-59] ${seconds.toFixed(1)} с: ${text}`)
  expect(text).toMatch(/50|пятьдесят/i)
  expect(text).toMatch(/плит/i)
  const config = readFileSync(join(profile, 'config.yaml'), 'utf-8')
  expect(config).toMatch(/provider: "?local"?/)
  await record(test.info(), page)
})
