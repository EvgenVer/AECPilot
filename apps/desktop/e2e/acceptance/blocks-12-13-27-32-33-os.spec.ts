// Блоки 12, 13, 27, 32, 33 чек-листа (задача 3F.7): быстрый ввод, не давать
// машине уснуть, фоновая работа, несколько окон, плавающая лента — 32 позиции.
// Это блоки про ОТНОШЕНИЯ С ОПЕРАЦИОННОЙ СИСТЕМОЙ: окно поверх чужих программ,
// сквозной щелчок, тост системы, глобальный аккорд, блокировщик сна. Playwright
// видит только страницы; то, что видно лишь ОС, спрашивается у неё самой
// (`e2e/lib/desktop-probe.ps1`: hit-test окна под точкой, стили окна, окно
// переднего плана, аккорд с клавиатуры, снимок всего экрана). Снимки экрана —
// свидетельство в отчёте, вердикт по ним — глазами; проверки же в тестах
// сделаны тем, что решает сама ОС (`WindowFromPoint`), а не тем, что нарисовано.
//
// Стенд на моке: ходов модели нет, ответы приходят заглушкой; события ядра
// главный процесс рассылает всем окнам (D-97), быстрый ввод адресует сессию,
// открытую в окне (D-98, починен этой задачей).
//
// Имя теста начинается с номера позиции — по нему сходятся чек-лист, отчёт и
// счётчик покрытия. Файл идёт последовательно: одна сессия с историей
// заводится первым тестом, окна открываются и закрываются по ходу.

import { expect, test, type CDPSession, type Locator, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  appWindows,
  desktopDir,
  hideFirstRunSurfaces,
  mainWindow,
  openProject,
  reviveStrandedSession,
  send,
  standFixture
} from '../lib/app'

test.describe.configure({ mode: 'serial' })

const stand = standFixture({ mode: 'mock', label: 'blocks-12-13-27-32-33' })

const PROBE = join(desktopDir, 'e2e', 'lib', 'desktop-probe.ps1')
const SHOTS = join(desktopDir, 'test-results', 'acceptance', 'desktop')

let projectCreated = false

/** Главное окно с открытым проектом и живым композером. */
async function ui(): Promise<Page> {
  const page = await mainWindow(stand.get())
  await hideFirstRunSurfaces(page)
  if (!(await page.evaluate(() => window.aecpilot.getCurrentProject()))) {
    if (projectCreated) {
      const result = await page.evaluate(
        (dir) => window.aecpilot.openProject(dir),
        stand.get().projectDir
      )
      expect(result, `openProject: ${JSON.stringify(result)}`).toMatchObject({ ok: true })
    } else {
      await openProject(stand.get(), page)
      projectCreated = true
    }
  }
  await reviveStrandedSession(page)
  return page
}

/** Лента текущей сессии в окне. */
function thread(page: Page): Locator {
  return page.locator('[data-slot="aui_thread-content"]:visible').first()
}

/** Вопрос операционной системе (см. шапку `desktop-probe.ps1`). */
function probe(
  action: string,
  args: Record<string, number | string> = {}
): Record<string, unknown> {
  const out = execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      PROBE,
      '-Action',
      action,
      ...Object.entries(args).flatMap(([key, value]) => [`-${key}`, String(value)])
    ],
    { encoding: 'utf8', windowsHide: true }
  )
  const line = out.trim().split(/\r?\n/).pop() ?? '{}'
  return JSON.parse(line) as Record<string, unknown>
}

/** Снимок всего экрана — в отчёт. */
function desktopShot(name: string): string {
  mkdirSync(SHOTS, { recursive: true })
  const path = join(SHOTS, `${name}.png`)
  probe('shot', { Out: path })
  test.info().attachments.push({ name: `рабочий стол: ${name}`, contentType: 'image/png', path })
  return path
}

interface WinInfo {
  url: string
  visible: boolean
  focused: boolean
  minimized: boolean
  onTop: boolean
  bounds: { x: number; y: number; width: number; height: number }
  /** Физические (не DIP) координаты окна — то, чем оперирует ОС. */
  screen: { x: number; y: number; width: number; height: number }
  hwnd: string
}

/** Окно приложения по признаку в адресе — как его видит главный процесс. */
async function winInfo(includes: string, excludes = ''): Promise<WinInfo | null> {
  return stand.get().app.evaluate(
    ({ BrowserWindow, screen }, [inc, exc]) => {
      const win = BrowserWindow.getAllWindows().find((candidate) => {
        if (candidate.isDestroyed()) return false
        const url = candidate.webContents.getURL()
        return url.includes(inc) && (exc === '' || !url.includes(exc))
      })
      if (!win) return null
      const bounds = win.getBounds()
      const topLeft = screen.dipToScreenPoint({ x: bounds.x, y: bounds.y })
      const bottomRight = screen.dipToScreenPoint({
        x: bounds.x + bounds.width,
        y: bounds.y + bounds.height
      })
      return {
        url: win.webContents.getURL(),
        visible: win.isVisible(),
        focused: win.isFocused(),
        minimized: win.isMinimized(),
        onTop: win.isAlwaysOnTop(),
        bounds,
        screen: {
          x: topLeft.x,
          y: topLeft.y,
          width: bottomRight.x - topLeft.x,
          height: bottomRight.y - topLeft.y
        },
        hwnd: win.getNativeWindowHandle().readBigUInt64LE(0).toString()
      }
    },
    [includes, excludes] as const
  )
}

/** Главное окно — `index.html` без флага `win=`. */
const mainInfo = (): Promise<WinInfo | null> => winInfo('index.html', 'win=')

/** Страница окна по признаку в адресе; ждёт её появления. */
async function pageByUrl(includes: string, excludes = ''): Promise<Page> {
  let found: Page | undefined
  await expect
    .poll(
      () => {
        found = stand
          .get()
          .app.windows()
          .find(
            (candidate) =>
              candidate.url().includes(includes) &&
              (excludes === '' || !candidate.url().includes(excludes))
          )
        return Boolean(found)
      },
      { timeout: 30000, message: `окно «${includes}»` }
    )
    .toBe(true)
  return found!
}

/** Точка на экране (физические пиксели) внутри окна по долям его размера. */
function screenPoint(info: WinInfo, fx: number, fy: number): { X: number; Y: number } {
  return {
    X: Math.round(info.screen.x + info.screen.width * fx),
    Y: Math.round(info.screen.y + info.screen.height * fy)
  }
}

