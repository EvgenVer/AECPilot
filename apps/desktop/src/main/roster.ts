// Роестр специалистов — обращение к ядру за списком (задачи 3C.1, 3D.4, 3D.6).
//
// ПОЧЕМУ ОТ ФАЙЛА ОСТАЛАСЬ ОДНА ФУНКЦИЯ. Создание, правка, лица, комнаты и
// рутины специалистов с задачи 3D.3 идут путём их плагина; наши обращения к
// ядру замещены и удалены задачей 3D.6. Пережил ровно тот кусок, у которого нет
// замены: список профилей, из которого главный процесс раз в минуту пишет
// снимок роестра (`ROSTER_SNAPSHOT_POLL_MS`, задача 3D.4).
//
// СНИМОК НУЖЕН ПОТОМУ, ЧТО ТОКЕНА У ИНСТРУМЕНТА НЕТ. Шлюзовый токен
// `aec-roster` не даётся сознательно (docs/history/specs/agent-roster.md §Р6, пункт 4), а
// связь «имя на экране → имя профиля» живёт в `ui_meta`, у которого одна дверь
// — шлюз. Поэтому роестр приносит инструменту тот, кто им владеет.
//
// ПОЧЕМУ RPC, А НЕ REST: `profiles.list` отдаёт `ui_meta` вместе с рядом, а по
// REST подпись пришлось бы добирать отдельным запросом на каждого специалиста.

import { parseRoster, type Specialist } from './roster-pure'

export interface RosterDeps {
  /** Вызов метода ядра. Приходит снаружи: где живёт шлюз, знает `index.ts`. */
  request: (method: string, params?: Record<string, unknown>) => Promise<unknown>
}

let deps: RosterDeps | undefined

export function configureRoster(value: RosterDeps): void {
  deps = value
}

function core(): RosterDeps {
  if (!deps) throw new Error('роестр не подключён к ядру')
  return deps
}

/** Список специалистов для снимка. Без `include_sessions`: последняя реплика
 * нужна была строке списка, а строку списка рисует их плагин. */
export async function listRoster(): Promise<Specialist[]> {
  return parseRoster(await core().request('profiles.list'))
}
