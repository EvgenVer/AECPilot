// Перевод запроса донора на выбор путей в свойства нативного диалога
// (задача 3.17). Решение отделено от вызова Electron, чтобы проверяться тестом:
// перепутанные `openFile`/`openDirectory` или потерянный `multiSelections` —
// это «кнопка молча делает не то», а не падение, и тестом ловится, а глазами нет.
//
// ЗАЧЕМ ЭТО ВООБЩЕ. Их композер добавляет файлы и папки в контекст через
// `window.hermesDesktop.selectPaths`. У нас этот член шима не был проброшен, то
// есть заглушка ОТКЛОНЯЛА промис, которого никто не ждёт, — пункты «Файлы» и
// «Папка» в меню скрепки молча не делали ничего. Ровно та же поломка, что была
// у `openExternal` в задаче 3.19.

/** Их форма запроса (`HermesSelectPathsOptions`, `donor/global.d.ts`). */
export interface SelectPathsRequest {
  title?: unknown
  defaultPath?: unknown
  directories?: unknown
  multiple?: unknown
  filters?: unknown
}

export interface DialogPlan {
  title?: string
  defaultPath?: string
  properties: string[]
  filters?: Array<{ name: string; extensions: string[] }>
}

function cleanFilters(raw: unknown): Array<{ name: string; extensions: string[] }> | undefined {
  if (!Array.isArray(raw)) return undefined

  const filters = raw
    .filter(
      (entry): entry is { name: unknown; extensions: unknown } =>
        !!entry && typeof entry === 'object'
    )
    .map((entry) => ({
      name: typeof entry.name === 'string' ? entry.name : '',
      extensions: Array.isArray(entry.extensions)
        ? entry.extensions.filter((ext): ext is string => typeof ext === 'string')
        : []
    }))
    .filter((entry) => entry.name !== '' && entry.extensions.length > 0)

  return filters.length > 0 ? filters : undefined
}

/** Строит план диалога. Запрос приходит из рендерера, поэтому каждое поле
 * проверяется по типу, а не берётся на веру. */
export function planSelectPaths(request: SelectPathsRequest | undefined): DialogPlan {
  const directories = request?.directories === true
  // Умолчание их контракта — множественный выбор: меню предлагает «Файлы» и
  // «Папка» во множественном числе, и обе ветки складывают в контекст список.
  const multiple = request?.multiple !== false

  const properties = [directories ? 'openDirectory' : 'openFile']
  if (multiple) properties.push('multiSelections')

  const plan: DialogPlan = { properties }

  if (typeof request?.title === 'string' && request.title !== '') plan.title = request.title
  if (typeof request?.defaultPath === 'string' && request.defaultPath !== '') {
    plan.defaultPath = request.defaultPath
  }

  // Фильтры расширений к выбору ПАПКИ неприменимы: Windows покажет их и
  // отфильтрует содержимое, что читается как «папок нет».
  if (!directories) {
    const filters = cleanFilters(request?.filters)
    if (filters) plan.filters = filters
  }

  return plan
}
