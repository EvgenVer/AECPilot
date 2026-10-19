// Язык интерфейса — электронная половина (задача T27, часть 2).
//
// Источник выбора — рендерер (`localStorage`, см. `config-client.ts`): он шлёт
// сюда `ui-language:set` при монтировании провайдера и при каждом переключении.
// Здесь значение подхватывает `i18n.ts` (в памяти) и ложится в файл в `userData`,
// рядом с остальными настройками устройства (`agent-language.json`,
// `keep-awake.json`): так меню трея и диалоги, возникшие раньше первого сообщения
// рендерера, уже говорят на языке человека, а не на умолчании.
//
// Файл — подсказка, не источник правды: рендерер при каждом старте присылает
// свой выбор заново и перекрывает его.

import { app, ipcMain } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { getUiLanguage, parseUiLanguage, setUiLanguage, type UiLanguage } from './i18n'

function statePath(): string {
  return join(app.getPath('userData'), 'ui-language.json')
}

/** Подхватывает сохранённый язык. Файла нет или он испорчен — остаётся умолчание. */
export function loadUiLanguage(): UiLanguage {
  try {
    const parsed = JSON.parse(readFileSync(statePath(), 'utf-8')) as { language?: unknown }
    setUiLanguage(parsed.language)
  } catch {
    // Первый запуск или испорченный файл — законное состояние.
  }
  return getUiLanguage()
}

function persistUiLanguage(language: UiLanguage): void {
  try {
    const path = statePath()
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify({ language }), 'utf-8')
  } catch (error: unknown) {
    // Подсказка на диске не стоит того, чтобы ронять окно.
    console.error('aecpilot: could not persist the ui language', error)
  }
}

/** Регистрирует канал языка. Звать один раз при загрузке главного модуля. */
export function registerUiLanguageIpc(): void {
  let persisted: UiLanguage | null = null

  ipcMain.handle('ui-language:set', (_event, value: unknown) => {
    // Неизвестное значение не меняет язык и не пишется на диск.
    if (parseUiLanguage(value) === null) return { language: getUiLanguage() }
    const language = setUiLanguage(value)
    if (language !== persisted) {
      persisted = language
      persistUiLanguage(language)
    }
    return { language }
  })
}
