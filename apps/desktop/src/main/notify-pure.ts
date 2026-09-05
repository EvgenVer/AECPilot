// Уведомление ОС — решения без Electron (задача 3.28).
//
// ЧТО РЕШАЕТ РЕНДЕРЕР, А ЧТО МЫ. Кому и когда показывать уведомление, решает их
// хранилище (`store/native-notifications.ts`): там переключатели по видам,
// подавление, пока окно на виду, и защита от повторов. Дублировать это здесь
// незачем. Здесь решается другое — ЧТО именно уйдёт в операционную систему.
//
// Текст уведомления приходит из ответа модели: заголовок сессии, первая строка
// ошибки, вопрос на подтверждение. Значит длина не ограничена ничем, и в
// системный тост может уехать полотно на четыре тысячи знаков — Windows его
// обрежет молча и по-своему, а на macOS уведомление просто не покажется.
// Поэтому строки режутся ЗДЕСЬ, по многоточию, и это видно тестом.

/** Их форма запроса (`HermesNotification`, `donor/global.d.ts`). */
export interface NotifyRequest {
  title?: unknown
  body?: unknown
  silent?: unknown
  kind?: unknown
  sessionId?: unknown
  tag?: unknown
  actions?: unknown
  /** Задача 3D.9. Плагинные уведомления сессии не имеют, и щелчок по ним ведёт
   * не в сессию, а по пути их хеш-роутера. */
  activate?: unknown
  /** Задача 3D.9. Рукоятка рендерера: по ней их хранилище находит колбэк,
   * зарегистрированный при показе. Через IPC ходит только строка. */
  notifyId?: unknown
}

export interface NotificationPlan {
  title: string
  body: string
  silent: boolean
  /** Куда прыгнуть по щелчку. Пустая строка — уведомление не про сессию. */
  sessionId: string
  actions: Array<{ id: string; text: string }>
  /** Путь их хеш-роутера. Пустая строка — щёлкать некуда. **Мы его НЕ
   * разбираем**: их приёмник (`use-desktop-integrations`) прогоняет строку
   * через `resolveHermesOpenPath` заново, «rather than trusting the pre-IPC
   * validation» — их слова. Наше дело донести, а не решать. */
  activate: string
  /** Пустая строка — уведомление не плагинное. */
  notifyId: string
  /** Их ключ схлопывания повторов; возвращается обратно, чтобы приёмник знал,
   * какое уведомление щёлкнули, когда `sessionId` пуст. */
  tag: string
}

/** Пределы. Не требование системы, а граница читаемости: тост показывает
 * две-три строки, остальное всё равно не видно. */
const MAX_TITLE = 80
const MAX_BODY = 240
const MAX_ACTION_TEXT = 32
/** Windows показывает не больше пяти кнопок, macOS — одну плюс «ещё». */
const MAX_ACTIONS = 3
/** Задача 3D.9. Служебные строки, не текст: обрезаются БЕЗ многоточия — оно
 * сделало бы из усечённой рукоятки другую рукоятку, которая молча ничего не
 * найдёт. Предел стоит не ради красоты, а чтобы через IPC не уезжала строка
 * произвольной длины: значения приходят из рендерера и возвращаются в него. */
const MAX_IDENTIFIER = 128
const MAX_ACTIVATE = 512

/** Обрезает по границе, добавляя многоточие: обрезка должна быть ВИДНА, иначе
 * оборванная на полуслове фраза читается как ошибка приложения. */
export function clampText(raw: unknown, limit: number): string {
  const value = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : ''
  if (value.length <= limit) return value
  return `${value.slice(0, limit - 1).trimEnd()}…`
}

/** Служебная строка: пробелы по краям снимаются, длина ограничивается, но
 * многоточие НЕ добавляется — см. `MAX_IDENTIFIER`. Слишком длинное значение
 * отбрасывается целиком, а не режется: обрезанный путь — это другой путь, и
 * приёмник ушёл бы по нему молча. */
function clampIdentifier(raw: unknown, limit: number): string {
  const value = typeof raw === 'string' ? raw.trim() : ''
  return value.length > limit ? '' : value
}

function cleanActions(raw: unknown): Array<{ id: string; text: string }> {
  if (!Array.isArray(raw)) return []

  return raw
    .filter(
      (entry): entry is { id: unknown; text: unknown } => !!entry && typeof entry === 'object'
    )
    .map((entry) => ({
      id: typeof entry.id === 'string' ? entry.id.trim() : '',
      text: clampText(entry.text, MAX_ACTION_TEXT)
    }))
    .filter((entry) => entry.id !== '' && entry.text !== '')
    .slice(0, MAX_ACTIONS)
}

/** Что уйдёт в систему. `null` — показывать нечего: уведомление без заголовка
 * это пустая рамка на экране, и лучше не показать ничего. */
export function planNotification(request: NotifyRequest | undefined): NotificationPlan | null {
  const title = clampText(request?.title, MAX_TITLE)
  if (title === '') return null

  return {
    title,
    body: clampText(request?.body, MAX_BODY),
    silent: request?.silent === true,
    sessionId: typeof request?.sessionId === 'string' ? request.sessionId : '',
    actions: cleanActions(request?.actions),
    activate: clampIdentifier(request?.activate, MAX_ACTIVATE),
    notifyId: clampIdentifier(request?.notifyId, MAX_IDENTIFIER),
    tag: clampIdentifier(request?.tag, MAX_IDENTIFIER)
  }
}
