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
}

export interface NotificationPlan {
  title: string
  body: string
  silent: boolean
  /** Куда прыгнуть по щелчку. Пустая строка — уведомление не про сессию. */
  sessionId: string
  actions: Array<{ id: string; text: string }>
}

/** Пределы. Не требование системы, а граница читаемости: тост показывает
 * две-три строки, остальное всё равно не видно. */
const MAX_TITLE = 80
const MAX_BODY = 240
const MAX_ACTION_TEXT = 32
/** Windows показывает не больше пяти кнопок, macOS — одну плюс «ещё». */
const MAX_ACTIONS = 3

/** Обрезает по границе, добавляя многоточие: обрезка должна быть ВИДНА, иначе
 * оборванная на полуслове фраза читается как ошибка приложения. */
export function clampText(raw: unknown, limit: number): string {
  const value = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : ''
  if (value.length <= limit) return value
  return `${value.slice(0, limit - 1).trimEnd()}…`
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
    actions: cleanActions(request?.actions)
  }
}
