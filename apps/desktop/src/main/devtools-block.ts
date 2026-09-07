// Запрет F12 — электронная половина (задача 3E.11, UR35). Правила и формат
// файла — в `devtools-block-pure.ts` рядом с их тестами.
//
// Настройка ПЕРЕЖИВАЕТ ПЕРЕЗАПУСК по той же причине, что и «не засыпать»
// (3.18): выключатель, который надо щёлкать каждый запуск, — это не настройка,
// а напоминание о себе.

import { app } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { parseDevtoolsBlocked, serializeDevtoolsBlocked } from './devtools-block-pure'

let blocked = false

function statePath(): string {
  return join(app.getPath('userData'), 'devtools-block.json')
}

/** Читает настройку с диска в память. Зовётся один раз при старте. */
export function restoreDevtoolsBlocked(): boolean {
  try {
    blocked = parseDevtoolsBlocked(readFileSync(statePath(), 'utf-8'))
  } catch {
    blocked = false
  }
  return blocked
}

export function isDevtoolsBlocked(): boolean {
  return blocked
}

export function setDevtoolsBlocked(on: boolean): void {
  blocked = on

  try {
    const path = statePath()
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, serializeDevtoolsBlocked(on), 'utf-8')
  } catch (error: unknown) {
    // Настройка уже в силе в этом запуске; несохранённая — переживёт меньше,
    // чем стоило бы падение переключателя.
    console.error('aecpilot: could not persist the devtools block', error)
  }
}
