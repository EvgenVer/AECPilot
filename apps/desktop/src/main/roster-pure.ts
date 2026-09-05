// Роестр специалистов — разбор ответа ядра (задачи 3C.1, 3D.6).
//
// ОТ ЧЕГО ОСТАЛСЯ ЭТОТ ФАЙЛ. Раньше здесь разбирался весь ряд роестра: лицо,
// признак картинки, постоянный чат, занятость, версия наших полей, поиск,
// скрытие, имена для копии. Всё это с задачи 3D.3 рисует и хранит их плагин
// (`donor/plugins/hermes-bots`), а наш код замещён и удалён задачей 3D.6.
// Осталось ровно то, из чего состоит СНИМОК для инструмента `aec-roster`: имя
// профиля, которое уйдёт в команду, и подпись, под которой специалиста знает
// человек. Контракт снимка — `specs/agent-roster.md` §Р6.
//
// ГДЕ ЖИВЁТ ПОДПИСЬ — И ПОЧЕМУ КЛЮЧЕЙ ТРИ. Ядро хранит для клиентов свободный
// блок `ui_meta` в `profile.yaml`, то есть НА СЕРВЕРЕ. Пока роестр рисовали мы,
// подпись лежала в нашем ключе (`ui_meta.aecpilot`); их плагин пишет в свой
// (`ui_meta['hermes-bots']` — замерено в их `data.ts`, там же их собственная
// цепочка имён). Значит специалист, заведённый ДО переезда, знает своё имя по
// нашему ключу, а заведённый ПОСЛЕ — по их.
//
// Читать только свой ключ значило бы, что `@Смета` перестаёт находить
// специалиста, созданного в их поверхности: снимок принёс бы пустую подпись, и
// инструмент отозвался бы только на имя профиля (`smeta`). Отказ выглядел бы
// как «такого специалиста нет» — ровно то молчание, которое задача 3D.4
// специально учила отличать. Последним в цепочке идёт `display_name`,
// собственное поле ядра (`hermes profile rename`), — тот же хвост, что у них.

/** Наши поля в `ui_meta` — подпись специалистов, заведённых до задачи 3D.3. */
export const OUR_META_KEY = 'aecpilot'

/** Их поля в `ui_meta`. Техническое имя ключа их плагина, не надпись на экране
 * (то же исключение записано в SPEC C12). */
const THEIR_META_KEY = 'hermes-bots'

/** Строка снимка: имя профиля и подпись, под которой его знает человек. */
export interface Specialist {
  /** Имя профиля в ядре — идентификатор, а не подпись. */
  name: string
  /** Как его зовут на экране. Пусто — инструмент покажет имя профиля. */
  title: string
}

// Проверка формы имени (`isValidSpecialistName`) ушла вместе с созданием и
// удалением специалистов: писать имя в ядро отсюда больше некому. Имя, которое
// уезжает в команду, проверяет сам инструмент — `aec_roster/ask.py::check_name`,
// и делает это даже для имён, пришедших из нашего же снимка.

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** Подпись из первого ключа, который её знает. Пустая строка — не ошибка:
 * специалиста могли не назвать, и тогда его зовут по имени профиля. */
function titleOf(row: Record<string, unknown>): string {
  const meta = (row.ui_meta ?? {}) as Record<string, unknown>
  const theirs = (meta[THEIR_META_KEY] ?? {}) as Record<string, unknown>
  const ours = (meta[OUR_META_KEY] ?? {}) as Record<string, unknown>

  return (
    [text(theirs.title), text(ours.title), text(row.display_name)]
      .map((value) => value.trim())
      .find((value) => value !== '') ?? ''
  )
}

/** Один ряд ответа `profiles.list` — в строку снимка. */
export function parseSpecialist(raw: unknown): Specialist | null {
  if (typeof raw !== 'object' || raw === null) return null

  const row = raw as Record<string, unknown>
  const name = text(row.name)
  if (name === '') return null

  return { name, title: titleOf(row) }
}

export function parseRoster(answer: unknown): Specialist[] {
  const rows = (answer as { profiles?: unknown } | undefined)?.profiles
  if (!Array.isArray(rows)) return []

  return rows
    .map(parseSpecialist)
    .filter((specialist): specialist is Specialist => specialist !== null)
}
