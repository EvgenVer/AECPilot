// SPEC UR44 (к UR27), задача 3J.4: SOUL нового специалиста начинается с SOUL
// главного агента — персоны инженера-конструктора КР (UR41), — а за ним идёт
// то, что собрало создание: имя, роль, протокол сообщений между агентами.
//
// ПОЧЕМУ ФАЙЛ ПОСЛЕ СОЗДАНИЯ, А НЕ ПАРАМЕТР ЗАПРОСА. Специалиста создают тремя
// путями: диалог донора (`profiles.create` по мосту, со своим `soul`), их
// страница профилей (REST `POST /api/profiles`, без `soul`) и наш IPC. Их диалог
// клонирует главный профиль, но свой `soul` тут же затирает унаследованный —
// так специалисты владельца получили английскую заготовку. Один шаг над
// SOUL.md нового профиля покрывает все три пути одинаково.
//
// Только при создании: дальше файл правит человек, и приложение его не трогает.
// Эвал не проводится — правка по решению владельца 2026-10-09 (waiver).

export const SPECIALIST_HEADING = '## Специалист'

/** SOUL главного первым, свой SOUL специалиста — под заголовком «Специалист».
 *  Уже унаследованный (повтор, клон наследника) не меняется. */
export function inheritMainSoul(soul: string, mainSoul: string): string {
  const main = mainSoul.trim()
  if (main === '' || soul.includes(main)) return soul
  const own = soul.trim()
  return own === '' ? `${main}\n` : `${main}\n\n${SPECIALIST_HEADING}\n\n${own}\n`
}

/** Имя профиля, который создаёт REST-вызов, — или `null`, если вызов не о том. */
export function createdProfileByRest(method: string, path: string, body: unknown): string | null {
  if (method !== 'POST' || path.split('?')[0] !== '/api/profiles') return null
  const name = (body as { name?: unknown } | null)?.name
  return typeof name === 'string' ? name : null
}
