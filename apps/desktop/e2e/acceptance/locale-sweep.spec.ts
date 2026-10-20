// Задача T27: проход обоих языков интерфейса по всем экранам. Для каждого языка
// стенд (mock-шлюз, открытый проект) обходит страницы приложения и вкладки
// настроек, снимает экран и выписывает строки, похожие на непереведённые: в
// русском — латинские слова (кроме имён собственных и терминов из списка), в
// английском — кириллицу. Выписка — материал для разбора человеком, а не порог:
// имена моделей, путей и команд законно латинские.

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import { hideFirstRunSurfaces, mainWindow, openProject, standFixture } from '../lib/app'
import { evidenceDir } from '../lib/evidence'

test.describe.configure({ mode: 'serial' })

const stand = standFixture({ mode: 'mock', label: 'locale-sweep' })
const outDir = join(evidenceDir, 'locale-sweep')

const ROUTES = [
  '/',
  '/cron',
  '/capabilities',
  '/messaging',
  '/webhooks',
  '/artifacts',
  '/profiles',
  '/agents',
  '/command-center',
  '/starmap'
]

const SETTINGS_TABS = [
  'config:model',
  'config:chat',
  'config:appearance',
  'config:workspace',
  'config:safety',
  'config:browser',
  'config:memory',
  'config:voice',
  'config:advanced',
  'providers',
  'gateway',
  'keybinds',
  'keys',
  'notifications',
  'sessions',
  'plugins',
  'about'
]

/** Латиница, законная в русском интерфейсе: имена продуктов, форматы, термины. */
const LATIN_OK = new Set(
  [
    'AECPilot',
    'Hermes',
    'Desktop',
    'Gemini',
    'OpenAI',
    'Anthropic',
    'Claude',
    'Codex',
    'Google',
    'GitHub',
    'Windows',
    'Linux',
    'macOS',
    'Chrome',
    'Chromium',
    'Electron',
    'Python',
    'Node',
    'JSON',
    'YAML',
    'HTTP',
    'HTTPS',
    'Markdown',
    'Mem0',
    'LightRAG',
    'Ollama',
    'OpenRouter',
    'Telegram',
    'Discord',
    'Slack',
    'WhatsApp',
    'Signal',
    'Email',
    'Matrix',
    'Webhook',
    'Enter',
    'Shift',
    'Ctrl',
    'Space',
    'Escape',
    'Backspace',
    'Delete',
    'Tab'
  ].map((word) => word.toLowerCase())
)

function suspicious(locale: 'ru' | 'en', text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (locale === 'en') return lines.filter((line) => /[А-Яа-яЁё]/.test(line))
  // Слово — отдельный токен из одних латинских букв (пути, ключи, имена файлов и
  // команды с `/ . _ : @ =` в выписку не попадают).
  return lines.filter((line) =>
    line
      .split(/\s+/)
      .map((token) => token.replace(/^[«"'(,]+|[»"'),.:;!?]+$/g, ''))
      .some((word) => /^[A-Za-z][A-Za-z'-]{3,}$/.test(word) && !LATIN_OK.has(word.toLowerCase()))
  )
}

async function setLocale(page: Page, locale: 'ru' | 'en'): Promise<void> {
  await page.evaluate((value) => window.localStorage.setItem('aecpilot.ui-language', value), locale)
  await page.reload()
  await page.waitForFunction(
    () => (window as unknown as { hermesDesktop?: unknown }).hermesDesktop !== undefined,
    undefined,
    { timeout: 60000 }
  )
  await hideFirstRunSurfaces(page)
}

async function visit(page: Page, hash: string): Promise<string> {
  await page.evaluate((value) => {
    window.location.hash = value
  }, hash)
  await page.waitForTimeout(1500)
  return page.evaluate(() => document.body.innerText)
}

let page: Page

test('проект открыт', async () => {
  page = await mainWindow(stand.get())
  await hideFirstRunSurfaces(page)
  await openProject(stand.get(), page)
})

for (const locale of ['ru', 'en'] as const) {
  test(`T27 проход: ${locale}`, async () => {
    test.setTimeout(600000)
    await setLocale(page, locale)
    mkdirSync(join(outDir, locale), { recursive: true })
    const report: string[] = []
    const screens = [
      ...ROUTES.map((route) => ({ name: route === '/' ? 'home' : route.slice(1), hash: route })),
      ...SETTINGS_TABS.map((tab) => ({
        name: `settings-${tab.replace(':', '-')}`,
        hash: `/settings?tab=${tab}`
      }))
    ]
    for (const screen of screens) {
      const text = await visit(page, screen.hash)
      await page.screenshot({ path: join(outDir, locale, `${screen.name}.png`) })
      const found = [...new Set(suspicious(locale, text))]
      report.push(`## ${screen.name} (${found.length})`, ...found.map((line) => `- ${line}`), '')
    }
    writeFileSync(join(outDir, `${locale}.md`), report.join('\n'), 'utf-8')
    expect(report.length).toBeGreaterThan(screens.length)
  })
}