/** Что ОС отдаст щелчку в этой точке — окно верхнего уровня. */
function windowAt(point: { X: number; Y: number }): {
  hwnd: string
  title: string
  process: string
} {
  const answer = probe('window-at', point)
  return {
    hwnd: String(answer.hwnd),
    title: String(answer.title ?? ''),
    process: String(answer.process ?? '')
  }
}

/** Идентификатор сессии, в которую ушёл ход с таким текстом. */
function sessionIdOfPrompt(text: string): string {
  const line = stand
    .get()
    .mockOutput()
    .split(/\r?\n/)
    .find(
      (candidate) => candidate.includes(`text='${text}'`) && candidate.includes('prompt.submit')
    )
  const id = line?.match(/session_id='([^']+)'/)?.[1]
  expect(id, `ход «${text}» в журнале заглушки`).toBeTruthy()
  return id!
}

/** Экран настроек по адресу их маршрута. */
async function openSettings(page: Page, query: string): Promise<void> {
  await page.evaluate((hash) => {
    location.hash = hash
  }, `#/settings?${query}`)
  await expect(page.getByRole('button', { name: /Закрыть настройки|Close settings/ }))
    .toBeVisible({ timeout: 15000 })
    .catch(() => undefined)
}

async function closeSettings(page: Page): Promise<void> {
  await page.evaluate(() => {
    location.hash = '#/'
  })
  await expect(page.getByRole('textbox', { name: /Message|Сообщение/ })).toBeVisible({
    timeout: 30000
  })
}

/** Переключатель настроек по подписи; приводит в нужное положение. */
async function setSwitch(page: Page, label: RegExp, on: boolean): Promise<void> {
  const control = page.getByRole('switch', { name: label })
  await expect(control).toBeVisible({ timeout: 15000 })
  if ((await control.getAttribute('aria-checked')) !== String(on)) await control.click()
  await expect(control).toHaveAttribute('aria-checked', String(on))
}

/** Титул первой сессии файла — ядро называет сессию первым ходом. */
const FIRST_PROMPT = 'say: первый ход'

// ───────────────── Блок 12. Быстрый ввод ─────────────────

/** Окно быстрого ввода — как его видит главный процесс. */
const quickInfo = (): Promise<WinInfo | null> => winInfo('quick-entry')

/** Заперт ли экран. На экране блокировки рабочего стола нет: окна накрыты
 *  «Backstop Window» проводника, глобальный аккорд и настоящий курсор достаются
 *  экрану блокировки. Позиции, которые проверяет сама ОС (аккорд, попадание
 *  щелчка, ведение окна за курсором), там непроверяемы — и молча «зеленеть» им
 *  нельзя: такой прогон ничего не доказал. Тест снимается с явной причиной,
 *  видной в отчёте. */
function desktopLocked(): boolean {
  return probe('desktop').locked === true
}

const LOCKED_REASON =
  'экран заперт: эту позицию видит только ОС (аккорд, щелчок, курсор) — прогнать при разблокированном экране'

/** Нажать глобальный аккорд и дождаться окна быстрого ввода. */
async function summonQuickEntry(): Promise<WinInfo> {
  expect(
    stand.get().mainOutput(),
    'аккорд зарегистрирован (иначе журнал: «quick entry off (taken)»)'
  ).toMatch(/quick entry on /)
  probe('chord', { Keys: 'ctrl,shift,space' })
  await expect
    .poll(async () => (await quickInfo())?.visible ?? false, {
      timeout: 15000,
      message: 'окно быстрого ввода показалось'
    })
    .toBe(true)
  return (await quickInfo())!
}

test('12.1.1 Ctrl+Shift+Space из другого окна: узкое окно поверх всех, курсор уже в поле', async () => {
  test.skip(desktopLocked(), LOCKED_REASON)
  const page = await ui()
  // Одна сессия с ходом — чтобы «текущая сессия» ниже была известна по id.
  await send(page, FIRST_PROMPT)
  await expect(thread(page).getByText('первый ход', { exact: true }).last()).toBeVisible({
    timeout: 30000
  })

  // «Свернув приложение»: главное окно свёрнуто, на переднем плане — чужое.
  await stand.get().app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((candidate) => !candidate.webContents.getURL().includes('win='))
      ?.minimize()
  })
  await expect.poll(async () => (await mainInfo())?.minimized).toBe(true)

  const quick = await summonQuickEntry()
  expect(quick.onTop, 'поверх всех приложений').toBe(true)
  expect(quick.bounds.height, 'узкое окно').toBeLessThan(260)
  expect(quick.bounds.width).toBeLessThanOrEqual(720)
  // Hit-test ОС: щелчок в середину окна достался бы ему, а не тому, что под ним.
  expect(windowAt(screenPoint(quick, 0.5, 0.5)).hwnd, 'окно сверху по мнению ОС').toBe(quick.hwnd)
  const style = probe('window-style', { Hwnd: quick.hwnd })
  expect(style.topmost, 'стиль TOPMOST').toBe(true)

  // Курсор уже в поле: печатать можно без щелчка.
  const quickPage = await pageByUrl('quick-entry')
  await expect
    .poll(
      () =>
        quickPage.evaluate(
          () =>
            document.activeElement?.getAttribute('aria-label') === 'Сообщение агенту' &&
            document.hasFocus()
        ),
      { timeout: 10000 }
    )
    .toBe(true)
  expect(quick.focused, 'окно в фокусе').toBe(true)
  desktopShot('12-1-1-quick-entry')
})

test('12.2.1 фраза и Enter: окно закрылось, главное поднялось, ответ в текущей сессии', async () => {
  test.skip(desktopLocked(), LOCKED_REASON)
  const quickPage = await pageByUrl('quick-entry')
  const current = sessionIdOfPrompt(FIRST_PROMPT)
  await quickPage.getByRole('textbox', { name: 'Сообщение агенту' }).fill('say: быстрый ввод')
  await quickPage.keyboard.press('Enter')

  await expect.poll(async () => (await quickInfo())?.visible, { timeout: 15000 }).toBe(false)
  await expect
    .poll(
      async () => {
        const main = await mainInfo()
        return Boolean(main && main.visible && !main.minimized)
      },
      { timeout: 15000, message: 'главное окно поднялось' }
    )
    .toBe(true)

  // Ход ушёл именно в сессию, открытую в окне (D-98), и ответ виден в её ленте.
  await stand.get().waitForMockLine(/prompt\.submit .*text='say: быстрый ввод'/)
  expect(sessionIdOfPrompt('say: быстрый ввод')).toBe(current)
  const page = await ui()
  await expect(thread(page).getByText('быстрый ввод', { exact: true }).last()).toBeVisible({
    timeout: 30000
  })
})

