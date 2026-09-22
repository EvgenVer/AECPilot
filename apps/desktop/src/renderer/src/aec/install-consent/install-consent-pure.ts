// Что считается установкой и что о ней надо показать до подтверждения
// (задача 3.8, SPEC UR23).
//
// ПОЧЕМУ ВООБЩЕ ГЕЙТ. У донора установка скила из хаба — один щелчок по
// карточке во встроенном браузере: сообщение из страницы → `installHubSkill` →
// `POST /api/skills/hub/install`. Ни описания, ни списка инструментов, ни
// подтверждения. В их продукте это уместно: ставит тот же человек, что всё и
// настроил. У нас скил — это ИНСТРУКЦИИ, которым агент будет следовать в чужом
// проекте, а MCP-сервер — вообще ПРОЦЕСС, который запустится на этой машине.
// UR23 требует показать, что именно ставится и какие инструменты оно просит, и
// получить явное «да».
//
// ПОЧЕМУ ПЕРЕХВАТ ЗДЕСЬ, А НЕ В ИХ ЭКРАНЕ. Ровно та же причина, что у согласия
// на внешний канал (3.10): диалог, вшитый в вендорный файл, был бы правкой,
// которую следующий перенос донора молча потеряет. Перехват стоит в нашем шиме,
// через который проходит КАЖДЫЙ их вызов к ядру, — поэтому он покрывает и те их
// поверхности, которые научатся ставить скилы позже.
//
// ЧЕТЫРЕ ПУТИ, А НЕ ОДИН. Установкой здесь считается всё, что приводит к
// исполнению нового кода или новых инструкций:
//   • `POST /api/skills/hub/install`   — скил из хаба;
//   • `POST /api/skills/hub/update`    — обновление ВСЕХ установленных: код
//                                        приезжает заново, значит это тоже
//                                        установка, а не «обновление галочки»;
//   • `POST /api/mcp/servers`          — сервер, заданный командой запуска;
//   • `PUT  /api/mcp/servers`          — ТА ЖЕ установка руками: их экран MCP
//                                        правит `mcp.json` целиком и сохраняет
//                                        его одним PUT, а не POST'ом одного
//                                        сервера (D-101, задача 3F.8);
//   • `POST /api/mcp/catalog/install`  — сервер из каталога.
// Удаление, выключение и чтение не гейтятся: они работают в сторону «меньше
// прав» и без нас.

export { requiredToolsOf } from '../../../../shared/skill-frontmatter'

export type InstallKind = 'mcp-catalog' | 'mcp-server' | 'skill' | 'skill-update'

export interface InstallRequest {
  kind: InstallKind
  /** Что именно ставится — идентификатор скила или имя сервера. Пустая строка
   * у обновления всех: там нет одного предмета. */
  label: string
  /** Команда запуска процесса — только у сервера, заданного вручную. */
  command?: string
  /** Имена переменных окружения, которые получит процесс. Без значений — см.
   * `envKeysOf`. */
  envKeys?: string[]
}

/** Возвращает описание установки, если этот вызов её начинает. */
export function installBeingRequested(request: {
  path: string
  method?: string
  body?: unknown
}): InstallRequest | null {
  if ((request.method ?? 'GET').toUpperCase() !== 'POST') return null

  const path = request.path.split('?')[0].replace(/\/+$/, '')
  const body = (request.body ?? {}) as Record<string, unknown>
  const text = (value: unknown): string => (typeof value === 'string' ? value : '')

  if (path === '/api/skills/hub/install') {
    return { kind: 'skill', label: text(body.identifier) }
  }

  if (path === '/api/skills/hub/update') {
    return { kind: 'skill-update', label: '' }
  }

  if (path === '/api/mcp/catalog/install') {
    const envKeys = envKeysOf(body.env)
    return {
      kind: 'mcp-catalog',
      label: text(body.name),
      ...(envKeys.length === 0 ? {} : { envKeys })
    }
  }

  if (path === '/api/mcp/servers') {
    const args = Array.isArray(body.args) ? body.args.filter((a) => typeof a === 'string') : []
    const command = [text(body.command), ...args].join(' ').trim()
    const envKeys = envKeysOf(body.env)
    return {
      kind: 'mcp-server',
      label: text(body.name),
      ...(command === '' ? {} : { command }),
      ...(envKeys.length === 0 ? {} : { envKeys })
    }
  }

  return null
}

