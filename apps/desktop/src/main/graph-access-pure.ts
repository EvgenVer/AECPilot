// Microsoft Graph: из чего складывается «настроено» и как это прочитать
// (задача 3E.9а, SPECIFICATION UR34).
//
// ПОЧЕМУ ЭТО ВООБЩЕ НУЖНО ЧИТАТЬ. Доступ к Graph у ядра 0.21.0 собирается из
// четырёх независимых мест, и каждое молчит, когда его нет:
//   · три переменные окружения приложения Azure AD — `GraphCredentials.from_env`
//     в `tools/microsoft_graph_auth.py` читает ТОЛЬКО окружение, в config.yaml
//     для них места нет вовсе;
//   · плагин `teams_pipeline` — без него разбор встреч не привязывается к
//     входящим уведомлениям (`_wire_teams_pipeline_runtime` в gateway/run.py
//     молча выходит);
//   · плагин `teams-platform` — без него у карточки канала Teams нет даже полей
//     для учётных данных (`_merge_platform_env_vars` берёт их из манифеста);
//   · сами каналы `msgraph_webhook` и `teams` в `platforms:` профиля.
// Настроить три из четырёх — получить тишину. Экран обязан показать, ЧЕГО не
// хватает, а не предлагать ввести секрет в пустоту.
//
// ЧИТАЕМ ТЕКСТОМ, КАК СОСЕДИ. В профиле живут чужие ключи и чужие комментарии, а
// разбора YAML в главном процессе нет намеренно (лишняя зависимость). Отсюда
// построчные читалки ниже: не нашли — отвечаем «нет», а не выдумываем.

/** Три переменные приложения Azure AD. Секрет из них один, но хранятся все три
 *  одинаково — в нашем шифрованном хранилище, а не в `.env` профиля. */
export const GRAPH_ENV_VARS = [
  'MSGRAPH_TENANT_ID',
  'MSGRAPH_CLIENT_ID',
  'MSGRAPH_CLIENT_SECRET'
] as const

export type GraphEnvVar = (typeof GRAPH_ENV_VARS)[number]

/** Плагины ядра, без которых поверхность мертва. Имена — как их печатает
 *  `hermes plugins list`, включая разницу в дефисе и подчёркивании. */
export const GRAPH_PLUGINS = {
  /** Канал Teams: адаптер Bot Framework и поля учётных данных карточки. */
  channel: 'teams-platform',
  /** Разбор встреч: привязывается к входящим уведомлениям Graph. */
  pipeline: 'teams_pipeline'
} as const

/** Каналы, которые к Graph относятся напрямую. */
export const GRAPH_CHANNELS = {
  notifications: 'msgraph_webhook',
  teams: 'teams'
} as const

const TOP_LEVEL = /^\S/

/** `key:` нужного уровня — сам ключ и, возможно, комментарий за ним.
 *  Сравнением строк, а не собранным на ходу регулярным выражением: так не
 *  появляется места, где завтра соберут шаблон из чужой строки. */
function isKeyLine(line: string, key: string, indent: string): boolean {
  const head = `${indent}${key}:`
  if (!line.startsWith(head)) return false
  const rest = line.slice(head.length).trim()
  return rest === '' || rest.startsWith('#')
}

/** Строки блока, начинающегося строкой `key:` нулевого уровня. */
function topLevelBlock(yamlText: string, key: string): string[] {
  const lines = yamlText.split('\n')
  const start = lines.findIndex((line) => isKeyLine(line, key, ''))
  if (start === -1) return []

  const block: string[] = []
  for (let i = start + 1; i < lines.length; i++) {
    if (TOP_LEVEL.test(lines[i])) break
    block.push(lines[i])
  }
  return block
}

/** Значение из строки профиля: без кавычек и без хвостового комментария.
 *  Комментарий снимается именно здесь, потому что в живом профиле он есть
 *  (`- teams_pipeline   # разбор встреч`), и без этого плагин читался бы как
 *  включённый под другим именем — то есть как выключенный. */
function readValue(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.length > 1 && /^["'].*["']$/.test(trimmed)) return trimmed.slice(1, -1)
  const comment = trimmed.indexOf(' #')
  return (comment === -1 ? trimmed : trimmed.slice(0, comment)).trim()
}

/**
 * Плагины из `plugins.enabled` профиля. Понимает обе записи: список строками
 * `- id` и поток `[a, b]` — ядро принимает обе, и читать только одну значило бы
 * иногда видеть пустой список там, где плагин включён.
 */
export function readEnabledPlugins(yamlText: string): string[] {
  const block = topLevelBlock(yamlText, 'plugins')
  const header = block.findIndex((line) => /^ {2}enabled:/.test(line))
  if (header === -1) return []

  const inline = /^ {2}enabled:\s*\[(.*)\]\s*(#.*)?$/.exec(block[header])
  if (inline) {
    return inline[1]
      .split(',')
      .map(readValue)
      .filter((id) => id !== '')
  }

  const ids: string[] = []
  for (let i = header + 1; i < block.length; i++) {
    const line = block[i]
    if (/^ {2}\S/.test(line)) break
    const item = /^\s+-\s+(.+)$/.exec(line)
    if (item) ids.push(readValue(item[1]))
  }
  return ids
}

/** Включён ли канал: `platforms.<id>.enabled: true` в профиле. Отсутствие —
 *  «выключен»: у ядра это и есть умолчание для всего, кроме своего CLI. */
export function readChannelEnabled(yamlText: string, platformId: string): boolean {
  const block = topLevelBlock(yamlText, 'platforms')
  const header = block.findIndex((line) => isKeyLine(line, platformId, '  '))
  if (header === -1) return false

  for (let i = header + 1; i < block.length; i++) {
    if (/^ {2}\S/.test(block[i])) break
    const flag = /^ {4}enabled:\s*(true|false)\s*(#.*)?$/.exec(block[i])
    if (flag) return flag[1] === 'true'
  }
  return false
}

export interface GraphReadiness {
  channels: { notifications: boolean; teams: boolean }
  plugins: { channel: boolean; pipeline: boolean }
}

/** Всё, что про готовность можно узнать из профиля, одним чтением. */
export function readGraphReadiness(yamlText: string): GraphReadiness {
  const enabled = new Set(readEnabledPlugins(yamlText))
  return {
    channels: {
      notifications: readChannelEnabled(yamlText, GRAPH_CHANNELS.notifications),
      teams: readChannelEnabled(yamlText, GRAPH_CHANNELS.teams)
    },
    plugins: {
      channel: enabled.has(GRAPH_PLUGINS.channel),
      pipeline: enabled.has(GRAPH_PLUGINS.pipeline)
    }
  }
}