test('12.3.1 «в новую сессию»: создаётся новая сессия, вопрос уходит в неё', async () => {
  test.skip(desktopLocked(), LOCKED_REASON)
  const page = await ui()
  const current = sessionIdOfPrompt(FIRST_PROMPT)
  await summonQuickEntry()
  const quickPage = await pageByUrl('quick-entry')
  await quickPage.getByRole('combobox').selectOption('new')
  await quickPage.getByRole('textbox', { name: 'Сообщение агенту' }).fill('say: в новую')
  await quickPage.keyboard.press('Enter')

  await stand.get().waitForMockLine(/prompt\.submit .*text='say: в новую'/)
  const target = sessionIdOfPrompt('say: в новую')
  expect(target, 'не та сессия, что была открыта').not.toBe(current)
  // Новая сессия появилась в списке — под именем вопроса.
  await expect(page.getByRole('button', { name: 'Reorder say: в новую', exact: true })).toBeVisible(
    { timeout: 30000 }
  )
  await expect.poll(async () => (await quickInfo())?.visible).toBe(false)
  // Окно ввода назад в «текущую» — следующий вызов начинается с чистого листа.
  await summonQuickEntry()
  await quickPage.getByRole('combobox').selectOption('current')
  // Esc слушает поле ввода — вернуть фокус ему (после выбора в списке он там).
  await quickPage.getByRole('textbox', { name: 'Сообщение агенту' }).focus()
  await quickPage.keyboard.press('Escape')
  await expect.poll(async () => (await quickInfo())?.visible).toBe(false)
})

test('12.4.1 Esc и щелчок мимо окна: оба раза исчезает без следа', async () => {
  test.skip(desktopLocked(), LOCKED_REASON)
  await ui()
  await summonQuickEntry()
  const quickPage = await pageByUrl('quick-entry')
  await quickPage.keyboard.press('Escape')
  await expect.poll(async () => (await quickInfo())?.visible, { timeout: 10000 }).toBe(false)

  const again = await summonQuickEntry()
  // «Щёлкнуть мимо» — окно ввода теряет фокус; настоящий щелчок по рабочему
  // столу владельца тест не делает (под точкой может быть чужая программа),
  // потеря фокуса воспроизводится самим окном: то же событие `blur`.
  await stand.get().app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((candidate) => candidate.webContents.getURL().includes('quick-entry'))
      ?.blur()
  })
  await expect.poll(async () => (await quickInfo())?.visible, { timeout: 10000 }).toBe(false)
  expect((await quickInfo())?.minimized, 'не свёрнуто, а скрыто').toBe(false)
  const style = probe('window-style', { Hwnd: again.hwnd })
  expect(style.visible, 'окна нет на экране').toBe(false)
  test.info().annotations.push({
    type: 'note',
    description: `стили окна ввода: ${JSON.stringify(style)} (TOOLWINDOW — без места в панели задач)`
  })
})

// ───────────────── Блок 13. Не давать машине уснуть ─────────────────

/** Стоит ли блокировщик сна в главном процессе. */
function blockerStarted(): Promise<boolean> {
  return stand.get().app.evaluate(({ powerSaveBlocker }) => {
    for (let id = 0; id < 100; id += 1) if (powerSaveBlocker.isStarted(id)) return true
    return false
  })
}

/** `powercfg /requests` — если у этой консоли хватает прав. */
function powerRequests(): { available: boolean; text: string } {
  try {
    const text = execFileSync('powercfg', ['/requests'], { encoding: 'utf8', windowsHide: true })
    return { available: true, text }
  } catch (error) {
    return { available: false, text: String((error as { stderr?: string }).stderr ?? error) }
  }
}

const KEEP_AWAKE = /Не давать компьютеру засыпать|Keep computer awake/

test('13.2.1 переключатель включён: блокировщик сна стоит (SYSTEM)', async () => {
  const page = await ui()
  await openSettings(page, 'tab=config:advanced')
  await setSwitch(page, KEEP_AWAKE, true)
  await expect.poll(blockerStarted, { timeout: 10000 }).toBe(true)
  expect(readFileSync(join(stand.get().userDataDir, 'keep-awake.json'), 'utf8')).toContain('true')

  const requests = powerRequests()
  if (requests.available) {
    const system = requests.text.split(/DISPLAY:/)[0]
    expect(system, 'powercfg: aecpilot в SYSTEM').toMatch(/aecpilot|electron/i)
  } else {
    test.info().annotations.push({
      type: 'note',
      description:
        '`powercfg /requests` требует консоли администратора — из-под теста недоступен; ' +
        'блокировщик сверен реестром Electron (`powerSaveBlocker.isStarted`). Команду ' +
        'из консоли администратора оставляем владельцу (одна строка).'
    })
  }
  await closeSettings(page)
})

test('13.2.2 экран гаснуть может: блокировщик не держит DISPLAY', async () => {
  await ui()
  const requests = powerRequests()
  if (requests.available) {
    const display =
      requests.text
        .split(/DISPLAY:/)[1]
        ?.split(/SYSTEM:|AWAYMODE:|EXECUTION:|PERFBOOST:|ACTIVELOCKSCREEN:/)[0] ?? ''
    expect(display, 'powercfg: aecpilot НЕ в DISPLAY').not.toMatch(/aecpilot|electron/i)
  } else {
    // Тип блокировщика — `prevent-app-suspension`, не `prevent-display-sleep`
    // (`main/keep-awake.ts`); DISPLAY он не держит по построению. Сам стиль
    // проверить отсюда нечем — см. заметку 13.2.1.
    expect(readFileSync(join(desktopDir, 'src', 'main', 'keep-awake.ts'), 'utf8')).toContain(
      "powerSaveBlocker.start('prevent-app-suspension')"
    )
    test.info().annotations.push({
      type: 'note',
      description: 'DISPLAY: по типу блокировщика (prevent-app-suspension); powercfg — владельцу.'
    })
  }
})

