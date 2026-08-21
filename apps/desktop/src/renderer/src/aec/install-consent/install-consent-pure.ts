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
//   • `POST /api/mcp/catalog/install`  — сервер из каталога.
// Удаление, выключение и чтение не гейтятся: они работают в сторону «меньше
// прав» и без нас.

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

/** Инструменты, которые скил просит у агента.
 *
 * Живут во фронт-маттере `SKILL.md` — `allowed-tools:` списком или строкой
 * через запятую. Это и есть «какие инструменты требует» из UR23: скил без
 * ограничения получает всё, что есть у агента, и именно это человек должен
 * увидеть до установки, а не после.
 *
 * Разбор нарочно узкий: фронт-маттер — первый блок между `---`, и ничего
 * больше из него нам не нужно. Полноценный разбор YAML ради одного поля был бы
 * лишней зависимостью и лишним поведением. */
export function requiredToolsOf(skillMd: unknown): string[] {
  if (typeof skillMd !== 'string') return []

  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(skillMd.trimStart())
  if (!front) return []

  const inline = /^allowed-tools:[ \t]*(.+)$/m.exec(front[1])
  if (inline) {
    const value = inline[1].trim()
    if (value !== '' && !value.startsWith('#')) {
      return splitTools(value.replace(/^\[|\]$/g, ''))
    }
  }

  const block = /^allowed-tools:[ \t]*\r?\n((?:[ \t]*-[ \t]*.+\r?\n?)+)/m.exec(front[1])
  if (block) {
    return splitTools(
      block[1]
        .split(/\r?\n/)
        .map((line) => line.replace(/^[ \t]*-[ \t]*/, ''))
        .join(',')
    )
  }

  return []
}

function splitTools(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim().replace(/^["']|["']$/g, ''))
    .filter((item) => item !== '')
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
