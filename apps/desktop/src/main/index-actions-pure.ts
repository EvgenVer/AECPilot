// Задача 3L.5 (SPEC UR46): действия по документу — «Индексировать» и «Убрать
// из индекса» — для любого файла, источника или проекта. Здесь решается, что
// именно прислало окно и можно ли это сделать сейчас; главный процесс только
// исполняет. Отказ — значение со словами, а не исключение: окно его показывает.

import { decideGraphMark, PROJECT_SOURCE_ID } from './graph-scope-pure'
import { mainT } from './i18n'

export type IndexTarget =
  | {
      ok: true
      /** `<source>/<rel>` — так место называют `ingest` и `index-exclude`. */
      place: string
      /** Файл самого проекта: его убирает и возвращает отметка (3K). */
      project: boolean
      /** Путь внутри источника или проекта. */
      rel: string
    }
  | { error: string; ok: false }

/** Что прислало окно и не идёт ли сейчас прогон: индекс и граф пишут ту же
 *  базу, и действие посреди прогона спорило бы с ним. */
export function decideIndexTarget(
  payload: unknown,
  sourceIds: string[],
  busy: { graph: boolean; ingest: boolean }
): IndexTarget {
  const decision = decideGraphMark(payload, sourceIds)
  if (!decision.ok) return decision
  const sourceId = (payload as { sourceId: string }).sourceId
  const rel = decision.path.slice(sourceId.length + 1)
  if (rel === '') return { error: mainT('index.pickFileOrFolder'), ok: false }
  if (busy.ingest) return { error: mainT('index.waitIndexing'), ok: false }
  if (busy.graph) return { error: mainT('index.waitGraph'), ok: false }
  return { ok: true, place: decision.path, project: sourceId === PROJECT_SOURCE_ID, rel }
}

/** Перед «Индексировать» на файле источника: снять ли отметку «убран»?
 *  Файл внутри убранной ПАПКИ одним щелчком не вернуть — список держит папку
 *  целиком, и индексация ничего бы не нашла; это говорится словами. */
export function includePlan(
  place: string,
  excluded: string[]
): { error: string; ok: false } | { include: boolean; ok: true } {
  const folder = excluded.find((entry) => place.startsWith(`${entry}/`))
  if (folder !== undefined) {
    return {
      error: mainT('index.folderRemoved', folder.slice(folder.indexOf('/') + 1)),
      ok: false
    }
  }
  const include = excluded.some((entry) => entry === place || entry.startsWith(`${place}/`))
  return { include, ok: true }
}
