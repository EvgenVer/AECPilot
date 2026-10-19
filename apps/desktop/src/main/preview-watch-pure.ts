// Задача 3E.25 (SPEC UR22, замечание D-75): живая перезагрузка предпросмотра.
// Здесь решения без диска и без electron — чтобы каждое правило было прибито
// тестом, а не прочитано в обработчике.
//
// ГЛАВНОЕ РЕШЕНИЕ — КОМУ ВООБЩЕ МОЖНО СЛЕДИТЬ. Наблюдатель за файлом это
// настоящая возможность: окно называет путь, а главный процесс начинает читать
// с диска изменения по нему. Общего чтения файлов окну не дано намеренно, и
// «рендерер попросил» не причина (задача 4D-11, `picked-paths.ts`). Поэтому
// правило то же, что у вложений (3.13b): следим за тем, что главный процесс
// человеку САМ показал — файл внутри открытого проекта либо файл, который
// человек выбрал в нашем диалоге.
//
// ПОЧЕМУ НЕ «ЛЮБОЙ ПУТЬ, ЛИШЬ БЫ ЧИТАТЬ НЕ ДАВАЛИ». Наблюдатель не отдаёт
// содержимое, но отдаёт ФАКТЫ: существует ли файл, когда его тронули. По
// расписанию правок чужого файла узнаётся больше, чем кажется, и проверить это
// изнутри окна нельзя — значит решение принимает главный процесс.

import { isInside, resolveArtifactPath } from './artifact-files-pure'
import { mainT } from './i18n'

export function watchOutsideError(): string {
  return mainT('preview.watchOutside')
}

export type WatchDecision = { ok: true; absPath: string } | { ok: false; error: string }

/** Можно ли следить за тем, что назвало окно.
 *
 * `pickedByUser` — отдельным параметром, а не импортом: решение должно быть
 * проверяемым без состояния процесса. */
export function decideWatch(
  projectRoot: string | undefined,
  value: unknown,
  pickedByUser: (candidate: string) => boolean
): WatchDecision {
  const resolved = resolveArtifactPath(projectRoot, value)

  if (!resolved.ok) return { ok: false, error: resolved.error }
  if (!resolved.insideProject && !pickedByUser(resolved.absPath)) {
    return { ok: false, error: watchOutsideError() }
  }

  return { ok: true, absPath: resolved.absPath }
}

/** Тот же забор после `realpath`: ссылка внутри проекта, ведущая наружу, иначе
 * обошла бы лексическую проверку. Слой тот же, что у `artifacts:preview`. */
export function realPathAllowed(
  projectRoot: string | undefined,
  realPath: string,
  pickedByUser: (candidate: string) => boolean
): boolean {
  return isInside(projectRoot, realPath) || pickedByUser(realPath)
}

/** Изменился ли ИМЕННО тот файл, за которым следят.
 *
 * Наблюдатель ставится на ПАПКУ, а не на файл: редакторы и генераторы
 * сохраняют заменой (пишут рядом и переименовывают), и наблюдатель на самом
 * файле после такой замены смотрит на inode, которого больше нет. Цена — события
 * соседей, и отсекаются они здесь по имени. Регистр имени на Windows не значим.
 */
export function sameFile(watchedBase: string, changedBase: string | null): boolean {
  if (!changedBase) {
    // `fs.watch` умеет прислать событие без имени. Это «в папке что-то
    // произошло» — считаем, что наш файл тоже мог измениться: ложная
    // перерисовка дешевле пропущенной.
    return true
  }

  return process.platform === 'win32'
    ? watchedBase.toLowerCase() === changedBase.toLowerCase()
    : watchedBase === changedBase
}
