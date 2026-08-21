// Какое окно открывается и с какими параметрами (задача 3.14).
//
// ЧТО РЕШАЕТ ЭТОТ ФАЙЛ. У донора вид окна определяется НЕ кодом главного
// процесса, а строкой запроса, которую он подставляет в адрес рендерера:
// `?win=secondary` — окно одной сессии без общей боковой панели,
// `?win=hud` — плавающая лента, `?watch=1` — окно-наблюдатель за чужой
// сессией, `?profile=…` — под каким профилем поднимать. Их рендерер читает эти
// флаги ДО маршрутизатора (`store/windows.ts`), поэтому они обязаны стоять
// перед `#`, а не внутри хеша.
//
// Здесь это переведено в две величины — параметры запроса и хеш-маршрут, —
// потому что грузить окно можно двумя способами (`loadURL` в разработке,
// `loadFile` в сборке), и оба принимают их по отдельности. Строковая склейка
// адреса дала бы третий способ ошибиться.
//
// НОМЕР СЕССИИ ПРОВЕРЯЕТСЯ ЗДЕСЬ. Он приходит из окна, а уезжает в адрес: их
// контракт прямо требует отвечать `ok:false`, если он пустой или испорчен. Без
// проверки пустой номер открыл бы окно на маршруте `#/` — то есть просто второе
// главное окно, молча и не то.

/** Их флаг вторичного окна (`store/windows.ts`, `SECONDARY_WINDOW_FLAG`). */
export const SECONDARY_WINDOW_FLAG = 'secondary'

/** Их префикс маршрута сессии (`app/routes.ts`, `SESSION_ROUTE_PREFIX`). */
const SESSION_ROUTE_PREFIX = '/'

export interface WindowPlan {
  query: Record<string, string>
  hash: string
}

export type WindowPlanResult = { ok: true; plan: WindowPlan } | { ok: false; error: string }

/** Второе полноценное окно приложения — то же самое, что первое.
 *
 * Пустой хеш здесь НАМЕРЕННО. `index.html#/` и `index.html` — не один и тот же
 * адрес: их приложение на пустом хеше грузится так же, как всегда, а с явным
 * `#/` окно в прогоне e2e перезагружалось на середине набора, унося с собой всё
 * состояние страницы. Главное окно обязано открываться ровно тем адресом,
 * которым открывалось до появления второго. */
export function planAppWindow(): WindowPlan {
  return { query: {}, hash: '' }
}

/** Управляющий символ в номере сессии не бывает законным. Проверяется кодом,
 * а не регулярным выражением: класс с экранированными кодами — лишний повод
 * ошибиться в файле, который потом никто не перечитывает. */
function hasControlChar(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) < 32) return true
  }
  return false
}

/** Окно одной сессии. `watch` — окно-наблюдатель: их рендерер поднимает сессию
 * лениво, без сборки агента, чтобы смотреть за уже идущим подзаданием. */
export function planSessionWindow(
  sessionId: unknown,
  options?: { watch?: unknown }
): WindowPlanResult {
  if (typeof sessionId !== 'string' || sessionId.trim() === '') {
    return { ok: false, error: 'номер сессии не указан' }
  }

  const id = sessionId.trim()
  if (hasControlChar(id) || id.length > 200) {
    return { ok: false, error: 'номер сессии испорчен' }
  }

  const query: Record<string, string> = { win: SECONDARY_WINDOW_FLAG }
  if (options?.watch === true) query.watch = '1'

  return { ok: true, plan: { query, hash: `${SESSION_ROUTE_PREFIX}${encodeURIComponent(id)}` } }
}

/** Собирает адрес для `loadURL` — путь разработки, где рендерер живёт на
 * сервере. В сборке те же величины уходят в `loadFile` по отдельности. */
export function windowUrl(base: string, plan: WindowPlan): string {
  const search = new URLSearchParams(plan.query).toString()
  const query = search === '' ? '' : `?${search}`
  const hash = plan.hash === '' ? '' : `#${plan.hash}`
  return `${base}${query}${hash}`
}
