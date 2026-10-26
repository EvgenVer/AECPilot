// Правый клик — правила без Electron (задача 3E.10, UR37).
//
// МЕНЮ РИСУЕТ ОКНО, А НЕ СИСТЕМА. Их приложение не показывает ни одного
// системного меню: разметку и подписи ведёт рендерер, поэтому меню переведено
// вместе со всем остальным. Главному процессу остаётся ровно то, чего окно
// увидеть не может — факты орфографии от Chromium, координаты жеста и сами
// глаголы правки, которые действуют на сфокусированный элемент.
//
// ПОЧЕМУ ЗДЕСЬ ПРОВЕРКИ. Всё, что приходит по этим каналам, прислал рендерер, а
// рендерер у нас недоверенная сторона (`docs/THREAT_MODEL.md`, §Trust boundaries).
// Проверки дешёвые, но без них `paste` вызывается строкой, которую никто не
// смотрел, а язык, которого нет в сборке Chromium, роняет настройку сессии
// исключением.

/** Глаголы правки, которые главный процесс соглашается выполнить. Список
 * закрытый: это те четыре, что стоят в их контракте. */
const EDIT_COMMANDS = ['copy', 'cut', 'paste', 'selectAll'] as const

export type EditCommand = (typeof EDIT_COMMANDS)[number]

export function readEditCommand(value: unknown): EditCommand | null {
  return EDIT_COMMANDS.includes(value as EditCommand) ? (value as EditCommand) : null
}

export interface SpellcheckAction {
  kind: 'add' | 'replace'
  word: string
}

/** Разбор действия орфографии. Пустое слово — это «ничего не делать», а не
 * ошибка: их меню зовёт член и на пункте, у которого слова не оказалось. */
export function readSpellcheckAction(value: unknown): SpellcheckAction | null {
  if (!value || typeof value !== 'object') return null

  const raw = value as { kind?: unknown; word?: unknown }
  const word = typeof raw.word === 'string' ? raw.word.trim() : ''

  if (word === '') return null
  if (raw.kind !== 'add' && raw.kind !== 'replace') return null

  return { kind: raw.kind, word }
}

/**
 * Языки проверки орфографии — оба сразу.
 *
 * У НАС ИХ ДВА ПО СПЕКЕ (C7: интерфейс на английском и русском), и включаются
 * оба, а не один по локали системы, как у донора. Chromium считает слово
 * ошибкой, только если его нет НИ В ОДНОМ включённом словаре, — значит
 * двуязычный текст (а он у нас обычный: русская записка с английским
 * термином) не подчёркивается целиком. Выбор одного языка по локали ОС
 * означал бы, что на английской Windows русский текст подчёркнут весь.
 *
 * Фильтр по `available` обязателен: `setSpellCheckerLanguages` с языком, которого
 * нет в этой сборке Chromium, бросает исключение. Пустой ответ значит «не
 * настраивать» — на macOS список пуст, потому что там работает проверка
 * системы и наш список ей не нужен.
 */
export const SPELLCHECK_LANGUAGES = ['ru', 'en-US'] as const

export function pickSpellCheckLanguages(available: readonly string[]): string[] {
  return SPELLCHECK_LANGUAGES.filter((language) => available.includes(language))
}
