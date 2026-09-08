// Язык ответов агента — электронная половина (задача 5.14). Правила и формат
// файла живут в `agent-language-pure.ts` рядом со своими тестами.
//
// Настройка ПОЛЬЗОВАТЕЛЬСКАЯ, а не проектная: она едет с человеком, а не с
// папкой проекта (SPEC G7). Поэтому файл лежит в `userData`, там же, где
// остальные настройки устройства (`keep-awake.json`, `devtools-block.json`), а
// не в `project.json`.

import { app } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import {
  type AgentLanguage,
  isAgentLanguage,
  parseAgentLanguageJson,
  serializeAgentLanguage
} from './agent-language-pure'

function statePath(): string {
  return join(app.getPath('userData'), 'agent-language.json')
}

export function loadAgentLanguage(): AgentLanguage {
  try {
    return parseAgentLanguageJson(readFileSync(statePath(), 'utf-8'))
  } catch {
    // Файла нет — язык не задан, и это законное состояние.
    return ''
  }
}

/** Возвращает язык, который в силе. Неизвестное значение приводится к «не
 * задан», а не записывается: закрытый список — часть требования. */
export function saveAgentLanguage(language: unknown): AgentLanguage {
  const value: AgentLanguage = isAgentLanguage(language) ? language : ''

  try {
    const path = statePath()
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, serializeAgentLanguage(value), 'utf-8')
  } catch (error: unknown) {
    // Настройка, которую не удалось записать, не стоит того, чтобы валить
    // окно; человек увидит прежнее значение при следующем открытии.
    console.error('aecpilot: could not persist the agent language', error)
  }

  return value
}
