// Подключение к ядру через ssh — решения без процессов (задача 3.12, SPEC UR20).
//
// ЗАЧЕМ. В сети организации у сервера с ядром обычно нет порта, открытого
// наружу, — зато есть ssh, которым инженер и так туда ходит. Тогда приложение
// поднимает ядро НА ТОЙ машине и пробрасывает его порт к себе.
//
// ЧЕГО МЫ НЕ ДЕЛАЕМ, И ЭТО ГЛАВНОЕ.
//
// 1. НЕ ЧИТАЕМ КЛЮЧИ. Ни один приватный ключ не открывается этим кодом: путь к
//    ключу, если человек его назвал, передаётся самому `ssh` (`-i`), и дальше
//    им занимается ssh. Читать `~/.ssh/id_*` мы не имеем права ни для какой
//    цели — и не читаем.
// 2. НЕ ПРАВИМ `~/.ssh/config`. Он читается, чтобы предложить список хостов,
//    которые человек уже настроил, — и только.
// 3. НЕ СПРАШИВАЕМ ПАРОЛЬ. `BatchMode=yes`: у нашего `ssh` нет терминала, и
//    приглашение ввести пароль просто повисло бы навсегда. Вместо этого —
//    внятный отказ «настройте вход по ключу».
//
// ТОКЕН НЕ ПОПАДАЕТ НИ В ОДНУ КОМАНДНУЮ СТРОКУ. Удалённое ядро надо запустить с
// заранее известным токеном, и напрашивается `hermes serve` с ним в аргументах
// или в `SetEnv`. Оба видны в списке процессов — локально или на той машине.
// Поэтому токен уходит в СТАНДАРТНЫЙ ВВОД удалённой оболочки, которая читает
// его в переменную и запускает ядро уже с ней: в `ps` не видно ни там, ни тут.

/** Один хост из `~/.ssh/config`, как он нужен экрану. */
export interface SshHostEntry {
  alias: string
  hostName: string
  user: string
  port: number | null
  identityFile: string
}

/** Ошибки ssh в их словаре (`DesktopConnectionTestResult.sshError`). */
export type SshError =
  | 'auth-failed'
  | 'hermes-not-found'
  | 'host-key-changed'
  | 'timeout'
  | 'unknown'
  | 'unreachable'
  | 'unsupported-platform'
  // Их код. Мы его не выдаём: версию ядра на той стороне мы не спрашиваем — это
  // лишний обход туда-обратно ради ответа, который всё равно придёт из самого
  // подключения. Оставлен в перечислении, потому что это ИХ словарь, и их экран
  // умеет рисовать все его значения.
  | 'update-required'

/**
 * Разбирает `~/.ssh/config` настолько, насколько нужно списку хостов.
 *
 * Разбор НАРОЧНО неполный: `Match`, `Include` и подстановки токенов вроде `%h`
 * не поддерживаются, и хосты с шаблоном (`*`, `?`) пропускаются — предлагать
 * человеку «подключиться к `*.example.org`» бессмысленно. Всё, что нам нужно, —
 * имена, которые он уже настроил; окончательное разрешение имени делает сам
 * `ssh`, и делает правильно.
 */
export function parseSshConfig(text: string): SshHostEntry[] {
  const entries: SshHostEntry[] = []
  // Список, а не одна запись: `Host a b` объявляет БЛОК, и всё, что стоит под
  // ним, относится к обоим именам. Одна «текущая» запись тихо приписала бы
  // настройки только последнему.
  let current: SshHostEntry[] = []

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#')) continue

    const match = /^(\S+)\s+(.*)$/.exec(line)
    if (!match) continue

    const keyword = match[1].toLowerCase()
    const value = match[2].trim()

    if (keyword === 'host') {
      current = []
      for (const alias of value.split(/\s+/)) {
        // Шаблон пропускаем как ИМЯ, но блок остаётся текущим: иначе строки под
        // `Host *` приписались бы предыдущему хосту.
        if (alias.includes('*') || alias.includes('?') || alias === '') continue
        const entry: SshHostEntry = {
          alias,
          hostName: alias,
          user: '',
          port: null,
          identityFile: ''
        }
        entries.push(entry)
        current.push(entry)
      }
      continue
    }

    for (const entry of current) {
      if (keyword === 'hostname') entry.hostName = value
      else if (keyword === 'user') entry.user = value
      else if (keyword === 'port') {
        const port = Number.parseInt(value, 10)
        entry.port = Number.isFinite(port) && port > 0 && port < 65536 ? port : null
      } else if (keyword === 'identityfile') entry.identityFile = value
    }
  }

  return entries
}

export function resolveSshHost(
  entries: readonly SshHostEntry[],
  alias: unknown
): SshHostEntry | null {
  if (typeof alias !== 'string' || alias.trim() === '') return null
  const wanted = alias.trim()
  return entries.find((entry) => entry.alias === wanted) ?? null
}

