// Провайдеры без ключа в выборе модели (задача 3F.D3, D-109, решение владельца —
// «подписывать и не давать сохранить»).
//
// Их выбор модели показывает весь каталог ядра, а флаг `authenticated` в
// `model.options` ядро ставит всем подряд — отличить «есть ключ» от «нет» по нему
// нельзя. Поэтому ключ смотрится по каталогу переменных `/api/env`: у провайдера
// есть поле-пароль и ни одно не задано — ключа нет. «Задано» — это ИЛИ строка в
// `.env` профиля (`is_set` ядро считает только по файлу), ИЛИ ключ в нашем
// шифрованном хранилище: по правилу R2 ключи, введённые у нас, лежат там и
// доходят до ядра окружением процесса, а `.env` их не видит. Без второго
// источника все настоящие ключи пометились бы «нет ключа». Провайдеры, у которых поля-
// пароля нет вовсе (OAuth, цепочка AWS, Vertex), не помечаются: вход у них не
// ключом. Локальные серверы не помечаются никогда — ключ им не нужен, даже если
// каталог его предлагает.
//
// Всё здесь — на нашей стороне моста: их `ModelPicker` не правится (правка вне
// пяти разрешённых, AGENTS §14).

export type EnvCatalog = Record<
  string,
  { is_set?: boolean; is_password?: boolean; provider?: string } | null | undefined
>

const LOCAL_PROVIDERS = new Set(['lmstudio', 'ollama', 'custom'])

export const NO_KEY_MARK = 'нет ключа'

function isLocal(slug: string): boolean {
  return LOCAL_PROVIDERS.has(slug) || slug.startsWith('custom:')
}

/** `stored` — имена переменных, у которых ключ лежит в нашем хранилище. */
export function providersWithoutKey(
  env: EnvCatalog | null | undefined,
  stored: ReadonlySet<string> = new Set()
): Set<string> {
  const needKey = new Set<string>()
  const keyed = new Set<string>()
  for (const [envVar, row] of Object.entries(env ?? {})) {
    if (!row?.provider || !row.is_password) continue
    needKey.add(row.provider)
    if (row.is_set || stored.has(envVar)) keyed.add(row.provider)
  }
  return new Set([...needKey].filter((slug) => !keyed.has(slug) && !isLocal(slug)))
}

interface ProviderRow {
  slug?: string
  name?: string
}

/** Ответ `model.options` с пометкой в видимом имени. Остальное не трогается:
 *  выбор по-прежнему идёт по `slug`. */
export function markProvidersWithoutKey<T>(options: T, missing: Set<string>): T {
  const providers = (options as { providers?: ProviderRow[] } | null)?.providers
  if (!Array.isArray(providers) || missing.size === 0) return options
  return {
    ...options,
    providers: providers.map((row) =>
      row?.slug && missing.has(row.slug)
        ? { ...row, name: `${row.name || row.slug} — ${NO_KEY_MARK}` }
        : row
    )
  }
}

/** Провайдер, который запись профиля собирается сохранить, — или null. */
export function providerBeingSaved(method: string, params: Record<string, unknown>): string | null {
  if (method !== 'profiles.configure' && method !== 'profiles.create') return null
  const provider = typeof params.provider === 'string' ? params.provider.trim() : ''
  return provider || null
}

/** Текст отказа: их экран показывает его своим уведомлением об ошибке. */
export function noKeyRefusal(provider: string): string {
  return `У провайдера ${provider} нет ключа — добавьте его в Настройках → Ключи.`
}
