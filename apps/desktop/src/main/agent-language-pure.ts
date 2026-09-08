// Язык ответов агента — третий уровень SPEC G7 (задача 5.14). Правила чистые,
// электронная половина живёт в `agent-language.ts`.
//
// ИСТОРИЯ, БЕЗ КОТОРОЙ ЭТОТ ФАЙЛ ВЫГЛЯДИТ ЛИШНИМ. Уровень был закрыт 26.08:
// строка про язык подставлялась в видимое поле «Характер» НАШЕГО диалога
// создания специалиста (`aec/roster/soul-language.ts`). Диалог заместил их
// плагин (3D.3), наш код удалён (3D.6) — и уровень открылся заново вместе с
// требованием. Их `create-dialog.tsx` собирает SOUL сам (`composeSoul`), про
// язык не знает и знать не должен, а поля «Характер» у него нет вовсе.
//
// РЕШЕНИЕ ВЛАДЕЛЬЦА 2026-09-08: отдельная настройка «Язык ответов агента».
// Настройка наша и видимая; строка попадает в SOUL нового специалиста ИЗ НЕЁ.
// Условие 17.08 «не мимо глаз» выполняется тем, что настройку видно и правят,
// а не тем, что строка показана в момент создания: их диалог такого места не
// имеет. Файл SOUL по-прежнему правится руками — эта строка лишь начальная.
//
// ПОЧЕМУ ПЕРЕХВАТ RPC, А НЕ ПРАВКА ИХ ДИАЛОГА. Правка поведения в вендорном
// файле не входит в пять разрешённых (AGENTS §14). Вызов же идёт через наш
// мост (`profiles.create`), и там уже стоит такая же дисциплина — `display_kind`
// снимается ровно так же и по такому же основанию.
//
// ЭВАЛ НЕ ПРОВОДИТСЯ — waiver владельца от 2026-08-17, ответственность его
// (AGENTS §9, обязательная развилка закрыта вариантом Б). Поэтому здесь ровно
// строка про язык и ничего больше: персона, тон и правила работы в waiver не
// входят и сюда не дописываются.

/** Пустая строка — «не задан», и это законное значение по умолчанию: пока
 * человек не выбрал, мы за него не выбираем. */
export const AGENT_LANGUAGES = ['', 'ru', 'en'] as const

export type AgentLanguage = (typeof AGENT_LANGUAGES)[number]

/** Как язык называется в самой строке. Название пишется НА ЭТОМ ЖЕ языке —
 * инструкция «отвечай по-русски», написанная по-английски, работает хуже.
 * Список закрытый и совпадает с языками продукта (SPEC C7). */
const LANGUAGE_RULE: Record<Exclude<AgentLanguage, ''>, string> = {
  ru: 'Отвечай пользователю по-русски. Технические термины можно оставлять на английском.',
  en: 'Reply to the user in English.'
}

export function isAgentLanguage(value: unknown): value is AgentLanguage {
  return typeof value === 'string' && (AGENT_LANGUAGES as readonly string[]).includes(value)
}

/** Строка про язык для SOUL, или `''` — если язык не задан либо незнаком.
 *
 * Пустая строка, а не английский запасной вариант: подставить «Reply in
 * English» человеку, выбравшему что-то третье, значит молча решить за него. */
export function soulLanguageLine(language: unknown): string {
  return isAgentLanguage(language) && language !== '' ? LANGUAGE_RULE[language] : ''
}

export function parseAgentLanguageJson(text: string): AgentLanguage {
  try {
    const { language } = JSON.parse(text) as { language?: unknown }
    return isAgentLanguage(language) ? language : ''
  } catch {
    // Испорченный файл — это «не задан», а не падение: настройка не та вещь,
    // ради которой стоит не запускать приложение.
    return ''
  }
}

export function serializeAgentLanguage(language: AgentLanguage): string {
  return JSON.stringify({ language }, null, 2) + '\n'
}

/**
 * Дописать строку языка в SOUL создаваемого специалиста.
 *
 * ПУСТАЯ НАСТРОЙКА НЕ ПИШЕТ НИЧЕГО — это и есть требование задачи, а не
 * оптимизация: умолчание, дописанное молча, стало бы вшитым предпочтением,
 * которого человек не выбирал (то самое «мимо глаз» из решения 17.08).
 *
 * Дважды строка не дописывается: специалиста создают и клоном другого, а
 * `composeSoul` возвращает чужой SOUL как есть, вместе с уже стоящей строкой.
 */
export function applySoulLanguage(
  method: string,
  params: Record<string, unknown>,
  line: string
): Record<string, unknown> {
  if (method !== 'profiles.create' || line === '') return params

  const soul = params.soul
  // Пустой SOUL не превращается в файл из одной строки про язык: SOUL —
  // описание специалиста, и подменять его настройкой языка мы не будем.
  if (typeof soul !== 'string' || soul.trim() === '') return params
  if (soul.includes(line)) return params

  return { ...params, soul: `${soul.replace(/\s+$/, '')}\n\n${line}` }
}
