// Регистрации MCP-серверов во временной копии профиля автотестов (находка
// 2026-10-21). Профиль `runtime/e2e-profile` копируется целиком, и вместе с ним
// едет блок `mcp_servers:`, записанный когда-то приложением, — с путями ЗА
// пределами копии: в профиль ручной приёмки (`runtime/dev-profile`), в проект
// человека в «Документах». Ядро стенда поднимает эти серверы сразу, до того как
// тест что-либо откроет, и они читают и пишут туда, куда тестам нельзя.
//
// ЧТО С КАЖДЫМ И ПОЧЕМУ:
//
// * `aec-sources`, `aec-rag` — привязаны к ПРОЕКТУ (`--project <project.json>`), и
//   приложение регистрирует их заново при каждом открытии проекта
//   (`main/index.ts::registerAecSourcesForProject`). До открытия проекта им в
//   копии делать нечего — убираются целиком. Подменить путь не на что: проекта
//   у копии нет, а `aec-rag` по любому поиску пишет в папку проекта
//   (`rag_index.py::write_fingerprint`, `index.db`).
// * `aec-roster` — НЕ проектный: приложение перезаписывает его только после
//   подключения к ядру (`syncRosterTool`), а ядро к этому моменту уже держит
//   старую регистрацию. Его данные — снимок роестра и дом ядра — у копии свои,
//   поэтому `--roster` и `--home` переводятся в копию ровно так, как их записало
//   бы само приложение (`register-aec-roster.mjs`). `--hermes` остаётся: это
//   исполняемый файл ядра из venv репозитория, а не данные; дом его дочернему
//   процессу задаёт `--home`. Если блок не разобрать — он убирается: приложение
//   вернёт его само, а чужой путь в копии хуже, чем отсутствующий инструмент.
//
// Модуль чистый — текст на входе, текст на выходе; запись файла остаётся за
// `core.ts::prepareProfile`. Проверка — `src/main/e2e-profile-mcp.test.ts`
// (e2e/** не входит в прогон vitest).

import { join } from 'node:path'

/** Серверы, которые приложение регистрирует заново при открытии проекта. */
export const PROJECT_BOUND_SERVERS: readonly string[] = ['aec-sources', 'aec-rag']
export const ROSTER_SERVER = 'aec-roster'
/** Имя снимка роестра в доме ядра (`register-aec-roster.mjs::ROSTER_SNAPSHOT_PATH`). */
export const ROSTER_SNAPSHOT = 'aecpilot-roster.json'

export interface McpIsolation {
  /** Новый текст `config.yaml`. Нетронутые строки совпадают байт в байт. */
  text: string
  /** Что изменено — человеческими словами, для журнала прогона. */
  changes: string[]
}

export interface ForeignPath {
  /** Номер строки, с единицы. */
  line: number
  /** Путь как он записан (без кавычек). */
  path: string
}

interface Line {
  body: string
  eol: string
}

interface Entry {
  name: string
  start: number
  /** Последняя строка записи (включительно). */
  end: number
  indent: number
  inline: string
}