export interface SshTarget {
  host: string
  user: string
  port: number | null
  identityFile: string
  /** Путь к `hermes` на той машине. Пусто — надеемся на PATH. */
  remoteHermesPath: string
  /** Профиль ядра на той машине (их `HERMES_HOME`). Пусто — умолчание. */
  remoteProfile: string
}

/**
 * Годится ли строка на роль части адресата `ssh`.
 *
 * Находка D-48. Адресат — ЕДИНСТВЕННЫЙ позиционный аргумент в нашем argv, и
 * getopt разбирает его наравне с остальными: значение вида `-oProxyCommand=…`
 * OpenSSH прочтёт как локальную опцию, а не как имя машины, и выполнит чужую
 * команду здесь. `spawn` без оболочки от этого не спасает — он убирает
 * интерпретацию оболочкой, а не разбор ключей самим ssh.
 *
 * Значение приходит из настроек, но написать их может окно: `connection:save`
 * принимает `unknown` и кладёт как есть. Проверка стоит здесь, у самого места
 * сборки argv, потому что в настройках уже может лежать значение, записанное
 * до этой правки, — граница проходит там, где строка становится аргументом.
 *
 * Пробел и управляющий символ отсекаются заодно: в имени машины им делать
 * нечего, а разъехаться по аргументам они могут. `@` тоже — иначе `user@host`
 * склеится не в ту пару.
 */
function isSafeDestinationPart(value: string): boolean {
  // Дефис запрещён только ПЕРВЫМ символом: `build-server` — обычное имя.
  if (value.startsWith('-')) return false
  // eslint-disable-next-line no-control-regex -- намеренно: управляющие символы в имени машины
  return !/[\s@\x00-\x1f]/.test(value)
}

export function readSshTarget(raw: unknown): SshTarget | null {
  const value = (raw ?? {}) as Record<string, unknown>
  const host = typeof value.sshHost === 'string' ? value.sshHost.trim() : ''
  if (host === '' || !isSafeDestinationPart(host)) return null

  const user = typeof value.sshUser === 'string' ? value.sshUser.trim() : ''
  // Пустой пользователь законен — тогда ssh берёт своего; непустой обязан быть
  // именем, а не ключом.
  if (user !== '' && !isSafeDestinationPart(user)) return null

  const port =
    typeof value.sshPort === 'number' && Number.isFinite(value.sshPort) ? value.sshPort : null

  return {
    host,
    user,
    port: port !== null && port > 0 && port < 65536 ? port : null,
    identityFile: typeof value.sshKeyPath === 'string' ? value.sshKeyPath.trim() : '',
    remoteHermesPath:
      typeof value.sshRemoteHermesPath === 'string' ? value.sshRemoteHermesPath.trim() : '',
    remoteProfile: typeof value.sshRemoteProfile === 'string' ? value.sshRemoteProfile.trim() : ''
  }
}

/**
 * Аргументы `ssh` для проброса порта и запуска ядра на той стороне.
 *
 * `-N` НЕ ставится: команда нужна — она и поднимает ядро. Проброс идёт в ту же
 * сессию (`-L`), поэтому туннель живёт ровно столько, сколько живёт ядро, и
 * умирает вместе с ним. Отдельный туннель пережил бы упавшее ядро и оставил бы
 * приложение подключённым в пустоту.
 */
export function sshArgs(target: SshTarget, localPort: number, remotePort: number): string[] {
  const args = sshBaseArgs(target)
  args.push(
    '-o',
    'ExitOnForwardFailure=yes',
    '-L',
    `127.0.0.1:${localPort}:127.0.0.1:${remotePort}`
  )
  args.push(sshDestination(target), remoteCommand(target, remotePort))
  return args
}

/** Общие для всех наших вызовов `ssh` условия. */
function sshBaseArgs(target: SshTarget): string[] {
  const args = [
    // Пароль спросить некому — терминала нет; отказ лучше вечного ожидания.
    '-o',
    'BatchMode=yes',
    // Молча принять НОВЫЙ ключ хоста нельзя: это и есть та проверка, ради
    // которой ssh существует. Изменившийся ключ обязан стать ошибкой.
    '-o',
    'StrictHostKeyChecking=accept-new',
    '-o',
    'ConnectTimeout=15'
  ]

  if (target.port !== null) args.push('-p', String(target.port))
  if (target.identityFile !== '') args.push('-i', target.identityFile)

  return args
}

function sshDestination(target: SshTarget): string {
  return target.user === '' ? target.host : `${target.user}@${target.host}`
}

/**
 * Аргументы для ПРОВЕРКИ подключения.
 *
 * Проверка нарочно не поднимает ядро: у той машины один порт, и второй `hermes
 * serve` ради «проверить» отобрал бы его у живого подключения или получил бы
 * отказ «порт занят» — ответ, не имеющий отношения к вопросу. Спрашивается
 * ровно то, что человеку и нужно знать до подключения: пустил ли сервер, есть
 * ли там ядро и какое.
 */
export function sshProbeArgs(target: SshTarget): string[] {
  const args = sshBaseArgs(target)
  args.push(sshDestination(target), probeCommand(target))
  return args
}

