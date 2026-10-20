// Задачи T33/T34 (SPEC UR25, AC11): проект на серверной машине, открытый с клиента.
//
// КАНАЛ «КЛИЕНТ → СЕРВЕР» — рабочая папка ядра. Клиент зовёт RPC ядра
// `config.set {key: 'cwd', value: <папка на сервере>}`: ядро само проверяет, что папка
// есть на ЕГО диске, и записывает `terminal.cwd` в свой config.yaml (их
// `methods_config_set.py::_set_cwd`). Серверный процесс (роль `server`) раз в несколько
// секунд читает этот ключ у своего ядра (`config.get {key: 'project'}`) и, увидев новую
// папку, открывает проект У СЕБЯ — регистрация наших MCP-расширений, сканирование и
// индекс идут по местным для сервера путям. Записи конфига ядра с клиента не нужно, а
// ключи и пути сервера клиент не видит вовсе (T33: «вместо записи в config.yaml на диске»).
// Рабочая папка агента = папка проекта — это и так верно для каждой сессии проекта.
//
// КАНАЛ «СЕРВЕР → КЛИЕНТ» — файл `<проект>/.aecpilot/server-state.json`: какой проект
// сервер держит открытым, кто сканирует и чем кончился последний скан. Клиент читает
// его файловым API ядра (`/api/fs/read-text`), тем же, которым открывает документы
// (3.13b). Сканирование живёт на сервере и идёт при закрытом клиенте (T34).
//
// ПРОСЬБЫ КЛИЕНТА (T35.1) — файл `<проект>/.aecpilot/server-request.json`, записанный
// файловым API ядра (`/api/fs/write-text`): «подключи источник» и «проиндексируй».
// У клиентской установки нет ни `aec-rag`, ни дисков сервера, поэтому и то и другое
// делает сервер — своей проверкой источника и своим запуском индексации; итог просьбы
// и ход индексации он кладёт в `server-state.json`. Доверие не шире прежнего: держатель
// токена и так пишет и читает любой файл через то же API ядра.

export const SERVER_STATE_FILE = 'server-state.json'
export const SERVER_REQUEST_FILE = 'server-request.json'

export type ServerRequest =
  | { id: string; op: 'add-source'; rootPath: string; confirmed: boolean }
  | { id: string; op: 'ingest'; full: boolean }

export interface ServerRequestResult {
  id: string
  ok: boolean
  errors: string[]
  /** Подключение источника: предупреждения, которые человек должен подтвердить. */
  needsConfirm?: string[]
  at: string
}

/** Ход индексации на сервере — то, что окну клиента нужно для индикатора. */
export interface ServerIngestState {
  running: boolean
  error: string | null
  progress: unknown
  lastReport: unknown
}

export interface ServerScanState {
  /** ISO-время окончания последнего скана. */
  at: string
  ok: boolean
  error?: string
  /** Отчёт скана как есть (`ScanReportEnvelope` сервера) — окно клиента рисует его так же. */
  envelope?: unknown
}

export interface ServerState {
  /** Папка проекта, которую сервер держит открытой. */
  project: string
  /** Имя машины-хозяина сканирования. */
  host: string
  activatedAt: string
  scanning: boolean
  lastScan: ServerScanState | null
  /** T35.1: итог последней просьбы клиента. */
  lastRequest?: ServerRequestResult | null
  /** T35.1: индексация, запущенная по просьбе клиента. */
  ingest?: ServerIngestState | null
}

/** Путь на машине сервера. Разделитель берётся из самого пути: сервер — Windows, но
 *  его файловое API отвечает и прямыми слешами. */
export function joinRemote(base: string, ...parts: string[]): string {
  const sep = base.includes('\\') ? '\\' : '/'
  const trimmed = base.replace(/[\\/]+$/, '')
  return [trimmed, ...parts].join(sep)
}

/** Сравнение путей сервера: регистр и разделитель не различают одну папку (Windows). */
export function sameRemotePath(a: string, b: string): boolean {
  const norm = (value: string): string =>
    value
      .replace(/[\\/]+/g, '/')
      .replace(/\/+$/, '')
      .toLowerCase()
  return norm(a) === norm(b)
}

/** Рабочая папка ядра из ответа `config.get {key: 'project'}` (их `_cfg_get_project`:
 *  `terminal.cwd`, а без него — папка запуска ядра). Только абсолютный путь. Ключ
 *  `full` здесь НЕ годится: он отдаёт весь config.yaml с ключом API без маски. */
export function projectCwdFromAnswer(answer: unknown): string | null {
  if (typeof answer !== 'object' || answer === null) return null
  const cwd = (answer as { cwd?: unknown }).cwd
  if (typeof cwd !== 'string') return null
  const value = cwd.trim()
  return /^(?:[A-Za-z]:[\\/]|\/|\\\\)/.test(value) ? value : null
}

