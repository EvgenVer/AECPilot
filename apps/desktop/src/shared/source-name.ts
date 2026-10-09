// Имя источника, как его видит человек (задача 3J.5, SPEC UR44 к UR2).
// По умолчанию — имя конечной папки, а не полный путь: «Изыскания», а не
// «\\\\server\\share\\2024\\Нагатинская\\Изыскания». Название, данное в приложении
// (`label`), главнее; папка на диске при этом не переименовывается.

/** Имя конечной папки пути — для путей Windows и posix, сетевых и с хвостовым
 *  разделителем. Корень диска остаётся как есть («D:\\»). */
export function folderName(rootPath: string): string {
  const trimmed = rootPath.replace(/[\\/]+$/, '')
  if (trimmed === '' || /^[A-Za-z]:$/.test(trimmed)) return rootPath
  const parts = trimmed.split(/[\\/]+/).filter((part) => part !== '')
  return parts[parts.length - 1] ?? rootPath
}

/** Задача 3K (SPEC UR45): служебный источник, под которым в индексе лежат
 *  отмеченные человеком файлы самого проекта. Корень — папка проекта; в
 *  `project.json.sources` он не пишется. Id подключённых источников — UUID, и
 *  совпасть с ним не могут. */
export const PROJECT_SOURCE_ID = 'project'

export function sourceDisplayName(source: { label?: string; root_path: string }): string {
  const label = source.label?.trim()
  return label ? label : folderName(source.root_path)
}