const SECTION_RE = /^mcp_servers:\s*(#.*)?$/
const SECTION_INLINE_RE = /^mcp_servers:\s*(\S.*)$/
const ENTRY_RE = /^(\s+)(?:"([^"]+)"|'([^']+)'|([^\s:#'"][^:#]*?))\s*:(?:\s+(.*))?$/

function splitLines(text: string): Line[] {
  const parts = text.split(/(\r\n|\n)/)
  const lines: Line[] = []
  for (let i = 0; i < parts.length; i += 2) {
    lines.push({ body: parts[i], eol: parts[i + 1] ?? '' })
  }
  return lines
}

function joinLines(lines: Line[]): string {
  return lines.map((line) => line.body + line.eol).join('')
}

function indentOf(body: string): number {
  return body.length - body.trimStart().length
}

function isInert(body: string): boolean {
  const trimmed = body.trim()
  return trimmed === '' || trimmed.startsWith('#')
}

/** Границы секции `mcp_servers:` — `[заголовок, конец)` или `null`. */
function findSection(lines: Line[]): [number, number] | null {
  const start = lines.findIndex((line) => SECTION_RE.test(line.body))
  if (start === -1) {
    const inline = lines.find((line) => SECTION_INLINE_RE.test(line.body))
    const value = inline ? SECTION_INLINE_RE.exec(inline.body)?.[1].replace(/#.*$/, '').trim() : ''
    if (inline && !['{}', 'null', '~', ''].includes(value ?? '')) {
      // Однострочная запись — не формат приложения и не формат ядра; править её
      // построчно нельзя, а пропустить молча — значит оставить чужие пути.
      throw new Error('config.yaml: mcp_servers записан в одну строку — изолировать нечем')
    }
    return null
  }
  let end = lines.length
  for (let i = start + 1; i < lines.length; i += 1) {
    if (!isInert(lines[i].body) && indentOf(lines[i].body) === 0) {
      end = i
      break
    }
  }
  return [start, end]
}

function entriesOf(lines: Line[], from: number, to: number): Entry[] {
  let indent = -1
  for (let i = from; i < to; i += 1) {
    if (!isInert(lines[i].body)) {
      indent = indentOf(lines[i].body)
      break
    }
  }
  if (indent <= 0) return []

  const starts: { index: number; name: string; inline: string }[] = []
  for (let i = from; i < to; i += 1) {
    const body = lines[i].body
    if (isInert(body) || indentOf(body) !== indent) continue
    const match = ENTRY_RE.exec(body)
    if (!match) continue
    const name = match[2] ?? match[3] ?? match[4] ?? ''
    const inline = (match[5] ?? '').trim()
    starts.push({ index: i, name, inline: inline.startsWith('#') ? '' : inline })
  }

  return starts.map((entry, n) => {
    const limit = n + 1 < starts.length ? starts[n + 1].index : to
    let end = entry.index
    for (let i = entry.index + 1; i < limit; i += 1) {
      if (!isInert(lines[i].body) && indentOf(lines[i].body) > indent) end = i
    }
    return { name: entry.name, start: entry.index, end, indent, inline: entry.inline }
  })
}

function unquote(raw: string): string {
  const value = raw.trim()
  if (value.startsWith('"')) return JSON.parse(value) as string
  if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
    return value.slice(1, -1).replace(/''/g, "'")
  }
  return value
}

/** Разбор `[a, "b", 'c']` — JSON или плоский поток YAML из скаляров. */
function parseFlowList(raw: string): string[] | null {
  const value = raw.trim()
  if (!value.startsWith('[') || !value.endsWith(']')) return null
  try {
    const parsed: unknown = JSON.parse(value)
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) return parsed
  } catch {
    // Не JSON — ниже разбор потока YAML.
  }
  const items: string[] = []
  let current = ''
  let quote = ''
  for (const char of value.slice(1, -1)) {
    if (quote) {
      current += char
      if (char === quote) quote = ''
    } else if (char === '"' || char === "'") {
      quote = char
      current += char
    } else if (char === ',') {
      items.push(current)
      current = ''
    } else {
      current += char
    }
  }
  if (quote) return null
  if (current.trim() !== '') items.push(current)
  try {
    return items.map(unquote)
  } catch {
    return null
  }
}

interface ArgsSpan {
  first: number
  last: number
  indent: number
  args: string[]
}

/** Строки `args:` записи и сам список, или `null`, если формат не наш. */
function readArgs(lines: Line[], entry: Entry): ArgsSpan | null {
  for (let i = entry.start + 1; i <= entry.end; i += 1) {
    const match = /^(\s+)args\s*:\s*(.*)$/.exec(lines[i].body)
    if (!match) continue
    const indent = match[1].length
    const rest = match[2].trim()
    if (rest !== '') {
      const args = parseFlowList(rest)
      return args ? { first: i, last: i, indent, args } : null
    }
    const args: string[] = []
    let last = i
    for (let j = i + 1; j <= entry.end; j += 1) {
      const body = lines[j].body
      if (isInert(body)) continue
      const item = /^(\s*)-\s+(.*)$/.exec(body)
      if (!item || item[1].length < indent) break
      try {
        args.push(unquote(item[2]))
      } catch {
        return null
      }
      last = j
    }
    return args.length > 0 ? { first: i, last, indent, args } : null
  }
  return null
}

function setFlag(args: string[], flag: string, value: string): string | null {
  const index = args.indexOf(flag)
  if (index !== -1 && index + 1 < args.length) {
    const old = args[index + 1]
    args[index + 1] = value
    return old
  }
  const joined = args.findIndex((arg) => arg.startsWith(`${flag}=`))
  if (joined !== -1) {
    const old = args[joined].slice(flag.length + 1)
    args[joined] = `${flag}=${value}`
    return old
  }
  return null
}

/** Перевести `aec-roster` в копию. `null` — запись не разобрана. */
function rewriteRoster(lines: Line[], entry: Entry, profileDir: string): Line[] | null {
  if (entry.inline) return null
  const span = readArgs(lines, entry)
  if (!span) return null
  const args = [...span.args]
  const oldRoster = setFlag(args, '--roster', join(profileDir, ROSTER_SNAPSHOT))
  const oldHome = setFlag(args, '--home', profileDir)
  if (oldRoster === null || oldHome === null) return null

  const block = lines.slice(entry.start, entry.end + 1)
  const from = span.first - entry.start
  const to = span.last - entry.start
  const argsLine: Line = {
    body: `${' '.repeat(span.indent)}args: ${JSON.stringify(args)}`,
    eol: lines[span.last].eol || lines[span.first].eol
  }
  return [...block.slice(0, from), argsLine, ...block.slice(to + 1)]
}

/**
 * Убрать из `config.yaml` копии профиля регистрации, которые смотрят за её
 * пределы: проектные серверы — целиком, `aec-roster` — в копию.
 * Повторный вызов на результате ничего не меняет.
 */
