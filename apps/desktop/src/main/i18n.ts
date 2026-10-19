// Язык интерфейса в главном процессе (задача T27, часть 2).
//
// Рендерер хранит выбор человека в `localStorage` (`renderer/.../config-client.ts`)
// и сообщает его сюда по IPC `ui-language:set` — при монтировании провайдера и при
// каждом переключении. Главный процесс помнит значение в памяти и (см.
// `ui-language.ts`) в файле рядом с остальными настройками устройства, чтобы
// первые окна и меню трея, возникшие до того, как рендерер что-то прислал, уже
// говорили на нужном языке.
//
// МОДУЛЬ ЧИСТЫЙ — без `electron` и без файловой системы: его импортируют и
// чистые модули с правилами, и их тесты. По умолчанию — русский (SPEC C7), и
// тесты, которые проверяют русский текст ошибок, остаются как были.
//
// ЧТО СЮДА НЕ ПОПАДАЕТ. Только то, что видит человек: диалоги, меню трея,
// ошибки, которые окно показывает как есть. Строки журнала, сообщения для
// разработчика и всё, что читает МОДЕЛЬ (промпты, SOUL, описания инструментов,
// примечания инструментов), остаются как есть: их язык — не язык интерфейса.

import { mainCatalog, type MainCatalogKey } from './i18n-catalog'

export type UiLanguage = 'en' | 'ru'

export const DEFAULT_UI_LANGUAGE: UiLanguage = 'ru'

/** `en`, `en-US` → `en`; `ru`, `ru-RU` → `ru`; всё остальное → `null`. */
export function parseUiLanguage(value: unknown): UiLanguage | null {
  if (typeof value !== 'string') return null
  const tag = value.trim().toLowerCase()
  if (tag === 'en' || tag.startsWith('en-') || tag.startsWith('en_')) return 'en'
  if (tag === 'ru' || tag.startsWith('ru-') || tag.startsWith('ru_')) return 'ru'
  return null
}

let active: UiLanguage = DEFAULT_UI_LANGUAGE
const listeners = new Set<(language: UiLanguage) => void>()

export function getUiLanguage(): UiLanguage {
  return active
}

/** Меняет язык. Неизвестное значение игнорируется (остаётся прежний язык).
 * Возвращает язык, который в силе. Слушатели зовутся только при настоящей смене. */
export function setUiLanguage(value: unknown): UiLanguage {
  const next = parseUiLanguage(value)
  if (next === null || next === active) return active
  active = next
  for (const listener of [...listeners]) {
    try {
      listener(next)
    } catch (error: unknown) {
      // Слушатель — меню трея, подпись окна: его сбой не должен ронять смену языка.
      console.error('aecpilot: ui-language listener failed', error)
    }
  }
  return active
}

/** Подписка на смену языка (меню трея пересобирается). Возвращает отписку. */
export function onUiLanguageChange(listener: (language: UiLanguage) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

type ArgsOf<K extends MainCatalogKey> = (typeof mainCatalog.ru)[K] extends (
  ...args: infer A
) => string
  ? A
  : []

/** Строка каталога на текущем языке: `mainT('common.noProject')`. Ключ, которого
 * нет на текущем языке, берётся из английского, затем из русского. */
export function mainT<K extends MainCatalogKey>(key: K, ...args: ArgsOf<K>): string {
  return translateMain(active, key, ...args)
}

/** То же для явно названного языка — для тестов и для случая, когда язык нужен
 * не текущий. */
export function translateMain<K extends MainCatalogKey>(
  language: UiLanguage,
  key: K,
  ...args: ArgsOf<K>
): string {
  const entry = (mainCatalog[language][key] ?? mainCatalog.en[key] ?? mainCatalog.ru[key]) as
    string | ((...a: unknown[]) => string)
  return typeof entry === 'function' ? entry(...(args as unknown[])) : entry
}
