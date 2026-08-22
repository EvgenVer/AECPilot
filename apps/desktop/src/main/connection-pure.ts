// К какому ядру подключено приложение (задача 3.12, SPEC UR20).
//
// ЗАЧЕМ УДАЛЁННЫЙ РЕЖИМ. Ядро может стоять не на этой машине: сервер
// организации, где лежат проекты и куда пускают по адресу с токеном. Тогда наше
// приложение — окно к нему, а не хозяин процесса.
//
// ГЛАВНОЕ ПРАВИЛО ЭТОГО ФАЙЛА: ТОКЕН НЕ ПЕРЕСЕКАЕТ ГРАНИЦУ ОКНА. Он нужен
// главному процессу — тот открывает сокет и ставит заголовок; окну он не нужен
// НИКОГДА. Поэтому здесь два разных представления одной настройки: `Stored` —
// то, что лежит на диске у главного процесса, и `PublicConnection` — то, что
// отдаётся рендереру. Второе физически не содержит поля с токеном, а не
// «содержит пустое»: поле, которое нельзя забыть очистить, безопаснее поля,
// которое надо помнить очистить.
//
// ЧТО ВИДИТ ЧЕЛОВЕК ВМЕСТО ТОКЕНА. Признак «задан» и четыре последних знака.
// Этого хватает, чтобы отличить «я вставил не тот» от «я не вставил», и не
// хватает, чтобы токен утёк со скриншотом.

/** Режимы, взятые в объём. Их `cloud` исключён (SPEC HX3) вместе со входом по
 * OAuth: облака у нас нет, и предлагать вход в него значило бы обещать то,
 * чего не будет. */
export type ConnectionMode = 'local' | 'remote' | 'ssh'

export type TokenEncoding = 'none' | 'plain' | 'safe'

/** Настройка ssh-подключения. Секрета здесь нет: путь к ключу — это путь, а не
 * ключ, и в окно он ходит свободно. Токен для ssh не хранится вовсе — ядро на
 * той машине поднимаем мы и токен назначаем сами, новый на каждый раз. */
export interface SshSettings {
  host: string
  user: string
  port: number | null
  keyPath: string
  remoteHermesPath: string
  remoteProfile: string
}

export const NO_SSH: SshSettings = {
  host: '',
  user: '',
  port: null,
  keyPath: '',
  remoteHermesPath: '',
  remoteProfile: ''
}

/** То, что лежит на диске у главного процесса. */
export interface StoredConnection {
  mode: ConnectionMode
  remoteUrl: string
  /** `safe` — зашифровано хранилищем ОС; `plain` — открытым текстом по явному
   * согласию человека; `none` — токена нет. */
  tokenEncoding: TokenEncoding
  /** Зашифрованный (base64) или открытый токен. Никогда не покидает main. */
  token: string
  ssh: SshSettings
}

/** То, что видит окно. Поля с токеном здесь нет — см. шапку. */
export interface PublicConnection {
  mode: ConnectionMode
  remoteUrl: string
  remoteAuthMode: 'token'
  remoteTokenSet: boolean
  remoteTokenPreview: string | null
  /** Доступно ли шифрование хранилищем ОС на этой машине. */
  secureTokenStorage: boolean
  /** Токен лежит открытым текстом — по явному согласию, и человек об этом
   * должен видеть напоминание, а не забыть. */
  remoteTokenPlainText: boolean
  /** Переменная окружения перекрывает настройку (режим e2e). */
  envOverride: boolean
  sshHost: string
  sshUser: string
  sshPort: number | null
  sshKeyPath: string
  sshRemoteHermesPath: string
  sshRemoteProfile: string
}

export interface ConnectionInput {
  mode: ConnectionMode
  /** `undefined` — «поля не было в запросе», то есть НЕ МЕНЯТЬ. То же правило,
   * что у токена, и то же основание: экран присылает форму по частям, и стереть
   * настройку молчанием он не должен. Тогда переключение режима не заставляет
   * набирать адрес заново. */
  remoteUrl: string | undefined
  /** Пустая строка означает «не менять» — их экран не присылает токен, когда
   * человек его не трогал. Стереть токен — это `mode: 'local'` или явное
   * `clearToken`. */
  remoteToken: string
  allowPlainTextToken: boolean
  clearToken: boolean
  /** Только присланные поля — по тому же правилу. */
  ssh: Partial<SshSettings>
}

export const DEFAULT_CONNECTION: StoredConnection = {
  mode: 'local',
  remoteUrl: '',
  tokenEncoding: 'none',
  token: '',
  ssh: { ...NO_SSH }
}

/** Адрес удалённого ядра. Пустая строка — «не годится», и это ответ, а не
 * исключение: строку печатает человек, и опечатка не должна ронять экран.
 *
 * Разрешены только `http` и `https`: всё остальное (`file:`, `ws:`, `javascript:`)
 * в поле «адрес сервера» — либо ошибка, либо попытка. Схема `ws` отвергается
 * тоже, хотя сокет мы и открываем: адрес БАЗОВЫЙ, из него выводится и REST, и
 * сокет, и путать их — начало ошибки в обе стороны. */
export function normalizeRemoteUrl(raw: unknown): string {
  if (typeof raw !== 'string' || raw.trim() === '') return ''

  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return ''
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
  if (url.hostname === '') return ''

  // Путь, запрос и хвост отбрасываются: база — это схема, хост и порт. Токен,
  // случайно вставленный в адрес строкой запроса, здесь же и пропадает.
  return `${url.protocol}//${url.host}`
}

