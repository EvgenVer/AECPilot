// Роестр специалистов — разбор и решения без обращений (задача 3C.1, SPEC UR27).
//
// ЧТО ТАКОЕ СПЕЦИАЛИСТ. Профиль ядра с именем, ролью и обликом: «Нормоконтроль»,
// «Смета», «Электрика», ГИП. Никакой новой сущности под этим нет — профиль у нас
// работает с фазы 1, роестр даёт ему лицо и имя. Контракт целиком —
// `specs/agent-roster.md`.
//
// ГДЕ ЖИВУТ НАШИ ПОЛЯ. Ядро хранит для клиентов свободный блок `ui_meta` в
// `profile.yaml` — то есть НА СЕРВЕРЕ, и потому одинаковый на всех машинах,
// подключённых к этому ядру. Их плагин пишет туда под своим именем
// (`ui_meta['hermes-bots']`), мы — под своим (`ui_meta.aecpilot`). Общий блок на
// двоих означал бы, что чужое обновление затирает наши поля, а мы — их.

/** Наши поля в `ui_meta`. Всё остальное в этом блоке — чужое, и мы его не
 * трогаем: запись «ключ в ключ» (ядро сливает по ключам) сохраняет соседей. */
export const OUR_META_KEY = 'aecpilot'

/** Геометрическое лицо: форма и цвет. Картинка хранится отдельно
 * (`profiles.set_asset`), потому что в `ui_meta` она не влезет — там предел
 * 64 КБ на весь блок, и он едет с каждым обновлением списка. */
export interface SpecialistFace {
  shape: 'circle' | 'square' | 'hex' | 'diamond'
  color: string
}

export interface Specialist {
  /** Имя профиля в ядре — идентификатор, а не подпись. */
  name: string
  /** Как его зовут на экране. Пусто — показываем имя профиля. */
  title: string
  role: string
  description: string
  isDefault: boolean
  model: string
  provider: string
  face: SpecialistFace | null
  hasAvatar: boolean
  hidden: boolean
  /** Постоянный чат специалиста (задача 3C.4). Здесь — только чтение. */
  chatSessionId: string
  /** Последняя реплика для строки списка. */
  preview: string
  previewAt: string
}

export const DEFAULT_FACE: SpecialistFace = { shape: 'circle', color: '#5B8DEF' }

const SHAPES: SpecialistFace['shape'][] = ['circle', 'square', 'hex', 'diamond']

/**
 * Имя профиля годится в путь и в имя каталога.
 *
 * Правило строже необходимого нарочно: имя уезжает в сегмент URL и в имя папки
 * на диске машины ядра, а приходит оно из поля ввода. Разрешать здесь всё, что
 * стерпит файловая система, значит однажды получить `..` в пути.
 */
export function isValidSpecialistName(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value)
}

