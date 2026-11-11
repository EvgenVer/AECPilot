// Какие вызовы заводят расписание: REST-создание (на нём шим ставит переключатель
// «помнить прошлый запуск») и рутина специалиста с доставкой в его чат (D-163).
//
// До T53.3 здесь же решалось, когда предлагать «включить расписания» (замер
// 2026-08-19: под `hermes serve` планировщик не тикал). С единым шлюзом ядра
// (решение 0017) рутины запускает его планировщик, и та часть удалена.

/** Запрос в том виде, в каком его строит `window.hermesDesktop.api`. */
export interface CronWriteRequest {
  method?: string
  path: string
}

/** Виды записи, которые заводят или включают задачу. `create` нужен шиму: на создании он
 * ставит переключатель «Расписания помнят прошлый запуск» (задача 3.5а, UR18). */
export type CronWriteKind = 'create' | 'resume'

/** Возвращает вид записи, если этот вызов заводит или включает расписание, иначе null. */
export function cronWriteKind(request: CronWriteRequest): CronWriteKind | null {
  const method = (request.method ?? 'GET').toUpperCase()
  if (method !== 'POST') return null

  // Путь может нести строку запроса (`?profile=…`) — сравниваем без неё.
  const path = request.path.split('?')[0].replace(/\/+$/, '')

  if (path === '/api/cron/jobs') return 'create'
  if (path === '/api/cron/blueprints/instantiate') return 'create'
  if (/^\/api\/cron\/jobs\/[^/]+\/resume$/.test(path)) return 'resume'

  return null
}

/** D-163 (решение владельца 2026-09-30). Результат рутины специалиста ядро
 * доставляет в его чат, но в УЖЕ открытое окно чата — только если в нём был
 * ход после открытия: владельцем сессии ядро делает окно лениво, на первом
 * ходе. Без хода результат пишется в базу, и окно видит его после переоткрытия.
 * Сказать это человеку надо, когда он заводит такую рутину. */
export function cronBotChatAdd(method: string, params: Record<string, unknown>): boolean {
  return method === 'cron.manage' && params.action === 'add' && params.deliver === 'bot-chat'
}
