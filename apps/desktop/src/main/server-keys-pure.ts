// Задача T35.2 (решение владельца 2026-10-20): ключи моделей на сервере задаются
// окном из трея самого сервера — ключ хранится зашифрованным там же и по сети не
// ходит. Здесь — правила без Electron: какие строки показать и что принять от окна.
// Окно и его канал — `server-keys-window.ts`.
//
// SECURITY: окну отдаются только ИМЕНА переменных и признаки «сохранён» / «перекрыт
// .env». Значение идёт в одну сторону — из окна в хранилище — и обратно не
// возвращается ни целиком, ни маской.

import { isCredentialEnvVarName, isStorableKeyName, isStorableKeyValue } from './llm-settings-pure'

export interface ServerKeyRow {
  envVar: string
  hasKey: boolean
  /** В `.env` профиля задана та же переменная — её значение сильнее нашего. */
  envOverrides: boolean
}

/** Строки окна: имена из готовых провайдеров и всё, что уже сохранено (ключ, которого
 *  не видно, нельзя удалить), без повторов и в алфавитном порядке. */
export function serverKeyRows(
  suggested: readonly (string | null)[],
  stored: readonly string[],
  envOverrides: (envVar: string) => boolean
): ServerKeyRow[] {
  const storedSet = new Set(stored)
  const names = new Set<string>()
  for (const name of [...suggested, ...stored]) {
    if (isCredentialEnvVarName(name)) names.add(name)
  }
  return [...names].sort().map((envVar) => ({
    envVar,
    hasKey: storedSet.has(envVar),
    envOverrides: envOverrides(envVar)
  }))
}

export type ServerKeySave =
  | { ok: true; envVar: string; key: string | null }
  | { ok: false; error: 'badName' | 'emptyKey' | 'badKey' }

/** Что окно прислало: `{envVar, key}`, где `key: null` — удалить. Пустой ключ — не
 *  «удалить», а ошибка ввода: удаление — отдельная кнопка. */
export function parseServerKeySave(payload: unknown): ServerKeySave {
  const { envVar, key } = (payload ?? {}) as { envVar?: unknown; key?: unknown }
  const name = typeof envVar === 'string' ? envVar.trim() : envVar
  // Удалить можно любой сохранённый ключ (и под именем, которое теперь запрещено),
  // сохранить — только под разрешённым.
  if (key === null) {
    return isCredentialEnvVarName(name)
      ? { ok: true, envVar: name, key: null }
      : { ok: false, error: 'badName' }
  }
  if (!isStorableKeyName(name)) return { ok: false, error: 'badName' }
  if (typeof key !== 'string' || key.trim() === '') return { ok: false, error: 'emptyKey' }
  const value = key.trim()
  if (!isStorableKeyValue(value)) return { ok: false, error: 'badKey' }
  return { ok: true, envVar: name, key: value }
}