/** Подпись человеку. Пустая строка — не ошибка: специалиста могли не назвать. */
export function displayNameOf(specialist: Pick<Specialist, 'name' | 'title'>): string {
  return specialist.title.trim() === '' ? specialist.name : specialist.title.trim()
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function readFace(raw: unknown): SpecialistFace | null {
  if (typeof raw !== 'object' || raw === null) return null

  const value = raw as { shape?: unknown; color?: unknown }
  const shape = SHAPES.find((known) => known === value.shape)
  const color = text(value.color)

  // Цвет уезжает в стиль — значит он должен быть цветом, а не строкой из
  // чужих данных. Принимается только `#rgb`/`#rrggbb`.
  if (!shape || !/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(color)) return null

  return { shape, color }
}

/** Один ряд ответа `profiles.list` — в нашу форму. */
export function parseSpecialist(raw: unknown): Specialist | null {
  if (typeof raw !== 'object' || raw === null) return null

  const row = raw as Record<string, unknown>
  const name = text(row.name)
  if (name === '') return null

  const meta = (row.ui_meta ?? {}) as Record<string, unknown>
  const ours = (meta[OUR_META_KEY] ?? {}) as Record<string, unknown>
  const last = (row.last_session ?? {}) as Record<string, unknown>

  return {
    name,
    title: text(ours.title),
    role: text(ours.role),
    description: text(row.description),
    isDefault: row.is_default === true,
    model: text(row.model),
    provider: text(row.provider),
    face: readFace(ours.face),
    hasAvatar: row.has_avatar === true,
    hidden: ours.hidden === true,
    chatSessionId: text(ours.chat),
    preview: text(last.preview),
    previewAt: text(last.updated_at)
  }
}

export function parseRoster(answer: unknown): Specialist[] {
  const rows = (answer as { profiles?: unknown } | undefined)?.profiles
  if (!Array.isArray(rows)) return []

  return rows
    .map(parseSpecialist)
    .filter((specialist): specialist is Specialist => specialist !== null)
}

/** Поля, которые мы отправляем в `ui_meta`. Отсутствующее поле не посылается
 * вовсе: ядро сливает по ключам, и `undefined` затёр бы чужое значение на
 * другой машине, где его успели поставить. */
export function metaPatch(input: {
  title?: string
  role?: string
  face?: SpecialistFace | null
  hidden?: boolean
  chat?: string
}): Record<string, unknown> {
  const ours: Record<string, unknown> = {}

  if (input.title !== undefined) ours.title = input.title.trim()
  if (input.role !== undefined) ours.role = input.role.trim()
  if (input.hidden !== undefined) ours.hidden = input.hidden
  if (input.chat !== undefined) ours.chat = input.chat
  // `null` в поле лица — это «убрать», и ядро понимает именно `null`.
  if (input.face !== undefined) ours.face = input.face

  return { [OUR_META_KEY]: ours }
}

/** Три исхода сохранения, а не два.
 *
 * Их же тесты настаивают на различии: старое ядро, которое не умеет `ui_meta`, —
 * это НЕ отказ. Настройка сохранена здесь и будет видна на этой машине; человеку
 * надо сказать именно это, а не «не удалось». */
export type SaveOutcome = 'server' | 'local-only' | 'refused'

export function saveOutcome(answer: unknown): SaveOutcome {
  if (typeof answer !== 'object' || answer === null) return 'local-only'

  const applied = (answer as { applied?: unknown }).applied
  if (typeof applied !== 'object' || applied === null) return 'local-only'

  const flag = (applied as { ui_meta?: unknown }).ui_meta
  if (flag === true) return 'server'
  if (flag === false) return 'local-only'

  return 'local-only'
}

/** Поиск по роестру: по видимому имени и по имени профиля, порядок сохраняется.
 * Пустой запрос возвращает ТОТ ЖЕ массив — их урок: новая ссылка на каждый
 * набор символов перерисовывает список целиком. */
export function searchRoster(roster: Specialist[], query: string): Specialist[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return roster

  return roster.filter(
    (specialist) =>
      displayNameOf(specialist).toLowerCase().includes(needle) ||
      specialist.name.toLowerCase().includes(needle) ||
      specialist.role.toLowerCase().includes(needle)
  )
}

/** Кого показывать. Скрытые прячутся, пока человек не попросит показать их
 * (задача 3C.8); сам переключатель имеет смысл, только если скрытые есть. */
export function visibleRoster(roster: Specialist[], showHidden: boolean): Specialist[] {
  return showHidden ? roster : roster.filter((specialist) => !specialist.hidden)
}

export function hasHidden(roster: Specialist[]): boolean {
  return roster.some((specialist) => specialist.hidden)
}

/**
 * Можно ли удалить.
 *
 * Профиль по умолчанию — не «один из»: на нём стоит всё, что не назначено
 * другому, и удалив его, человек остаётся без агента вовсе. Возвращает причину
 * отказа или `null`.
 */
export function refuseSpecialistDeletion(specialist: Specialist | undefined): string | null {
  if (!specialist) return 'Такого специалиста нет'
  if (specialist.isDefault) {
    return 'Это специалист по умолчанию — на нём держится всё, что не поручено другим. Его нельзя удалить.'
  }
  return null
}

/** Имя для дубля: `смета` → `смета-2`, `смета-2` → `смета-3`. Число берётся не
 * из имени, а из того, что уже занято: два дубля подряд не должны спорить. */
export function duplicateName(source: string, taken: readonly string[]): string {
  const used = new Set(taken)
  const base = /-(\d+)$/.test(source) ? source.replace(/-(\d+)$/, '') : source

  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}-${n}`
    if (!used.has(candidate)) return candidate
  }

  return `${base}-${Date.now()}`
}
