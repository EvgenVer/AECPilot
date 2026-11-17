// Задача T77 (UR55): файл, на который сослался агент, — это документ проекта
// (хранилище или подключённый источник) или чужой файл? Документ проекта
// открывается в окне документов, а оно читает файлы только по паре «корень +
// относительный путь» (`readDocument`). Здесь абсолютный путь превращается в
// такую пару; путь вне всех корней — `null`, и ссылка остаётся предпросмотру.
//
// Корни сравниваются в обоих написаниях — как записаны и после `realpath`
// (задача T71): агент мог назвать файл через соединение папок, а мог по
// настоящему адресу.

import { isAbsolute, relative, resolve } from 'node:path'

export type LocateRoot = {
  /** Корень в обоих написаниях (`projectFenceRoots`). */
  roots: readonly string[]
  /** id источника; у хранилища его нет. */
  sourceId?: string
}

export type Located = { relPath: string; sourceId?: string }

/** Относительный путь внутри корня, через `/`, или `null`, если путь снаружи. */
function inside(root: string, absPath: string): string | null {
  const rel = relative(resolve(root), resolve(absPath))
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return null
  return rel.split(/[\\/]+/).join('/')
}

/**
 * Пара «корень + путь» для абсолютного пути. Сначала источники: папка источника
 * может лежать внутри хранилища, и тогда её файл — файл источника (только для
 * чтения), а не хранилища.
 */
export function locateDocument(
  absPath: string,
  vault: readonly string[],
  sources: readonly LocateRoot[]
): Located | null {
  for (const source of sources) {
    for (const root of source.roots) {
      const rel = inside(root, absPath)
      if (rel !== null) return { relPath: rel, sourceId: source.sourceId }
    }
  }
  for (const root of vault) {
    const rel = inside(root, absPath)
    if (rel !== null) return { relPath: rel }
  }
  return null
}

/**
 * Сетевой путь (`\\сервер\папка`, `\\?\…`, `//сервер/…`). Ревью T84: ссылка агента
 * на такой путь вне проекта не доводится до `realpath` — обращение к чужому
 * серверу SMB отдаёт ему учётные данные Windows (NTLM), а текст агента может
 * направить посторонний документ или страница. Подключённый источник на сервере
 * сверяется по написанию и без этого.
 */
export function isNetworkPath(absPath: string): boolean {
  return /^[\\/]{2}/.test(absPath)
}
