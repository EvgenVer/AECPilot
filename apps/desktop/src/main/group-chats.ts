// Переписка комнат: маленький файл рядом с приложением (задача 3C.6).
//
// ПОЧЕМУ НЕ В ПОЛЯХ ПРОФИЛЯ, где живёт сама комната. В `ui_meta` предел 64 КБ
// на весь блок, и он едет с КАЖДЫМ обновлением роестра — растущий транскрипт
// сломал бы список специалистов, а потом и запись комнат. Состав комнаты мал и
// принадлежит специалистам; переписка велика и принадлежит этому экрану.
//
// ЧТО ИЗ-ЗА ЭТОГО ЧЕСТНО СКАЗАТЬ: комнаты человек увидит и за другим
// компьютером с тем же ядром, а вот показанную здесь ленту — нет. Сказанное при
// этом не теряется: у каждого участника его сторона разговора лежит в его
// сессии комнаты на сервере.
//
// Тот же приём хранения, что у `session-projects.ts` и `recents.ts`.

import { app } from 'electron'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { GroupTurn } from './group-pure'

type Store = Record<string, GroupTurn[]>

function storePath(): string {
  return join(app.getPath('userData'), 'group-chats.json')
}

/** Разбор отдельно от чтения: порченый файл — это пустая переписка, а не
 * упавшее приложение. */
export function parseGroupChats(raw: string): Store {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (typeof parsed !== 'object' || parsed === null) return {}

  const store: Store = {}
  for (const [id, turns] of Object.entries(parsed as Record<string, unknown>)) {
    if (!Array.isArray(turns)) continue
    store[id] = turns
      .filter((turn): turn is Record<string, unknown> => typeof turn === 'object' && turn !== null)
      .map((turn) => ({
        from: typeof turn.from === 'string' ? turn.from : '',
        text: typeof turn.text === 'string' ? turn.text : ''
      }))
      .filter((turn) => turn.text !== '')
  }
  return store
}

function load(): Store {
  try {
    return parseGroupChats(readFileSync(storePath(), 'utf-8'))
  } catch {
    return {}
  }
}

function save(store: Store): void {
  const target = storePath()
  mkdirSync(dirname(target), { recursive: true })
  // Через временный файл: обрыв записи не должен превращать переписку всех
  // комнат в половину файла.
  const tmpPath = `${target}.tmp-${process.pid}`
  writeFileSync(tmpPath, JSON.stringify(store, null, 2), 'utf-8')
  try {
    renameSync(tmpPath, target)
  } catch (error: unknown) {
    rmSync(tmpPath, { force: true })
    throw error
  }
}

export function loadTranscript(roomId: string): GroupTurn[] {
  return load()[roomId] ?? []
}

export function saveTranscript(roomId: string, turns: GroupTurn[]): void {
  const store = load()
  if (turns.length === 0) delete store[roomId]
  else store[roomId] = turns
  save(store)
}
