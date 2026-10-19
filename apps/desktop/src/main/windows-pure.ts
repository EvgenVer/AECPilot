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

import { mainT } from './i18n'

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
    return { ok: false, error: mainT('window.sessionMissing') }
  }

  const id = sessionId.trim()
  if (hasControlChar(id) || id.length > 200) {
    return { ok: false, error: mainT('window.sessionBroken') }
  }

  const query: Record<string, string> = { win: SECONDARY_WINDOW_FLAG }
  if (options?.watch === true) query.watch = '1'

  return { ok: true, plan: { query, hash: `${SESSION_ROUTE_PREFIX}${encodeURIComponent(id)}` } }
}

/** Вынесенная вкладка браузера (задача 3E.5, UR31).
 *
 * Их флаг `win=browser` переключает рендерер на оболочку с одной вкладкой
 * (`BrowserPopoutShell`), а `tab` говорит, КАКУЮ вкладку показать. Номер
 * вкладки проверяется здесь по той же причине, что и номер сессии: он приходит
 * из окна, а уезжает в адрес. Пустой номер открыл бы оболочку браузера без
 * вкладки — пустое окно вместо вынесенной страницы.
 *
 * Хеш `/` — как у них: оболочка живёт на корневом маршруте. Пустой хеш здесь
 * не нужен (причина, по которой он пуст у главного окна, касалась перезагрузки
 * ГЛАВНОГО окна в прогоне e2e).
 */
export function planBrowserWindow(tabId: unknown): WindowPlanResult {
  if (typeof tabId !== 'string' || tabId.trim() === '') {
    return { ok: false, error: mainT('window.tabMissing') }
  }

  const id = tabId.trim()
  if (hasControlChar(id) || id.length > 200) {
    return { ok: false, error: mainT('window.tabBroken') }
  }

  return { ok: true, plan: { query: { win: 'browser', tab: id }, hash: SESSION_ROUTE_PREFIX } }
}

/** Плавающая лента (задача 3.24). Их флаг `win=hud` переключает рендерер на
 * узкую раскладку — композер и лента без дерева панелей; `profile` нужен
 * потому, что HUD это ПОЛНЫЙ рендерер со своим соединением, и разговор из
 * непервичного профиля иначе разрешится не тем ядром (их #82285). */
export function planHudWindow(sessionId: unknown, profile: unknown): WindowPlan {
  const query: Record<string, string> = { win: 'hud' }

  if (typeof profile === 'string' && profile.trim() !== '') query.profile = profile.trim()

  const id = typeof sessionId === 'string' ? sessionId.trim() : ''
  const hash =
    id === '' || hasControlChar(id) ? '' : `${SESSION_ROUTE_PREFIX}${encodeURIComponent(id)}`

  return { query, hash }
}

/** Собирает адрес для `loadURL` — путь разработки, где рендерер живёт на
 * сервере. В сборке те же величины уходят в `loadFile` по отдельности. */
export function windowUrl(base: string, plan: WindowPlan): string {
  const search = new URLSearchParams(plan.query).toString()
  const query = search === '' ? '' : `?${search}`
  const hash = plan.hash === '' ? '' : `#${plan.hash}`
  return `${base}${query}${hash}`
}