test('13.3.1 переключатель выключен: записи больше нет', async () => {
  const page = await ui()
  await openSettings(page, 'tab=config:advanced')
  await setSwitch(page, KEEP_AWAKE, false)
  await expect.poll(blockerStarted, { timeout: 10000 }).toBe(false)
  await closeSettings(page)
})

test('13.4.1 включён, приложение перезапущено: блокировщик снова стоит', async () => {
  let page = await ui()
  await openSettings(page, 'tab=config:advanced')
  await setSwitch(page, KEEP_AWAKE, true)
  await expect.poll(blockerStarted, { timeout: 10000 }).toBe(true)
  await closeSettings(page)

  await stand.get().relaunch()
  page = await ui()
  await expect.poll(blockerStarted, { timeout: 30000 }).toBe(true)
  expect(stand.get().mainOutput()).toContain('keep-awake restored')
  // Прибрать за собой: ночной прогон этому стенду не нужен.
  await openSettings(page, 'tab=config:advanced')
  await setSwitch(page, KEEP_AWAKE, false)
  await closeSettings(page)
})

// ───────────────── Блок 27. Фоновая работа ─────────────────

interface Toast {
  title: string
  body: string
  silent: boolean
}

/** Записывать тосты, которые главный процесс отдаёт системе (сам показ не
 *  подменяется — тост действительно появляется на рабочем столе). */
async function recordToasts(): Promise<void> {
  await stand.get().app.evaluate(({ Notification }) => {
    const bag = globalThis as unknown as {
      __toasts?: Toast[]
      __toastObjects?: Electron.Notification[]
      __toastShow?: () => void
    }
    bag.__toasts = []
    bag.__toastObjects = []
    if (!bag.__toastShow) {
      bag.__toastShow = Notification.prototype.show
      Notification.prototype.show = function (this: Electron.Notification) {
        bag.__toasts?.push({ title: this.title, body: this.body, silent: this.silent })
        bag.__toastObjects?.push(this)
        return bag.__toastShow?.call(this)
      }
    }
  })
}

function toasts(): Promise<Toast[]> {
  return stand
    .get()
    .app.evaluate(() => (globalThis as unknown as { __toasts?: Toast[] }).__toasts ?? [])
}

/** Playwright держит у страницы эмуляцию фокуса (`document.hasFocus()` всегда
 *  true), а их правило «человек не смотрит» читает именно его: свёрнутое окно
 *  для страницы выглядело бы активным и тоста не было бы. На время «окно
 *  свёрнуто» эмуляция снимается через CDP и страница видит настоящее
 *  состояние ОС; сеанс CDP живёт, пока окно свёрнуто, — при отсоединении
 *  Chromium возвращает эмуляцию. */
let focusEmulation: CDPSession | undefined

async function minimizeMain(): Promise<void> {
  const page = await ui()
  await stand.get().app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((candidate) => !candidate.webContents.getURL().includes('win='))
      ?.minimize()
  })
  await expect.poll(async () => (await mainInfo())?.minimized).toBe(true)
  focusEmulation ??= await page.context().newCDPSession(page)
  await focusEmulation.send('Emulation.setFocusEmulationEnabled', { enabled: false })
  await expect.poll(() => page.evaluate(() => document.hasFocus())).toBe(false)
}

/** Вернуть странице эмуляцию фокуса — окно снова на виду. */
async function dropFocusEmulation(): Promise<void> {
  if (!focusEmulation) return
  await focusEmulation.send('Emulation.setFocusEmulationEnabled', { enabled: true })
  await focusEmulation.detach()
  focusEmulation = undefined
}

async function restoreMain(): Promise<void> {
  await stand.get().app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find(
      (candidate) => !candidate.webContents.getURL().includes('win=')
    )
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  })
  await expect.poll(async () => (await mainInfo())?.minimized).toBe(false)
  await dropFocusEmulation()
}

test('27.2.1 окно свёрнуто, ход закончился: уведомление с названием AECPilot', async () => {
  const page = await ui()
  await recordToasts()
  // Первые четыре секунды после подключения к шлюзу их хранилище молчит
  // (`notify-baseline.ts`: повтор старого состояния — не событие); свежий
  // стенд в них укладывается, поэтому ход отправляется после окна тишины.
  await page.waitForTimeout(4500)
  // Как у человека: отправил, ответ идёт долго (`slow:` — три секунды),
  // свернул окно и ушёл. Щелчок по композеру даёт странице фокус, поэтому
  // сворачивать ПОСЛЕ отправки, а не до.
  await send(page, 'slow: say: фоновый ответ')
  await minimizeMain()
  await expect
    .poll(async () => (await toasts()).length, { timeout: 30000, message: 'тост отдан системе' })
    .toBeGreaterThan(0)
  const [toast] = await toasts()
  expect(toast.title, 'название продукта — наше').toContain('AECPilot')
  expect(`${toast.title} ${toast.body}`, 'чужого названия нет').not.toMatch(/hermes/i)
  expect(toast.body).toContain('фоновый ответ')
  await page.waitForTimeout(1500)
  desktopShot('27-2-1-toast')
  test.info().annotations.push({ type: 'evidence', description: `тост: ${JSON.stringify(toast)}` })
})

test('27.3.1 щелчок по уведомлению поднимает окно из панели задач', async () => {
  expect((await mainInfo())?.minimized, 'окно ещё свёрнуто').toBe(true)
  // Щелчок — событие самого уведомления Electron (то, что ОС присылает по
  // щелчку человека); дальше — наш путь: поднять окно, открыть сессию.
  await stand.get().app.evaluate(() => {
    const bag = globalThis as unknown as { __toastObjects?: Electron.Notification[] }
    bag.__toastObjects?.[bag.__toastObjects.length - 1]?.emit('click')
  })
  await expect
    .poll(
      async () => {
        const main = await mainInfo()
        return Boolean(main && main.visible && !main.minimized)
      },
      { timeout: 15000 }
    )
    .toBe(true)
  await dropFocusEmulation()
})

