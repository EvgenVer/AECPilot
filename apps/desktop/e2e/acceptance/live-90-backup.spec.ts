// Task T90 (UR57) on the live stand: the agent backup to a file, as a person does it — Settings ▸
// «Резервная копия» ▸ «Сохранить…», then Save As. The real core writes the archive into the
// temporary profile; the main process copies it where the dialog says and removes it from the
// profile. The Save As dialog is stubbed in the main process (the only part a test cannot
// click). No model calls: free.

import { test, expect } from '@playwright/test'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mainWindow, openProject, standFixture } from '../lib/app'

const stand = standFixture({ mode: 'live', label: 'live-90-backup' })
const outDir = mkdtempSync(join(tmpdir(), 'aec-t90-saved-'))

test.afterAll(() => rmSync(outDir, { recursive: true, force: true }))

async function stubSaveDialog(target: string | null): Promise<void> {
  await stand.get().app.evaluate(({ dialog }, canned) => {
    dialog.showSaveDialog = (async () =>
      canned === null
        ? { canceled: true, filePath: undefined }
        : { canceled: false, filePath: canned }) as never
  }, target)
}

function archivesLeft(): string[] {
  const folder = join(stand.get().profileDir!, 'backups')
  return existsSync(folder) ? readdirSync(folder).filter((name) => name.endsWith('.zip')) : []
}

let projectOpen = false

async function openBackup() {
  const current = stand.get()
  const page = await mainWindow(current)
  if (!projectOpen) {
    await openProject(current, page)
    projectOpen = true
  }
  await page.evaluate(() => {
    location.hash = '#/settings?tab=backup'
  })
  await expect(page.getByRole('button', { name: 'Сохранить…' })).toBeVisible({ timeout: 30000 })
  return page
}

test('«Сохранить…» кладёт копию агента в выбранный файл и убирает архив из профиля', async () => {
  const target = join(outDir, 'agent.zip')
  await stubSaveDialog(target)
  const page = await openBackup()

  await page.getByRole('button', { name: 'Сохранить…' }).click()
  await expect(page.getByText('Файл сохранён.')).toBeVisible({ timeout: 180000 })

  expect(existsSync(target)).toBe(true)
  // A zip starts with "PK"; the archive is the profile, so it is far from empty.
  const bytes = readFileSync(target)
  expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK')
  expect(bytes.length).toBeGreaterThan(100_000)
  expect(archivesLeft()).toEqual([])
})

test('отмена окна «Сохранить как»: файла нет, архив из профиля тоже убран', async () => {
  await stubSaveDialog(null)
  const page = await openBackup()

  await page.getByRole('button', { name: 'Сохранить…' }).click()
  // The button comes back once the backup and the dialog are over.
  await expect(page.getByRole('button', { name: 'Сохранить…' })).toBeEnabled({ timeout: 180000 })
  await expect.poll(archivesLeft, { timeout: 15000 }).toEqual([])
  await expect(page.getByText('Файл сохранён.')).toHaveCount(0)
})
