// Что написано в шапке `SKILL.md` (задачи 3.8 и 3.8а).
//
// Скил — это инструкции, которым агент будет следовать. Перед тем как человек
// решит, доверять им, он должен увидеть три вещи: как скил называется, что он о
// себе говорит и какие инструменты просит. Всё три лежат во фронт-маттере —
// первом блоке между `---`.
//
// ЖИВЁТ В `shared/`, ПОТОМУ ЧТО ЧИТАТЕЛЕЙ ДВА. Гейт установки из хаба работает в
// окне (`aec/install-consent`), а доверие скилам проекта — в главном процессе
// (`main/project-skills`), и оба задают файлу один и тот же вопрос. Две копии
// разбора разошлись бы на первой же правке.
//
// РАЗБОР НАРОЧНО УЗКИЙ: три поля, и никакого YAML целиком. Полноценный разбор
// ради трёх строк — это зависимость и поведение, которых мы не просили.

/** Первый блок между `---`, если он есть. */
function frontmatter(source: string): string | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source.trimStart())
  return match ? match[1] : null
}

function scalar(front: string, key: string): string {
  const match = new RegExp(`^${key}:[ \\t]*(.+)$`, 'm').exec(front)
  if (!match) return ''
  return match[1].trim().replace(/^["']|["']$/g, '')
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim().replace(/^["']|["']$/g, ''))
    .filter((item) => item !== '')
}

export function skillNameOf(source: unknown, fallback = ''): string {
  if (typeof source !== 'string') return fallback
  const front = frontmatter(source)
  const name = front === null ? '' : scalar(front, 'name')
  return name === '' ? fallback : name
}

export function skillDescriptionOf(source: unknown): string {
  if (typeof source !== 'string') return ''
  const front = frontmatter(source)
  return front === null ? '' : scalar(front, 'description')
}

/** Инструменты, которые скил просит у агента.
 *
 * Пустой список означает не «ничего не просит», а «не ограничивает себя» — и
 * тот, кто это показывает, обязан сказать именно так. */
export function requiredToolsOf(source: unknown): string[] {
  if (typeof source !== 'string') return []

  const front = frontmatter(source)
  if (front === null) return []

  const inline = /^allowed-tools:[ \t]*(.+)$/m.exec(front)
  if (inline) {
    const value = inline[1].trim()
    if (value !== '' && !value.startsWith('#')) {
      return splitList(value.replace(/^\[|\]$/g, ''))
    }
  }

  const block = /^allowed-tools:[ \t]*\r?\n((?:[ \t]*-[ \t]*.+\r?\n?)+)/m.exec(front)
  if (block) {
    return splitList(
      block[1]
        .split(/\r?\n/)
        .map((line) => line.replace(/^[ \t]*-[ \t]*/, ''))
        .join(',')
    )
  }

  return []
}