test('27.3.2 на экране та самая сессия, о которой было уведомление', async () => {
  const page = await ui()
  // Уйти в другую сессию, затем «щёлкнуть» по уведомлению ещё раз: окно обязано
  // вернуться к сессии уведомления, а не остаться где было.
  await page
    .getByRole('button', { name: /^Новый сеанс/ })
    .first()
    .click()
  await expect(thread(page).getByText('фоновый ответ', { exact: true })).toHaveCount(0)
  await stand.get().app.evaluate(() => {
    const bag = globalThis as unknown as { __toastObjects?: Electron.Notification[] }
    bag.__toastObjects?.[bag.__toastObjects.length - 1]?.emit('click')
  })
  await expect(thread(page).getByText('фоновый ответ', { exact: true }).last()).toBeVisible({
    timeout: 30000
  })
})

test('27.4.1 вид «Ответ готов» выключен: уведомления нет, ответ в ленте есть', async () => {
  const page = await ui()
  await openSettings(page, 'tab=notifications')
  await setSwitch(page, /^Ответ готов|Turn done/, false)
  await closeSettings(page)
  await recordToasts()
  // Тот же путь, что в 27.2.1 (иначе «нет тоста» ничего не доказывает).
  await send(page, 'slow: say: тихий ответ')
  await minimizeMain()
  await expect(thread(page).getByText('тихий ответ', { exact: true }).last()).toBeVisible({
    timeout: 30000
  })
  await page.waitForTimeout(2000)
  expect(await toasts(), 'ни одного тоста').toEqual([])
  await restoreMain()
  await openSettings(page, 'tab=notifications')
  await setSwitch(page, /^Ответ готов|Turn done/, true)
  await closeSettings(page)
})

test('27.5.1 на батарее приложение работает как работало', async () => {
  const page = await ui()
  const startedOnBattery = await page.evaluate(() => window.aecpilot.getOnBattery())
  await stand.get().app.evaluate(
    ({ powerMonitor }, event) => {
      powerMonitor.emit(event)
    },
    startedOnBattery ? 'on-ac' : 'on-battery'
  )
  await send(page, 'say: на батарее')
  await expect(thread(page).getByText('на батарее', { exact: true }).last()).toBeVisible({
    timeout: 30000
  })
  await stand.get().app.evaluate(
    ({ powerMonitor }, event) => {
      powerMonitor.emit(event)
    },
    startedOnBattery ? 'on-battery' : 'on-ac'
  )
})

test('27.6.1 после сна приложение отвечает: композер активен, ответ приходит', async () => {
  const page = await ui()
  await stand.get().app.evaluate(({ powerMonitor }) => {
    powerMonitor.emit('suspend')
    powerMonitor.emit('resume')
  })
  const composer = page.getByRole('textbox', { name: /Message|Сообщение/ })
  await expect(composer).toBeEnabled({ timeout: 30000 })
  await expect(composer).not.toHaveAttribute('data-placeholder', /Reconnecting|Подключение/, {
    timeout: 30000
  })
  await send(page, 'say: после сна')
  await expect(thread(page).getByText('после сна', { exact: true }).last()).toBeVisible({
    timeout: 30000
  })
  expect(stand.get().mainOutput()).not.toContain('gateway did not answer after resume')
})

// ───────────────── Блок 32. Несколько окон ─────────────────

let secondPage: Page | undefined

test('32.1.1 Ctrl+Shift+N: второе полноценное окно с боковой панелью', async () => {
  const page = await ui()
  const before = appWindows(stand.get()).length
  await page.keyboard.press('Control+Shift+N')
  await expect.poll(() => appWindows(stand.get()).length, { timeout: 30000 }).toBe(before + 1)
  secondPage = appWindows(stand.get()).find(
    (candidate) => candidate !== page && !candidate.url().includes('win=')
  )
  expect(secondPage, 'обычное окно, без флага win=').toBeTruthy()
  await hideFirstRunSurfaces(secondPage!)
  await expect(secondPage!.getByRole('button', { name: /^Новый сеанс/ }).first()).toBeVisible({
    timeout: 60000
  })
  await expect(secondPage!.getByRole('textbox', { name: /Message|Сообщение/ })).toBeVisible({
    timeout: 60000
  })
})

/** Заголовки строк сессий окна — по ручкам перетаскивания. */
async function sessionTitles(page: Page): Promise<string[]> {
  const handles = page.locator('[data-reorder-handle][aria-label^="Reorder "]')
  await expect(handles.first()).toBeVisible({ timeout: 30000 })
  return handles.evaluateAll((els) =>
    els.map((el) => (el.getAttribute('aria-label') ?? '').replace(/^Reorder /, ''))
  )
}

test('32.1.2 во втором окне тот же проект и те же сессии', async () => {
  const page = await ui()
  await expect(
    secondPage!.getByRole('contentinfo').getByRole('button', { name: 'e2e', exact: true })
  ).toBeVisible({ timeout: 30000 })
  // Оба списка читаются в одном опросе: первое окно тоже ещё может дорисовывать
  // строки (сессии блока 27 только что появились).
  await expect
    .poll(
      async () => {
        const first = [...(await sessionTitles(page))].sort().join('|')
        const second = [...(await sessionTitles(secondPage!))].sort().join('|')
        // Объектом, а не «да/нет»: при падении в отчёте видно оба списка.
        return { same: first !== '' && first === second, first, second }
      },
      { timeout: 30000 }
    )
    .toMatchObject({ same: true })
})

/** Записывать в окне, кто просил разовую подсказку и кому её дали. */
async function recordCues(page: Page): Promise<void> {
  await page.evaluate(() => {
    const bridge = (
      window as unknown as { hermesDesktop: { claimAmbientCue: (key: string) => Promise<boolean> } }
    ).hermesDesktop
    const bag = window as unknown as {
      __cues?: { key: string; granted: boolean }[]
      __claim?: typeof bridge.claimAmbientCue
    }
    bag.__cues = []
    if (!bag.__claim) {
      bag.__claim = bridge.claimAmbientCue
      bridge.claimAmbientCue = async (key: string) => {
        const granted = await bag.__claim!(key)
        bag.__cues?.push({ key, granted })
        return granted
      }
    }
  })
}

function cues(page: Page): Promise<{ key: string; granted: boolean }[]> {
  return page.evaluate(
    () => (window as unknown as { __cues?: { key: string; granted: boolean }[] }).__cues ?? []
  )
}

