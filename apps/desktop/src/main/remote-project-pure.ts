// Задачи T33/T34 (SPEC UR25, AC11): проект на серверной машине, открытый с клиента.
//
// КАНАЛ «КЛИЕНТ → СЕРВЕР» — рабочая папка ядра. Клиент зовёт RPC ядра
// `config.set {key: 'cwd', value: <папка на сервере>}`: ядро само проверяет, что папка
// есть на ЕГО диске, и записывает `terminal.cwd` в свой config.yaml (их
// `methods_config_set.py::_set_cwd`). Серверный процесс (роль `server`) раз в несколько
// секунд читает этот ключ у своего ядра (`config.get {key: 'full'}`) и, увидев новую
// папку, открывает проект У СЕБЯ — регистрация наших MCP-расширений, сканирование и
// индекс идут по местным для сервера путям. Записи конфига ядра с клиента не нужно, а
// ключи и пути сервера клиент не видит вовсе (T33: «вместо записи в config.yaml на диске»).
// Рабочая папка агента = папка проекта — это и так верно для каждой сессии проекта.
//
// КАНАЛ «СЕРВЕР → КЛИЕНТ» — файл `<проект>/.aecpilot/server-state.json`: какой проект
// сервер держит открытым, кто сканирует и чем кончился последний скан. Клиент читает
// его файловым API ядра (`/api/fs/read-text`), тем же, которым открывает документы
// (3.13b). Сканирование живёт на сервере и идёт при закрытом клиенте (T34).

export const SERVER_STATE_FILE = 'server-state.json'

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
  return {
    project: record.project,
    host: record.host,
    activatedAt: typeof record.activatedAt === 'string' ? record.activatedAt : '',
    scanning: record.scanning === true,
    lastScan
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
