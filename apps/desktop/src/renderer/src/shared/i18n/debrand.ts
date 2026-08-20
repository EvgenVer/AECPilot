// Имя чужого продукта не показывается человеку (требование владельца
// 2026-08-20).
//
// ПОЧЕМУ ЭТО ВООБЩЕ ЕСТЬ. Интерфейс собран на коде донора, и его каталог строк
// называет их продукт 152 раза: «Starting Hermes Desktop…» на загрузке, «Hermes
// gateway is not connected» в диалоге подтверждения, «Hermes is loading a
// response» в ленте. Это наш продукт, и человек видит его имя, а не чужое.
//
// ПОЧЕМУ ПРЕОБРАЗОВАНИЕ, А НЕ СПИСОК ИЗ 152 СТРОК. Список пришлось бы сверять
// заново при каждом переносе донора, и первая же новая строка с их именем
// прошла бы молча. Проход по каталогу переписывает ЛЮБУЮ строку, включая те,
// что появятся в следующей версии; проверка `no-hermes.test.ts` держит
// результат.
//
// ЧЕГО ПРОХОД НЕ ТРОГАЕТ: ключи хранилища (`hermes-desktop-*`), атрибуты
// (`data-hermes-*`), имена их модулей и типов. Это не интерфейс — человек их не
// видит, а переименование сломало бы совместимость с их же кодом.

/** Замены по фразам, в порядке применения: длинные раньше коротких, иначе
 * «Hermes Desktop» превратится в «AECPilot Desktop». */
const PHRASES: [RegExp, string][] = [
  [/Hermes Desktop/g, 'AECPilot'],
  [/Hermes Agent/g, 'AECPilot'],
  [/Hermes Cloud/g, 'Cloud'],
  [/Hermes (backend|runtime)/g, 'agent core'],
  [/Hermes gateway/g, 'agent gateway'],
  [/Hermes/g, 'AECPilot'],
  [/HERMES_DESKTOP_/g, 'AECPILOT_'],
  [/hermes/g, 'aecpilot']
]

function debrandText(text: string): string {
  let result = text
  for (const [pattern, replacement] of PHRASES) result = result.replace(pattern, replacement)
  return result
}

/** Глубокая копия каталога с переписанными строками.
 *
 * `overrides` — ручные замены по пути ключа для случаев, где механическая
 * подстановка сочинила бы неправду: путь на диске, команда терминала, адрес
 * установщика. Их немного, и каждая названа в `en.ts`. */
export function debrandTranslations<T>(source: T, overrides: Record<string, string> = {}): T {
  const walk = (value: unknown, path: string): unknown => {
    const override = overrides[path]

    if (typeof value === 'string') {
      return override ?? debrandText(value)
    }

    if (typeof value === 'function') {
      // Функции каталога подставляют значения в строку; переписываем результат,
      // сохраняя сигнатуру. Ручная замена для функции — это готовая строка.
      const fn = value as (...args: unknown[]) => unknown
      return (...args: unknown[]) => {
        const rendered = fn(...args)
        if (typeof rendered !== 'string') return rendered
        return override ?? debrandText(rendered)
      }
    }

    if (Array.isArray(value)) {
      return value.map((item, index) => walk(item, `${path}[${index}]`))
    }

    if (value && typeof value === 'object') {
      const result: Record<string, unknown> = {}
      for (const [key, child] of Object.entries(value)) {
        result[key] = walk(child, path ? `${path}.${key}` : key)
      }
      return result
    }

    return value
  }

  return walk(source, '') as T
}

/** Слияние поверх готового каталога — то же, что делает их `defineLocale`, но
 * основой берётся НАШ каталог, а не их. Иначе непереведённый ключ русского
 * каталога снова вернул бы их английскую строку с их именем. */
export function mergeOver<T>(base: T, overrides: unknown): T {
  if (!isRecord(base) || !isRecord(overrides)) {
    return (overrides ?? base) as T
  }

  const result: Record<string, unknown> = { ...base }

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) continue
    const baseValue = result[key]
    result[key] = isRecord(baseValue) && isRecord(value) ? mergeOver(baseValue, value) : value
  }

  return result as T
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