test('32.2.1 вопрос во втором окне: ответ идёт в нём', async () => {
  const page = await ui()
  await recordCues(page)
  await recordCues(secondPage!)
  await hideFirstRunSurfaces(secondPage!)
  // Свой разговор во втором окне: по его названию 32.3.1 найдёт строку.
  await secondPage!
    .getByRole('button', { name: /^Новый сеанс/ })
    .first()
    .click()
  await send(secondPage!, 'say: второе окно')
  await expect(thread(secondPage!).getByText('второе окно', { exact: true }).last()).toBeVisible({
    timeout: 30000
  })
})

test('32.2.2 звук конца хода прозвучал один раз, а не два', async () => {
  const page = await ui()
  await expect
    .poll(async () => (await cues(page)).length + (await cues(secondPage!)).length, {
      timeout: 15000,
      message: 'хотя бы одно окно просило подсказку конца хода'
    })
    .toBeGreaterThan(0)
  const all = [...(await cues(page)), ...(await cues(secondPage!))].filter((cue) =>
    cue.key.startsWith('sound:')
  )
  expect(all.filter((cue) => cue.granted).length, `просьбы: ${JSON.stringify(all)}`).toBe(1)
})

test('32.3.1 «открыть в новом окне» у строки сессии: окно одного разговора, без боковой панели', async () => {
  const page = await ui()
  const before = appWindows(stand.get()).length
  const row = page
    .getByRole('button', { name: 'Reorder say: второе окно', exact: true })
    .locator('xpath=ancestor::*[contains(@class,"row-hover")][1]')
  await expect(row).toBeVisible({ timeout: 30000 })
  await row.click({ button: 'right' })
  await page.getByRole('menuitem', { name: /^(Новое окно|New window)$/ }).click()
  await expect.poll(() => appWindows(stand.get()).length, { timeout: 30000 }).toBe(before + 1)
  const sessionWindow = await pageByUrl('win=secondary')
  await expect(sessionWindow.getByRole('textbox', { name: /Message|Сообщение/ })).toBeVisible({
    timeout: 60000
  })
  await expect(thread(sessionWindow).getByText('второе окно', { exact: true }).last()).toBeVisible({
    timeout: 30000
  })
  // Их окно одной сессии (v2026.9.11) поднимает дерево по умолчанию — с панелью
  // сессий, но общего списка в ней нет: одна строка, этот разговор (заметка 3F.7).
  // Строка сессии — `group row-hover relative` (session-row.tsx); у одиночной
  // строки ручки перетаскивания нет, поэтому считать по оболочке.
  const rows = sessionWindow.locator('.group.row-hover.relative')
  await expect(rows).toHaveCount(1, { timeout: 30000 })
  await expect(rows.first()).toContainText('say: второе окно')
})

test('32.3.2 повторный вызов на ту же сессию не открывает вторую копию', async () => {
  const page = await ui()
  const before = appWindows(stand.get()).length
  const row = page
    .getByRole('button', { name: 'Reorder say: второе окно', exact: true })
    .locator('xpath=ancestor::*[contains(@class,"row-hover")][1]')
  await row.click({ button: 'right' })
  await page.getByRole('menuitem', { name: /^(Новое окно|New window)$/ }).click()
  await page.waitForTimeout(1500)
  expect(appWindows(stand.get()).length).toBe(before)
})

/** Группа дерева панелей, в которой лежит вкладка. */
async function groupOfTab(tab: Locator): Promise<string> {
  return tab.evaluate(
    (el) => el.closest('[data-tree-group]')?.getAttribute('data-tree-group') ?? ''
  )
}

test('32.4.1 панель переезжает за заголовок в другое место дерева и возвращается', async () => {
  const page = await ui()
  // Панель «Изменения» открывается в правой колонке рядом с их «Терминалом»;
  // вкладка тянется мышью в группу терминала и обратно.
  await page.getByRole('textbox', { name: /Message|Сообщение/ }).click()
  if (!(await page.getByRole('tab', { name: /^(Изменения|Changes)/ }).isVisible())) {
    await page.keyboard.press('Control+g')
  }
  const tab = page.getByRole('tab', { name: /^(Изменения|Changes)/ })
  await expect(tab).toBeVisible({ timeout: 30000 })
  const home = await groupOfTab(tab)
  expect(home).not.toBe('')
  const groups = page.locator('[data-tree-group]')
  const targets: { id: string; box: { x: number; y: number; width: number; height: number } }[] = []
  for (const group of await groups.all()) {
    const id = (await group.getAttribute('data-tree-group')) ?? ''
    const box = await group.boundingBox()
    if (id && id !== home && box && box.width > 80 && box.height > 80) targets.push({ id, box })
  }
  expect(targets.length, 'есть другая группа, куда тянуть').toBeGreaterThan(0)
  const target = targets[targets.length - 1]

  const drag = async (from: Locator, to: { x: number; y: number }): Promise<void> => {
    const box = (await from.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2 + 12, { steps: 4 })
    await page.mouse.move(to.x, to.y, { steps: 12 })
    await page.waitForTimeout(300)
    await page.mouse.up()
  }
  await drag(tab, {
    x: target.box.x + target.box.width / 2,
    y: target.box.y + target.box.height / 2
  })
  await expect
    .poll(() => groupOfTab(tab), { timeout: 10000, message: 'вкладка переехала' })
    .not.toBe(home)

  const homeGroup = page.locator(`[data-tree-group="${home}"]`)
  const homeBox = (await homeGroup.boundingBox())!
  await drag(tab, { x: homeBox.x + homeBox.width / 2, y: homeBox.y + homeBox.height / 2 })
  await expect
    .poll(() => groupOfTab(tab), { timeout: 10000, message: 'вкладка вернулась' })
    .toBe(home)
})

