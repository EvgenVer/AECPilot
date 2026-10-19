// Задача 3E.31 (замечание D-79, решение владельца 2026-09-09): сохранение
// правки в их панели предпросмотра. Здесь решение без диска и без electron —
// чтобы правило было прибито тестом, а не прочитано в обработчике.
//
// ПРАВИЛО ТО ЖЕ, ЧТО У СЛЕЖЕНИЯ (`preview-watch-pure.ts`), и это не совпадение:
// оба раза окно называет путь, а главный процесс отвечает своей рукой на диске.
// Пишем в файл ВНУТРИ открытого проекта либо в тот, который человек выбрал в
// нашем диалоге (`picked-paths.ts`, задача 4D-11). «Рендерер попросил» причиной
// не является: окно — это место, где рисуются чужие документы.
//
// И ОДНО ПРАВИЛО СВЕРХ ТОГО: файл обязан УЖЕ СУЩЕСТВОВАТЬ (проверка на диске, в
// обработчике). Редактор сохраняет то, что открыл, — создание файла ему не
// нужно ни разу, а «создать где угодно внутри проекта» это уже другая, большая
// возможность. Меньшее из двух и берётся.
//
// ПОЧЕМУ ОТКАЗ СВОИМИ СЛОВАМИ, а не текстом слежения: их редактор показывает
// причину человеку прямо в панели (`setSaveError` в `preview-file.tsx`), и
// «следить можно только...» в ответ на «сохранить» — это ложь о том, что он
// пытался сделать.

import { isInside, resolveArtifactPath } from './artifact-files-pure'
import { mainT } from './i18n'

export function writeOutsideError(): string {
  return mainT('preview.writeOutside')
}

export type WriteDecision = { ok: true; absPath: string } | { ok: false; error: string }

/** Можно ли писать по пути, который назвало окно.
 *
 * `pickedByUser` — параметром, а не импортом: решение должно проверяться без
 * состояния процесса. */
export function decideWrite(
  projectRoot: string | undefined,
  value: unknown,
  pickedByUser: (candidate: string) => boolean
): WriteDecision {
  const resolved = resolveArtifactPath(projectRoot, value)

  if (!resolved.ok) return { ok: false, error: resolved.error }
  if (!resolved.insideProject && !pickedByUser(resolved.absPath)) {
    return { ok: false, error: writeOutsideError() }
  }

  return { ok: true, absPath: resolved.absPath }
}

/** Тот же забор после `realpath`: ссылка внутри проекта, ведущая наружу, иначе
 * обошла бы лексическую проверку и дала бы запись в чужой файл. */
export function realPathWritable(
  projectRoot: string | undefined,
  realPath: string,
  pickedByUser: (candidate: string) => boolean
): boolean {
  return isInside(projectRoot, realPath) || pickedByUser(realPath)
}