/** Одна запись сервера в `mcp.json` — как её пишет их редактор. */
export type McpServerEntry = Record<string, unknown>

/** Что человек узнает о сервере до запуска: имя, команда, ИМЕНА переменных. */
export interface McpServerFacts {
  name: string
  command: string
  envKeys: string[]
}

function serverFacts(name: string, entry: McpServerEntry): McpServerFacts {
  const text = (value: unknown): string => (typeof value === 'string' ? value : '')
  const args = Array.isArray(entry.args) ? entry.args.filter((a) => typeof a === 'string') : []
  const command = [text(entry.command) || text(entry.url), ...args].join(' ').trim()

  return { name, command, envKeys: envKeysOf(entry.env) }
}

/** Сравнимый след записи: всё, что определяет, ЧТО запустится и что оно
 * получит. Порядок ключей не важен — иначе перестановка строк в редакторе
 * читалась бы как новая установка. */
function fingerprint(entry: McpServerEntry): string {
  const args = Array.isArray(entry.args) ? entry.args : []
  const env =
    entry.env && typeof entry.env === 'object' ? (entry.env as Record<string, unknown>) : {}

  return JSON.stringify({
    command: entry.command ?? '',
    url: entry.url ?? '',
    args,
    env: Object.fromEntries(Object.entries(env).sort(([a], [b]) => a.localeCompare(b)))
  })
}

/** Серверы, которых в прежней записи не было или у которых изменилось то, что
 * запустится: команда, аргументы, переменные окружения.
 *
 * Удаление, выключение и переименование в сторону «меньше прав» здесь не
 * считаются установкой — как и в `installBeingRequested`. */
export function mcpServersBeingInstalled(
  previous: Record<string, McpServerEntry> | undefined,
  next: Record<string, McpServerEntry> | undefined
): McpServerFacts[] {
  const before = previous ?? {}
  const after = next ?? {}

  return Object.keys(after)
    .filter((name) => {
      const entry = after[name]
      if (!entry || typeof entry !== 'object') return false
      const known = before[name]
      return !known || fingerprint(known) !== fingerprint(entry)
    })
    .sort((a, b) => a.localeCompare(b))
    .map((name) => serverFacts(name, after[name]))
}

/** Один вопрос на сохранение: их редактор пишет ВСЮ запись сразу, и несколько
 * новых серверов в одном сохранении — обычное дело (вставили кусок чужого
 * `mcp.json`). Спрашивать по одному нельзя: хранилище показывает по вопросу за
 * раз, и второй был бы отклонён молча. */
export function mcpPutRequest(changed: McpServerFacts[]): InstallRequest | null {
  if (changed.length === 0) return null

  const commands = changed
    .filter((server) => server.command !== '')
    .map((server) => (changed.length === 1 ? server.command : `${server.name}: ${server.command}`))
  const envKeys = [...new Set(changed.flatMap((server) => server.envKeys))].sort()

  return {
    kind: 'mcp-server',
    label: changed.map((server) => server.name).join(', '),
    ...(commands.length === 0 ? {} : { command: commands.join('\n') }),
    ...(envKeys.length === 0 ? {} : { envKeys })
  }
}

/** Имена переменных окружения сервера — БЕЗ значений.
 *
 * Значение здесь — это, как правило, ключ доступа, который человек только что
 * ввёл. Показывать его в подтверждении незачем: решение принимается по тому,
 * ЧТО получит процесс, а не по тому, чему равен секрет. */
export function envKeysOf(env: unknown): string[] {
  if (!env || typeof env !== 'object' || Array.isArray(env)) return []
  return Object.keys(env as Record<string, unknown>).sort()
}