export function probeCommand(target: SshTarget): string {
  const hermes = target.remoteHermesPath === '' ? 'hermes' : shellQuote(target.remoteHermesPath)

  // Каждая часть допускает провал (`|| true`): отсутствие ядра — это ОТВЕТ на
  // вопрос, а не сбой проверки, и остальные строки всё равно нужны.
  return [
    `echo "path=$(command -v ${hermes} || true)"`,
    `echo "platform=$(uname -s || true)"`,
    `echo "version=$(${hermes} --version 2>/dev/null | head -1 || true)"`
  ].join('; ')
}

export interface SshProbe {
  hermesPath: string
  platform: string
  version: string
}

/** Разбор построчно. Отдельная функция, потому что ответ приходит из чужой
 * оболочки: она может закончить строку и по-своему. */
function splitLines(text: string): string[] {
  return text.split(String.fromCharCode(10)).map((line) => line.replace(/\s+$/, ''))
}

export function parseSshProbe(stdout: string): SshProbe {
  const found = new Map<string, string>()

  for (const line of splitLines(stdout)) {
    const at = line.indexOf('=')
    if (at > 0) found.set(line.slice(0, at).trim(), line.slice(at + 1).trim())
  }

  return {
    hermesPath: found.get('path') ?? '',
    platform: found.get('platform') ?? '',
    version: found.get('version') ?? ''
  }
}

/**
 * Команда, которая выполнится НА ТОЙ машине.
 *
 * Токен читается из стандартного ввода в переменную — см. шапку файла: в
 * аргументах его не будет ни здесь, ни в списке процессов там.
 */
export function remoteCommand(target: SshTarget, remotePort: number): string {
  const hermes = target.remoteHermesPath === '' ? 'hermes' : shellQuote(target.remoteHermesPath)
  const home = target.remoteProfile === '' ? '' : `HERMES_HOME=${shellQuote(target.remoteProfile)} `

  return [
    'read -r AEC_TOKEN',
    `${home}HERMES_DASHBOARD_SESSION_TOKEN="$AEC_TOKEN" exec ${hermes} serve --host 127.0.0.1 --port ${remotePort} --skip-build`
  ].join('; ')
}

/** Одинарные кавычки для оболочки той машины: путь может содержать пробелы, а
 * подстановки в нём быть не должно. */
export function shellQuote(value: string): string {
  return `'${value.split("'").join(`'\\''`)}'`
}

/**
 * Что случилось, если не подключилось. Их словарь ошибок — не украшение: по
 * каждой из них человеку нужно СВОЁ действие, и «не удалось подключиться»
 * заменяет их все одним, после которого делать нечего.
 */
export function classifySshError(stderr: string): SshError {
  const text = stderr.toLowerCase()

  if (text.includes('remote host identification has changed')) return 'host-key-changed'
  if (text.includes('host key verification failed')) return 'host-key-changed'
  if (
    text.includes('permission denied') ||
    text.includes('too many authentication failures') ||
    text.includes('no supported authentication methods')
  ) {
    return 'auth-failed'
  }
  if (text.includes('timed out') || text.includes('operation timed out')) return 'timeout'
  if (
    text.includes('could not resolve hostname') ||
    text.includes('connection refused') ||
    text.includes('no route to host') ||
    text.includes('network is unreachable')
  ) {
    return 'unreachable'
  }
  // Windows на той стороне: `cmd.exe` не знает `read`, с которого начинается
  // наша команда. Это не «нет ядра» — это «сюда так зайти нельзя», и человеку
  // от этих двух ответов нужны разные действия.
  if (text.includes('not recognized as an internal')) return 'unsupported-platform'

  if (text.includes('command not found') || text.includes('no such file or directory')) {
    return 'hermes-not-found'
  }

  return 'unknown'
}

/** Что человеку делать с этой ошибкой. Текст — часть ответа, а не украшение к
 * нему: код ошибки без действия не помогает никому. */
export function sshErrorMessage(error: SshError): string {
  switch (error) {
    case 'auth-failed':
      return 'Сервер не принял вход. Нужен вход по ключу без пароля: пароль спросить негде — у подключения нет терминала.'
    case 'host-key-changed':
      return 'Ключ сервера изменился с прошлого раза. Это либо переустановка сервера, либо подмена: проверьте у администратора, прежде чем убирать старый ключ из ~/.ssh/known_hosts.'
    case 'hermes-not-found':
      return 'На той машине не нашлось ядра. Укажите полный путь к `hermes` в настройках подключения.'
    case 'timeout':
      return 'Сервер не ответил вовремя. Проверьте адрес и доступность сети.'
    case 'unreachable':
      return 'До сервера не достучаться: имя не разрешается или порт закрыт.'
    case 'unsupported-platform':
      return 'На той машине оболочка Windows, а подключение рассчитано на POSIX: нужен сервер с оболочкой вроде bash.'
    case 'update-required':
      return 'Ядро на той машине слишком старое для этого приложения — обновите его там.'
    default:
      return 'Подключиться не удалось. Подробности — в журнале приложения.'
  }
}
