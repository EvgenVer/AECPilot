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

/** Режимы, взятые в объём. Их `cloud` исключён (SPEC HX3); `ssh` — вторая
 * половина задачи 3.12, у него свой транспорт. */
export type ConnectionMode = 'local' | 'remote'

export type TokenEncoding = 'none' | 'plain' | 'safe'

/** То, что лежит на диске у главного процесса. */
export interface StoredConnection {
  mode: ConnectionMode
  remoteUrl: string
  /** `safe` — зашифровано хранилищем ОС; `plain` — открытым текстом по явному
   * согласию человека; `none` — токена нет. */
  tokenEncoding: TokenEncoding
  /** Зашифрованный (base64) или открытый токен. Никогда не покидает main. */
  token: string
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
}

export interface ConnectionInput {
  mode: ConnectionMode
  remoteUrl: string
  /** Пустая строка означает «не менять» — их экран не присылает токен, когда
   * человек его не трогал. Стереть токен — это `mode: 'local'` или явное
   * `clearToken`. */
  remoteToken: string
  allowPlainTextToken: boolean
  clearToken: boolean
}

export const DEFAULT_CONNECTION: StoredConnection = {
  mode: 'local',
  remoteUrl: '',
  tokenEncoding: 'none',
  token: ''
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
  const mode = value.mode === 'remote' ? 'remote' : 'local'

  return {
    mode,
    remoteUrl: normalizeRemoteUrl(value.remoteUrl),
    remoteToken: typeof value.remoteToken === 'string' ? value.remoteToken.trim() : '',
    allowPlainTextToken: value.allowPlainTextToken === true,
    clearToken: value.clearToken === true
  }
}

/** Что отдать окну. Единственное место, где `Stored` превращается в видимое, —
 * поэтому именно здесь и только здесь решается, чего окно не увидит. */
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
    envOverride: options.envOverride
  }
}

export function parseStoredConnection(raw: string): StoredConnection {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_CONNECTION }

    const value = parsed as Record<string, unknown>
    const encoding = value.tokenEncoding
    return {
      mode: value.mode === 'remote' ? 'remote' : 'local',
      remoteUrl: normalizeRemoteUrl(value.remoteUrl),
      tokenEncoding: encoding === 'safe' || encoding === 'plain' ? encoding : 'none',
      token: typeof value.token === 'string' ? value.token : ''
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
  return stored.remoteUrl !== '' && stored.tokenEncoding !== 'none'
}
