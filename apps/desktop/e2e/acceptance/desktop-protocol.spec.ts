// Протокол рабочего стола (задача 3F.12): позиции, чью ОС-половину спеки
// приёмки подменяют ради чистоты машины, — здесь без подмены. Приёмка
// перехватывает `shell.showItemInFolder` и `dialog.showSaveDialog` (иначе на
// экране оставались бы окна проводника и модальные диалоги) и проверяет, ЧТО
// и С ЧЕМ зовут. Настоящее окно ОС видит только ОС: проводник — через
// Shell.Application (папка и выделенный файл), диалог — через UI Automation
// (заголовок и имя в поле), тема — через `nativeTheme` главного процесса.
// Каждая позиция кладёт снимок ВСЕГО экрана в свою строку отчёта
// (`e2e/lib/desktop-shot.ps1`). За собой убирает: окно проводника
// закрывается, диалог — «Отменой».
//
// Отдельный проект `desktop`: открывает настоящие окна на экране человека,
// поэтому в гейт `pnpm e2e` не входит; гоняется в прогоне приёмки 3F.14 (см.
// `docs/acceptance/desktop-protocol.md`). На запертом экране позиции
// пропускаются с причиной — окна ОС там накрыты экраном блокировки.

import { expect, test, type Locator, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  clearNotifications,
  desktopDir,
  hideFirstRunSurfaces,
  mainWindow,
  openProject,
  reviveStrandedSession,
  standFixture
} from '../lib/app'

test.describe.configure({ mode: 'serial' })

const stand = standFixture({ mode: 'mock', label: 'desktop-protocol' })

const LIB = join(desktopDir, 'e2e', 'lib')
const SPEC = 'acceptance/desktop-protocol.spec.ts'
const NOTE_FILE = 'заметка-проводник.md'

/** Красный квадрат 64×64 — вложение для лупы (как в позиции 26.1.1). */
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAT0lEQVR42u3PQQkAAAgEsItz/VMYywi+hcEKLNO+FgEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQGBywLvDoEAVSaz4wAAAABJRU5ErkJggg=='

function ps(
  script: string,
  args: Record<string, string | number | boolean>
): Record<string, unknown> {
  const flat: string[] = []
  for (const [key, value] of Object.entries(args)) {
    if (value === true) flat.push(`-${key}`)
    else if (value !== false) flat.push(`-${key}`, String(value))
  }
  const out = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(LIB, script), ...flat],
    { encoding: 'utf8', windowsHide: true }
  )
  return JSON.parse(out.trim().split(/\r?\n/).pop() ?? '{}') as Record<string, unknown>
}

/** Снимок всего экрана в строку позиции (см. шапку `desktop-shot.ps1`). */
function desktopShot(position: string, note?: string): void {
  ps('desktop-shot.ps1', {
    Action: 'shot',
    Position: position,
    Spec: SPEC,
    ...(note ? { Note: note } : {})
  })
}

function locked(): boolean {
  return ps('desktop-probe.ps1', { Action: 'desktop' }).locked === true
}

const LOCKED_REASON =
  'экран заперт: окна ОС накрыты экраном блокировки — прогнать при разблокированном экране'

interface ExplorerWindow {
  folder: string
  selected: string[]
}

function explorerWindows(close?: string): ExplorerWindow[] {
  return ps('desktop-shot.ps1', { Action: 'explorer', ...(close ? { Close: close } : {}) })
    .windows as ExplorerWindow[]
}

interface NativeDialog {
  title: string
  fileName: string
}

async function mainPid(): Promise<number> {
  return stand.get().app.evaluate(() => process.pid)
}

async function dialogs(cancel = false): Promise<NativeDialog[]> {
  return ps('desktop-shot.ps1', { Action: 'dialog', Pid2: await mainPid(), Cancel: cancel })
    .dialogs as NativeDialog[]
}

let projectCreated = false

async function ui(): Promise<Page> {
  const page = await mainWindow(stand.get())
  await hideFirstRunSurfaces(page)
  if (!projectCreated) {
    mkdirSync(join(stand.get().projectDir, 'notes'), { recursive: true })
    writeFileSync(join(stand.get().projectDir, 'notes', NOTE_FILE), '# для проводника\n', 'utf-8')
    await openProject(stand.get(), page)
    projectCreated = true
  }
  await reviveStrandedSession(page)
  return page
}