export function parseServerState(text: string): ServerState | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const record = parsed as Record<string, unknown>
  if (typeof record.project !== 'string' || typeof record.host !== 'string') return null
  const last = record.lastScan
  let lastScan: ServerScanState | null = null
  if (typeof last === 'object' && last !== null) {
    const scan = last as Record<string, unknown>
    if (typeof scan.at === 'string' && typeof scan.ok === 'boolean') {
      lastScan = {
        at: scan.at,
        ok: scan.ok,
        ...(typeof scan.error === 'string' ? { error: scan.error } : {}),
        ...(scan.envelope !== undefined ? { envelope: scan.envelope } : {})
      }
    }
  }
  let lastRequest: ServerRequestResult | null = null
  const request = record.lastRequest
  if (typeof request === 'object' && request !== null) {
    const value = request as Record<string, unknown>
    if (typeof value.id === 'string' && typeof value.ok === 'boolean') {
      lastRequest = {
        id: value.id,
        ok: value.ok,
        errors: Array.isArray(value.errors)
          ? value.errors.filter((item): item is string => typeof item === 'string')
          : [],
        ...(Array.isArray(value.needsConfirm)
          ? {
              needsConfirm: value.needsConfirm.filter(
                (item): item is string => typeof item === 'string'
              )
            }
          : {}),
        at: typeof value.at === 'string' ? value.at : ''
      }
    }
  }
  let ingest: ServerIngestState | null = null
  if (typeof record.ingest === 'object' && record.ingest !== null) {
    const value = record.ingest as Record<string, unknown>
    ingest = {
      running: value.running === true,
      error: typeof value.error === 'string' ? value.error : null,
      progress: value.progress ?? null,
      lastReport: value.lastReport ?? null
    }
  }
  return {
    project: record.project,
    host: record.host,
    activatedAt: typeof record.activatedAt === 'string' ? record.activatedAt : '',
    scanning: record.scanning === true,
    lastScan,
    lastRequest,
    ingest
  }
}

const REQUEST_ID = /^[A-Za-z0-9-]{1,64}$/
const ABSOLUTE = /^(?:[A-Za-z]:[\\/]|\/|\\\\)/

/** Просьба клиента, прочитанная сервером; всё, что не узнано, — `null` (не выполняется). */
export function parseServerRequest(text: string): ServerRequest | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const record = parsed as Record<string, unknown>
  if (typeof record.id !== 'string' || !REQUEST_ID.test(record.id)) return null
  if (record.op === 'add-source') {
    const rootPath = typeof record.rootPath === 'string' ? record.rootPath.trim() : ''
    return ABSOLUTE.test(rootPath)
      ? { id: record.id, op: 'add-source', rootPath, confirmed: record.confirmed === true }
      : null
  }
  if (record.op === 'ingest') return { id: record.id, op: 'ingest', full: record.full === true }
  return null
}

export function serializeServerRequest(request: ServerRequest): string {
  return `${JSON.stringify(request, null, 2)}\n`
}

/** Источники проекта из `project.json` сервера — для списка в окне клиента. */
export function sourcesFromProjectJson(
  text: string
): { id: string; root_path: string; added_at: string; label?: string }[] {
  try {
    const parsed = JSON.parse(text) as { sources?: unknown }
    if (!Array.isArray(parsed.sources)) return []
    return parsed.sources.flatMap((source: unknown) => {
      if (typeof source !== 'object' || source === null) return []
      const {
        id,
        root_path: rootPath,
        added_at: addedAt,
        label
      } = source as Record<string, unknown>
      if (typeof id !== 'string' || typeof rootPath !== 'string') return []
      return [
        {
          id,
          root_path: rootPath,
          added_at: typeof addedAt === 'string' ? addedAt : '',
          ...(typeof label === 'string' && label !== '' ? { label } : {})
        }
      ]
    })
  } catch {
    return []
  }
}

export function serializeServerState(state: ServerState): string {
  return `${JSON.stringify(state, null, 2)}\n`
}

/** Имя проекта из его `project.json`, прочитанного на сервере. */
export function projectNameFromJson(text: string): string | null {
  try {
    const parsed = JSON.parse(text) as { name?: unknown }
    return typeof parsed.name === 'string' && parsed.name.trim() !== '' ? parsed.name : null
  } catch {
    return null
  }
}

/** `project.json` с новым именем — остальное как было (имя, введённое на клиенте при
 *  создании проекта на сервере: сервер создаёт его с именем папки). */
export function renameProjectJson(text: string, name: string): string | null {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>
    if (typeof parsed !== 'object' || parsed === null) return null
    return `${JSON.stringify({ ...parsed, name }, null, 2)}\n`
  } catch {
    return null
  }
}

/** Путь документа из цитаты на машине сервера — от корня источника (если цитата его
 *  назвала) или от проекта. `rel` пришёл из текста агента, поэтому абсолютный путь и
 *  `..` отвергаются (`null`), как у местного `resolveVaultContentRel`: цитата не может
 *  увести за пределы проекта и его источников. */
export function remoteDocumentPath(
  vaultPath: string,
  rel: string,
  sourceRoot: string | null
): string | null {
  if (/^(?:[A-Za-z]:|[\\/])/.test(rel)) return null
  const parts = rel.split(/[\\/]+/).filter((part) => part !== '' && part !== '.')
  if (parts.length === 0 || parts.includes('..')) return null
  return joinRemote(sourceRoot ?? vaultPath, ...parts)
}

/** Корень источника `sourceId` из `project.json` сервера. Путь источника может быть
 *  относительным к проекту. */
export function sourceRootFromProjectJson(
  text: string,
  vaultPath: string,
  sourceId: string
): string | null {
  try {
    const parsed = JSON.parse(text) as { sources?: unknown }
    if (!Array.isArray(parsed.sources)) return null
    for (const source of parsed.sources) {
      if (typeof source !== 'object' || source === null) continue
      const { id, root_path: path } = source as { id?: unknown; root_path?: unknown }
      if (id !== sourceId || typeof path !== 'string') continue
      return /^(?:[A-Za-z]:[\\/]|\/|\\\\)/.test(path)
        ? path
        : joinRemote(vaultPath, ...path.split(/[\\/]+/).filter(Boolean))
    }
    return null
  } catch {
    return null
  }
}