test('32.5.1 раскладка пережила перезапуск', async () => {
  let page = await ui()
  const tab = page.getByRole('tab', { name: /^(Изменения|Changes)/ })
  await expect(tab).toBeVisible()
  const home = await groupOfTab(tab)
  const sash = page.getByRole('separator').first()
  const before = (await sash.boundingBox())!
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2)
  await page.mouse.down()
  await page.mouse.move(before.x + 90, before.y + before.height / 2, { steps: 8 })
  await page.mouse.up()
  const moved = (await sash.boundingBox())!
  expect(moved.x - before.x).toBeGreaterThan(60)
  const treeBefore = await page.evaluate(() => localStorage.getItem('hermes.desktop.layoutTree.v2'))

  await stand.get().relaunch()
  page = await ui()
  // Ширина боковой панели — та, что оставили.
  await expect
    .poll(async () => (await page.getByRole('separator').first().boundingBox())?.x ?? -1, {
      timeout: 30000
    })
    .toBeGreaterThan(moved.x - 3)
  const restored = (await page.getByRole('separator').first().boundingBox())!
  expect(Math.abs(restored.x - moved.x)).toBeLessThan(3)
  // Дерево панелей — то же (их хранилище `layoutTree.v2`).
  expect(await page.evaluate(() => localStorage.getItem('hermes.desktop.layoutTree.v2'))).toBe(
    treeBefore
  )
  // Панель «Изменения» после перезапуска на моке приходится звать заново
  // (Ctrl+G — как в 3F.6): их правый ряд ждёт `$hasWorkspace`, а мок в
  // `session.info` рабочую папку не называет (заметка 3F.7). Вернувшись, она
  // встаёт в ту же группу дерева, где стояла.
  // Вкладка — у НОВОЙ страницы: старая закрыта вместе с прежним процессом.
  const tabAfter = page.getByRole('tab', { name: /^(Изменения|Changes)/ })
  for (let attempt = 0; attempt < 3 && !(await tabAfter.isVisible()); attempt += 1) {
    await page.getByRole('textbox', { name: /Message|Сообщение/ }).click()
    await page.keyboard.press('Control+g')
    await tabAfter.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined)
  }
  await expect(tabAfter).toBeVisible()
  expect(await groupOfTab(tabAfter)).toBe(home)
})

test('32.5.2 окно одной сессии не переписало раскладку главного окна', async () => {
  const page = await ui()
  // После перезапуска (в котором до закрытия жило окно одной сессии — без
  // боковой панели) у главного окна боковая панель и открытая панель на месте.
  await expect(page.getByRole('button', { name: /^Новый сеанс/ }).first()).toBeVisible()
  await expect(page.getByRole('tab', { name: /^(Изменения|Changes)/ })).toBeVisible()
  expect(
    appWindows(stand.get()).filter((candidate) => candidate.url().includes('win=secondary'))
  ).toEqual([])
})

test('32.6.1 второе окно закрыто — первое работает как ни в чём не бывало', async () => {
  let page = await ui()
  const before = appWindows(stand.get()).length
  await page.keyboard.press('Control+Shift+N')
  await expect.poll(() => appWindows(stand.get()).length, { timeout: 30000 }).toBe(before + 1)
  const second = appWindows(stand.get()).find(
    (candidate) => candidate !== page && !candidate.url().includes('win=')
  )!
  await second.close()
  await expect.poll(() => appWindows(stand.get()).length).toBe(before)
  page = await ui()
  await send(page, 'say: первое окно живо')
  await expect(thread(page).getByText('первое окно живо', { exact: true }).last()).toBeVisible({
    timeout: 30000
  })
})

// ───────────────── Блок 33. Плавающая лента ─────────────────

const hudInfo = (): Promise<WinInfo | null> => winInfo('win=hud')

test('33.2.1 Ctrl+Shift+H: узкая полоса с лентой и полем ввода', async () => {
  const page = await ui()
  await page.getByRole('textbox', { name: /Message|Сообщение/ }).click()
  await page.keyboard.press('Control+Shift+H')
  await expect.poll(async () => (await hudInfo())?.visible ?? false, { timeout: 30000 }).toBe(true)
  const hud = await pageByUrl('win=hud')
  await expect(hud.getByRole('textbox').first()).toBeVisible({ timeout: 30000 })
  const info = (await hudInfo())!
  expect(info.bounds.height, 'полоса, не окно').toBeLessThan(info.bounds.width)
})

test('33.2.2 полоса видна ПОВЕРХ чужой программы', async () => {
  test.skip(desktopLocked(), LOCKED_REASON)
  const info = (await hudInfo())!
  expect(info.onTop).toBe(true)
  const hud = await pageByUrl('win=hud')
  const composer = (await hud.getByRole('textbox').first().boundingBox())!
  // Точка на самой полосе — в поле ввода. Сначала курсор туда: полоса решает,
  // где она твёрдая, по положению курсора.
  await hud.mouse.move(composer.x + composer.width / 2, composer.y + composer.height / 2)
  await hud.waitForTimeout(300)
  const scale = info.screen.width / info.bounds.width
  const point = {
    X: Math.round(info.screen.x + (composer.x + composer.width / 2) * scale),
    Y: Math.round(info.screen.y + (composer.y + composer.height / 2) * scale)
  }
  await expect
    .poll(() => windowAt(point).hwnd, { timeout: 10000, message: 'по мнению ОС сверху — полоса' })
    .toBe(info.hwnd)
  desktopShot('33-2-2-hud-over-desktop')
})

test('33.3.1 щелчок мимо полосы (по прозрачному) достаётся чужой программе', async () => {
  test.skip(desktopLocked(), LOCKED_REASON)
  const info = (await hudInfo())!
  const hud = await pageByUrl('win=hud')
  // Место, где полоса ничего не рисует: под точкой — только их монтажный узел
  // (#root), то есть пустота. Оно ищется, а не назначается: углы заняты —
  // справа висит лента уведомлений, снизу composer.
  const empty = await hud.evaluate(() => {
    const root = document.querySelector('#root')
    for (let y = 8; y < window.innerHeight - 8; y += 6) {
      for (let x = 8; x < window.innerWidth - 8; x += 12) {
        const hit = document.elementFromPoint(x, y)
        if (hit && root && (hit === root || hit.contains(root))) return { x, y }
      }
    }
    return null
  })
  expect(empty, 'у полосы есть место, где она ничего не рисует').not.toBeNull()

  // Каретка — НЕ в поле полосы: человек печатает в чужой программе. Это условие
  // обязательное, а не декорация. Пока поле ввода полосы держит каретку, их
  // правило (`hud/click-through.ts`) намеренно оставляет окно твёрдым — иначе
  // сквозной щелчок поднимет программу снизу и утащит каретку. У человека это
  // выходит само: полоса теряет фокус вместе с кареткой. Playwright же держит у
  // страницы вечный фокус (`document.hasFocus()` всегда true), поэтому снимается
  // именно каретка.
  await hud.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await hud.mouse.move(empty!.x, empty!.y)
  await hud.waitForTimeout(300)

  const scale = info.screen.width / info.bounds.width
  const point = {
    X: Math.round(info.screen.x + empty!.x * scale),
    Y: Math.round(info.screen.y + empty!.y * scale)
  }
  await expect
    .poll(() => windowAt(point).hwnd, { timeout: 10000, message: 'щелчок пройдёт сквозь полосу' })
    .not.toBe(info.hwnd)
  const under = windowAt(point)
  const style = probe('window-style', { Hwnd: info.hwnd })
  expect(style.transparent, 'окно помечено сквозным (WS_EX_TRANSPARENT)').toBe(true)
  test.info().annotations.push({
    type: 'evidence',
    description: `под прозрачной точкой (${point.X},${point.Y}): ${under.process} «${under.title}»`
  })
})