export function isolateProfileMcp(configText: string, profileDir: string): McpIsolation {
  const lines = splitLines(configText)
  const section = findSection(lines)
  if (!section) return { text: configText, changes: [] }
  const [header, end] = section
  const entries = entriesOf(lines, header + 1, end)

  const changes: string[] = []
  const replaced = new Map<number, { end: number; lines: Line[] }>()
  for (const entry of entries) {
    if (PROJECT_BOUND_SERVERS.includes(entry.name)) {
      replaced.set(entry.start, { end: entry.end, lines: [] })
      changes.push(
        `mcp_servers.${entry.name}: убран — приложение регистрирует его при открытии проекта`
      )
    } else if (entry.name === ROSTER_SERVER) {
      const block = rewriteRoster(lines, entry, profileDir)
      if (block === null) {
        replaced.set(entry.start, { end: entry.end, lines: [] })
        changes.push(
          `mcp_servers.${ROSTER_SERVER}: убран — запись не разобрана, приложение вернёт её само`
        )
        continue
      }
      const before = joinLines(lines.slice(entry.start, entry.end + 1))
      if (joinLines(block) === before) continue
      replaced.set(entry.start, { end: entry.end, lines: block })
      changes.push(`mcp_servers.${ROSTER_SERVER}: --roster и --home переведены в ${profileDir}`)
    }
  }
  if (replaced.size === 0) return { text: configText, changes }

  const sectionBody: Line[] = []
  for (let i = header + 1; i < end; i += 1) {
    const swap = replaced.get(i)
    if (swap) {
      sectionBody.push(...swap.lines)
      i = swap.end
    } else {
      sectionBody.push(lines[i])
    }
  }
  // Пустая секция означала бы `mcp_servers: null`; убираем её вместе с
  // заголовком — приложение заведёт её заново при первой регистрации.
  const keepSection = sectionBody.some((line) => !isInert(line.body))
  const next = [
    ...lines.slice(0, header),
    ...(keepSection ? [lines[header], ...sectionBody] : []),
    ...lines.slice(end)
  ]
  if (!keepSection) changes.push('mcp_servers: секция опустела и убрана')
  return { text: joinLines(next), changes }
}

// --- Сторож ---------------------------------------------------------------

const DRIVE_RE = /(?<![A-Za-z0-9])[A-Za-z]:[\\/]/g
// UNC и ссылки на дом — только в начале значения: внутри пути в виде строки
// JSON двойной `\\` — обычный разделитель, а не UNC.
const TOKEN_START = String.raw`(?<=^|[\s"'\[,=])`
const UNC_RE = new RegExp(String.raw`${TOKEN_START}\\{2,4}(?=[^\s\\"'])`, 'g')
const HOME_REF_RE = new RegExp(
  String.raw`${TOKEN_START}(?:~|%[A-Za-z_]+%|\$HOME|\$\{?USERPROFILE\}?)[\\/]`,
  'g'
)
const STOP = new Set(['"', "'", ',', ']', '}'])

function readPath(body: string, from: number): string {
  let to = from
  while (to < body.length && !STOP.has(body[to])) {
    if (body[to] === '#' && /\s/.test(body[to - 1] ?? '')) break
    to += 1
  }
  return body.slice(from, to).trimEnd()
}

/** Сравнимый вид пути: один разделитель, без хвостового, без регистра. */
function normalize(path: string): string {
  const unc = /^\\{2,}/.test(path)
  const flat = path
    .replace(/[\\/]+/g, '\\')
    .replace(/\\$/, '')
    .toLowerCase()
  return unc ? `\\${flat}` : flat
}

/**
 * Абсолютные пути в `config.yaml`, которые не лежат ни под одним из
 * `allowedRoots`. Ищет пути Windows (`C:\…`, `C:/…`, в том числе в виде строки
 * JSON с двойными `\\`), UNC и ссылки на домашние каталоги (`~/`, `%VAR%\`,
 * `$HOME/`) — последние не разрешаются никогда: куда они ведут, видно только
 * в момент запуска. Адреса `https://…` путями не считаются.
 */
export function findForeignPaths(configText: string, allowedRoots: string[]): ForeignPath[] {
  const roots = allowedRoots.map(normalize)
  const allowed = (path: string): boolean => {
    const value = normalize(path)
    return roots.some((root) => value === root || value.startsWith(`${root}\\`))
  }
  const found: ForeignPath[] = []
  splitLines(configText).forEach((line, index) => {
    for (const re of [DRIVE_RE, UNC_RE]) {
      for (const match of line.body.matchAll(re)) {
        const path = readPath(line.body, match.index ?? 0)
        if (!allowed(path)) found.push({ line: index + 1, path })
      }
    }
    for (const match of line.body.matchAll(HOME_REF_RE)) {
      found.push({ line: index + 1, path: readPath(line.body, match.index ?? 0) })
    }
  })
  return found
}