function attr(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function row(page: Page, title: string): Locator {
  return page.locator('div.group').filter({ has: page.locator(`[title=${attr(title)}]`) })
}

test('3.6.1 «Показать в проводнике»: настоящий проводник открыт на папке и выделил файл', async () => {
  test.skip(locked(), LOCKED_REASON)
  const page = await ui()
  const vaultTab = page.getByRole('tab', { name: /Vault/ })
  await expect(vaultTab).toBeVisible({ timeout: 30000 })
  if ((await vaultTab.getAttribute('aria-selected')) !== 'true') await vaultTab.click()

  await row(page, 'notes').locator(`[title="notes"]`).click()
  const file = row(page, `notes/${NOTE_FILE}`)
  await expect(file).toBeVisible({ timeout: 30000 })
  await file.hover()
  await file.getByRole('button', { name: /^(Show in Explorer|Показать в проводнике)$/ }).click()

  const folder = join(stand.get().projectDir, 'notes')
  const onFolder = (): ExplorerWindow | undefined =>
    explorerWindows().find((window) => window.folder.toLowerCase() === folder.toLowerCase())
  await expect
    .poll(() => onFolder()?.selected ?? [], {
      timeout: 20000,
      message: 'окно проводника на папке файла, файл выделен'
    })
    .toContain(join(folder, NOTE_FILE))
  await page.waitForTimeout(800)
  desktopShot('3.6.1')
  explorerWindows(folder)
})

test('9.3.1 тёмная тема красит и системные элементы окна', async () => {
  test.skip(locked(), LOCKED_REASON)
  const page = await ui()
  await page.evaluate(() => {
    location.hash = '#/settings?tab=config:appearance&page=theme'
  })
  await page.getByRole('button', { name: 'Тёмная' }).click()
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme))
    .toBe('dark')
  // Полосы прокрутки и рамку окна рисует не страница, а Chromium и ОС по
  // теме главного процесса.
  await expect
    .poll(() => stand.get().app.evaluate(({ nativeTheme }) => nativeTheme.shouldUseDarkColors))
    .toBe(true)
  await page.waitForTimeout(800)
  desktopShot('9.3.1', 'тёмная тема, весь экран: полосы прокрутки и рамка окна тёмные')

  await page.getByRole('button', { name: 'Системная' }).click()
  await page.evaluate(() => {
    location.hash = '#/'
  })
})

test('26.2.1 лупа вложения: «Скачать» открывает НАТИВНЫЙ диалог сохранения', async () => {
  test.skip(locked(), LOCKED_REASON)
  const page = await ui()
  await clearNotifications(page)
  const composer = await reviveStrandedSession(page)
  await composer.evaluate((el, png) => {
    const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0))
    const data = new DataTransfer()
    data.items.add(new File([bytes], 'clip.png', { type: 'image/png' }))
    el.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
    )
  }, PNG)
  const attachment = page
    .locator('[data-slot="composer-attachments"]')
    .getByRole('button', { name: /^(Предпросмотр|Preview) .*\.png$/ })
  await expect(attachment).toBeVisible({ timeout: 30000 })
  await attachment.click()
  const lightbox = page.getByRole('dialog').last()
  await expect(lightbox.locator('img')).toBeVisible({ timeout: 15000 })
  // Нажатие не ждём: модальный диалог держит обработчик до ответа человека.
  void lightbox
    .getByRole('button', { name: /Скачать изображение|Download image/ })
    .click({ noWaitAfter: true })
    .catch(() => undefined)

  await expect.poll(async () => (await dialogs()).length, { timeout: 20000 }).toBe(1)
  await page.waitForTimeout(800)
  desktopShot('26.2.1')
})

test('26.2.2 в поле имени настоящего диалога — `image.png`', async () => {
  test.skip(locked(), LOCKED_REASON)
  const [dialog] = await dialogs()
  expect(dialog?.fileName).toMatch(/^image(\.png)?$/)
  desktopShot('26.2.2', `поле имени: «${dialog?.fileName}» (расширение Windows может прятать)`)
  await dialogs(true)
  await expect.poll(async () => (await dialogs()).length, { timeout: 10000 }).toBe(0)
  const page = await mainWindow(stand.get())
  await page.keyboard.press('Escape')
})

test('26.6.1 экспорт профиля из палитры открывает НАТИВНЫЙ диалог сохранения', async () => {
  test.skip(locked(), LOCKED_REASON)
  const page = await ui()
  await clearNotifications(page)
  await page.keyboard.press('Control+k')
  const palette = page.getByRole('dialog').last()
  await expect(palette).toBeVisible()
  await page.keyboard.type('Export profile')
  const option = palette.getByRole('option', { name: /Export profile|Экспортировать профиль/ })
  await expect(option).toBeVisible()
  for (
    let step = 0;
    step < 60 && (await option.getAttribute('aria-selected')) !== 'true';
    step += 1
  ) {
    await page.keyboard.press('ArrowDown')
  }
  await expect(option).toHaveAttribute('aria-selected', 'true')
  void page.keyboard.press('Enter').catch(() => undefined)

  await expect.poll(async () => (await dialogs()).length, { timeout: 20000 }).toBe(1)
  await page.waitForTimeout(800)
  desktopShot('26.6.1')
})

test('26.6.2 имя по умолчанию в настоящем диалоге — `<имя профиля>.tar.gz`', async () => {
  test.skip(locked(), LOCKED_REASON)
  const [dialog] = await dialogs()
  expect(dialog?.fileName).toMatch(/^default(\.tar)?(\.gz)?$/)
  desktopShot('26.6.2', `поле имени: «${dialog?.fileName}»`)
  await dialogs(true)
  await expect.poll(async () => (await dialogs()).length, { timeout: 10000 }).toBe(0)
})