test('33.4.1 полоса приняла ввод, ответ пришёл в неё', async () => {
  const hud = await pageByUrl('win=hud')
  const input = hud.getByRole('textbox').first()
  await input.click()
  await hud.keyboard.type('say: из ленты')
  await hud.keyboard.press('Enter')
  await expect(hud.getByText('из ленты', { exact: true }).last()).toBeVisible({ timeout: 30000 })
})

test('33.5.1 полоса двигается за курсором и не уходит за край экрана', async () => {
  test.skip(desktopLocked(), LOCKED_REASON)
  const hud = await pageByUrl('win=hud')
  const before = (await hudInfo())!
  const scale = before.screen.width / before.bounds.width
  const input = hud.getByRole('textbox').first()
  const box = (await input.boundingBox())!
  // Тянуть за поле ввода — их «поле и есть ручка» (`hud/composer-drag.ts`).
  //
  // НАСТОЯЩИЙ КУРСОР. Пока полоса захвачена, окно ведёт главный процесс, и
  // ведёт его за курсором ОС: страница во время перетаскивания шлёт только свой
  // размер (пока окно успевает за курсором, её координаты не меняются). Поэтому
  // тест двигает настоящий курсор, а событиями страницы лишь просит очередной
  // кадр. Курсор в конце возвращается туда, где был.
  const grab = { x: box.x + 8, y: box.y + box.height / 2 }
  const screenOf = (point: { x: number; y: number }): { X: number; Y: number } => ({
    X: Math.round(before.screen.x + point.x * scale),
    Y: Math.round(before.screen.y + point.y * scale)
  })
  const wasCursor = probe('cursor') as { x: number; y: number }

  try {
    probe('cursor', screenOf(grab))
    await hud.mouse.move(grab.x, grab.y)
    await hud.mouse.down()
    // Захват возникает по удержанию (их порог — 140 мс).
    await hud.waitForTimeout(400)

    const step = { X: -140, Y: -90 }
    probe('cursor', {
      X: screenOf(grab).X + step.X,
      Y: screenOf(grab).Y + step.Y
    })
    await hud.mouse.move(grab.x - 4, grab.y - 4)
    await expect
      .poll(
        async () => {
          await hud.mouse.move(grab.x - 5, grab.y - 5)
          const now = (await hudInfo())!
          return now.bounds.x - before.bounds.x
        },
        { timeout: 10000, message: 'полоса сдвинулась за курсором' }
      )
      .toBeLessThan(-40)
    const moved = (await hudInfo())!
    expect(moved.bounds.y, 'и по вертикали').toBeLessThan(before.bounds.y)

    // Дальше края: курсор уходит в самый угол экрана, окно остаётся целиком в
    // рабочей области — у полосы нет заголовка, вернуть её оттуда нечем.
    probe('cursor', { X: 0, Y: 0 })
    await hud.mouse.move(grab.x - 6, grab.y - 6)
    await hud.waitForTimeout(300)
    await hud.mouse.up()
  } finally {
    probe('cursor', { X: wasCursor.x, Y: wasCursor.y })
  }

  const edge = await stand.get().app.evaluate(({ BrowserWindow, screen }) => {
    const win = BrowserWindow.getAllWindows().find((candidate) =>
      candidate.webContents.getURL().includes('win=hud')
    )
    if (!win) return null
    const bounds = win.getBounds()
    return { bounds, work: screen.getDisplayNearestPoint(bounds).workArea }
  })
  expect(edge).not.toBeNull()
  expect(edge!.bounds.x).toBeGreaterThanOrEqual(edge!.work.x)
  expect(edge!.bounds.y).toBeGreaterThanOrEqual(edge!.work.y)
  expect(edge!.bounds.x + edge!.bounds.width).toBeLessThanOrEqual(edge!.work.x + edge!.work.width)
  expect(edge!.bounds.y + edge!.bounds.height).toBeLessThanOrEqual(edge!.work.y + edge!.work.height)
})

test('33.6.1 Ctrl+Shift+H ещё раз: полоса исчезла, главное окно работает как раньше', async () => {
  const page = await ui()
  await page.getByRole('textbox', { name: /Message|Сообщение/ }).click()
  await page.keyboard.press('Control+Shift+H')
  await expect.poll(async () => (await hudInfo()) === null, { timeout: 30000 }).toBe(true)
  await send(page, 'say: после ленты')
  await expect(thread(page).getByText('после ленты', { exact: true }).last()).toBeVisible({
    timeout: 30000
  })
})

test('33.7.1 Ctrl+Shift+Space: маленькое окно ввода, курсор уже в нём', async () => {
  test.skip(desktopLocked(), LOCKED_REASON)
  await ui()
  const quick = await summonQuickEntry()
  const quickPage = await pageByUrl('quick-entry')
  await expect
    .poll(
      () =>
        quickPage.evaluate(
          () => document.activeElement?.getAttribute('aria-label') === 'Сообщение агенту'
        ),
      { timeout: 10000 }
    )
    .toBe(true)
  expect(quick.bounds.width * quick.bounds.height, 'маленькое окно').toBeLessThan(720 * 260)
})

test('33.7.2 после отправки окно ввода исчезло само', async () => {
  test.skip(desktopLocked(), LOCKED_REASON)
  const quickPage = await pageByUrl('quick-entry')
  await quickPage.keyboard.type('say: из быстрого ввода')
  await quickPage.keyboard.press('Enter')
  await expect.poll(async () => (await quickInfo())?.visible, { timeout: 15000 }).toBe(false)
  const page = await ui()
  await expect(thread(page).getByText('из быстрого ввода', { exact: true }).last()).toBeVisible({
    timeout: 30000
  })
  expect(existsSync(SHOTS)).toBe(true)
})