/** Адрес сокета из базового адреса. Схема меняется на `ws`/`wss` — по TLS
 * сокет обязан идти тоже по TLS, иначе токен уедет открытым. */
export function wsUrlFor(baseUrl: string, token: string): string {
  const base = normalizeRemoteUrl(baseUrl)
  if (base === '') return ''

  const scheme = base.startsWith('https://') ? 'wss://' : 'ws://'
  const host = base.slice(base.indexOf('//') + 2)
  const query = token === '' ? '' : `?token=${encodeURIComponent(token)}`

  return `${scheme}${host}/api/ws${query}`
}

/** Четыре последних знака — ровно столько, чтобы отличить «вставил не тот» от
 * «не вставил». Короткий токен не показывается вовсе: у него четыре знака это
 * почти весь токен. */
export function tokenPreview(token: string): string | null {
  if (token === '') return null
  return token.length < 12 ? '••••' : `••••${token.slice(-4)}`
}

export function readConnectionInput(raw: unknown): ConnectionInput {
  const value = (raw ?? {}) as Record<string, unknown>
  const mode = value.mode === 'remote' || value.mode === 'ssh' ? value.mode : 'local'

  return {
    mode,
    ssh: readSshSettings(value),
    remoteUrl: value.remoteUrl === undefined ? undefined : normalizeRemoteUrl(value.remoteUrl),
    remoteToken: typeof value.remoteToken === 'string' ? value.remoteToken.trim() : '',
    allowPlainTextToken: value.allowPlainTextToken === true,
    clearToken: value.clearToken === true
  }
}

/** Что отдать окну. Единственное место, где `Stored` превращается в видимое, —
 * поэтому именно здесь и только здесь решается, чего окно не увидит. */
/** Поля ssh из запроса окна. Их экран присылает их плоским списком — разбираем
 * так же плоско, чтобы не заводить перевод там, где его нет.
 *
 * Отсутствующее поле НЕ попадает в ответ: см. `ConnectionInput.remoteUrl`. */
export function readSshSettings(value: Record<string, unknown>): Partial<SshSettings> {
  const settings: Partial<SshSettings> = {}

  if (value.sshHost !== undefined) settings.host = text(value.sshHost)
  if (value.sshUser !== undefined) settings.user = text(value.sshUser)
  if (value.sshKeyPath !== undefined) settings.keyPath = text(value.sshKeyPath)
  if (value.sshRemoteHermesPath !== undefined) {
    settings.remoteHermesPath = text(value.sshRemoteHermesPath)
  }
  if (value.sshRemoteProfile !== undefined) settings.remoteProfile = text(value.sshRemoteProfile)

  if (value.sshPort !== undefined) {
    const port =
      typeof value.sshPort === 'number' && Number.isFinite(value.sshPort) ? value.sshPort : null
    settings.port = port !== null && port > 0 && port < 65536 ? port : null
  }

  return settings
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function publicConfig(
  stored: StoredConnection,
  options: { secureAvailable: boolean; envOverride: boolean; plainToken: string }
): PublicConnection {
  return {
    mode: stored.mode,
    remoteUrl: stored.remoteUrl,
    remoteAuthMode: 'token',
    remoteTokenSet: stored.tokenEncoding !== 'none',
    remoteTokenPreview: tokenPreview(options.plainToken),
    secureTokenStorage: options.secureAvailable,
    remoteTokenPlainText: stored.tokenEncoding === 'plain',
    envOverride: options.envOverride,
    sshHost: stored.ssh.host,
    sshUser: stored.ssh.user,
    sshPort: stored.ssh.port,
    sshKeyPath: stored.ssh.keyPath,
    sshRemoteHermesPath: stored.ssh.remoteHermesPath,
    sshRemoteProfile: stored.ssh.remoteProfile
  }
}

export function parseStoredConnection(raw: string): StoredConnection {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_CONNECTION }

    const value = parsed as Record<string, unknown>
    const encoding = value.tokenEncoding
    const ssh = (value.ssh ?? {}) as Record<string, unknown>
    return {
      mode: value.mode === 'remote' || value.mode === 'ssh' ? value.mode : 'local',
      remoteUrl: normalizeRemoteUrl(value.remoteUrl),
      tokenEncoding: encoding === 'safe' || encoding === 'plain' ? encoding : 'none',
      token: typeof value.token === 'string' ? value.token : '',
      ssh: {
        host: text(ssh.host),
        user: text(ssh.user),
        port: typeof ssh.port === 'number' ? ssh.port : null,
        keyPath: text(ssh.keyPath),
        remoteHermesPath: text(ssh.remoteHermesPath),
        remoteProfile: text(ssh.remoteProfile)
      }
    }
  } catch {
    return { ...DEFAULT_CONNECTION }
  }
}

export function serializeStoredConnection(stored: StoredConnection): string {
  return `${JSON.stringify(stored, null, 2)}\n`
}

/** Годится ли настройка для подключения. Отдельная функция, потому что «режим
 * удалённый, а адреса нет» — самое частое состояние экрана, и оно не ошибка, а
 * «ещё не заполнено». */
export function connectionReady(stored: StoredConnection): boolean {
  if (stored.mode === 'local') return true
  // Для ssh хватает имени машины: токен там наш собственный, а всё остальное
  // ssh возьмёт из настройки человека — он для того её и вёл.
  if (stored.mode === 'ssh') return stored.ssh.host !== ''
  return stored.remoteUrl !== '' && stored.tokenEncoding !== 'none'
}
