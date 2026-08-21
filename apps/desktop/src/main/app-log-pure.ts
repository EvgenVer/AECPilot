// Журнал приложения — решения без диска (задача 3.29).
//
// ЗАЧЕМ ЖУРНАЛ. Падение рендерера уносит с собой окно: сообщение видно секунду,
// потом человек перезапускает приложение, и рассказать о случившемся ему нечем.
// Журнал переживает и окно, и перезапуск. Он же — единственный способ узнать,
// что происходило ночью, пока никто не смотрел.
//
// ГЛАВНОЕ ПРАВИЛО ЭТОГО ФАЙЛА: В ЖУРНАЛ НЕ ДОЛЖЕН ПОПАСТЬ ТОКЕН. Адрес шлюза
// несёт в себе `?token=…`, и до сих пор его защищало только то, что вывод жил в
// консоли разработчика. Файл на диске люди пересылают: «вот мой лог, посмотрите,
// что не так». Поэтому каждая строка проходит через `redactLogLine`, и это не
// перестраховка, а условие, при котором журнал вообще можно включать.

import { redactSecrets } from './hermes-rest-pure'

/** Сколько строк отдавать экрану «последние строки журнала». Их оверлей
 * показывает хвост, а не файл целиком. */
export const RECENT_LINES = 200

/** Потолок файла. За ним журнал начинается заново, а прежний остаётся рядом
 * как `.1`: приложение, которое пишет в один файл вечно, однажды займёт диск. */
export const LOG_MAX_BYTES = 2 * 1024 * 1024

/** Что вырезается из строки перед записью.
 *
 * Каждое правило отвечает конкретному месту, где секрет мог бы просочиться:
 * адрес шлюза с токеном в запросе, переменная окружения с токеном сессии,
 * заголовок авторизации. Ключи поставщиков (`sk-…`, `ghp_…`) ловит второй слой
 * в `redactLogLine` — он же гасит токен, напечатанный без имени поля. */
const SECRET_RULES: Array<[RegExp, string]> = [
  [/([?&](?:token|access_token|api_key|apikey)=)[^&\s"']+/gi, '$1***'],
  [
    /((?:HERMES_[A-Z_]*(?:TOKEN|KEY|SECRET)|AEC_[A-Z_]*(?:TOKEN|KEY|SECRET))\s*[=:]\s*)\S+/g,
    '$1***'
  ],
  [/((?:Authorization|X-Api-Key)\s*:\s*)(?:Bearer\s+|Basic\s+|Token\s+)?\S+/gi, '$1***']
]

/** Обезвреживает строку журнала. Два слоя, и оба нужны:
 *
 * 1. Прицельные правила выше — `token=…`, переменная окружения, заголовок
 *    авторизации: они знают ИМЯ поля и потому не портят соседний текст.
 * 2. `redactSecrets` из `hermes-rest-pure` — та же защита, что уже стоит на
 *    сообщениях об ошибках REST: гасит длинные строки высокой энтропии. Она
 *    ловит то, чего первый слой поймать не может, — токен, напечатанный БЕЗ
 *    имени поля (а `serveHandle.token` в главном процессе именно такая строка).
 *
 * Цена второго слоя — длинный шестнадцатеричный хеш в журнале тоже станет
 * «[скрыто]». Это дешевле утёкшего токена. */
export function redactLogLine(text: string): string {
  let out = text
  for (const [pattern, replacement] of SECRET_RULES) out = out.replace(pattern, replacement)
  return redactSecrets(out)
}

/** Одна строка журнала: время, уровень, текст. Время в ISO — журнал читают
 * не только здесь и не только сегодня, а местный формат заставляет гадать. */
export function formatLine(level: string, text: string, at: string): string {
  const clean = redactLogLine(text).replace(/\r?\n/g, ' ⏎ ').trim()
  return `${at} ${level.toUpperCase().padEnd(5)} ${clean}\n`
}

/** Как аргументы `console.*` превращаются в текст. `Error` разворачивается со
 * стеком: без стека запись «TypeError: x is not a function» бесполезна ровно
 * тогда, когда она нужнее всего. */
export function textOfArgs(args: readonly unknown[]): string {
  return args
    .map((value) => {
      if (typeof value === 'string') return value
      if (value instanceof Error) return `${value.name}: ${value.message}\n${value.stack ?? ''}`
      try {
        return JSON.stringify(value)
      } catch {
        return String(value)
      }
    })
    .join(' ')
}

/** Их форма сообщения об упавшем рендерере (`reportRendererError`). */
export interface RendererErrorReport {
  label?: unknown
  boundary?: unknown
  message?: unknown
  componentStack?: unknown
}

/** Ограничение на стек компонентов. Он приходит из окна и бывает на сотни
 * строк; в журнал нужна верхушка — та, что называет упавший компонент. */
const MAX_STACK_CHARS = 2000

function asText(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.slice(0, limit).trim() : ''
}

/** Строка о падении рендерера. `null` — сообщать не о чем: пустой отчёт в
 * журнале только мешает искать настоящий. */
export function formatRendererError(report: RendererErrorReport | undefined): string | null {
  const message = asText(report?.message, 500)
  if (message === '') return null

  const window = asText(report?.label, 40) || 'main'
  const boundary = asText(report?.boundary, 60) || 'unlabeled'
  const stack = asText(report?.componentStack, MAX_STACK_CHARS)

  return `renderer crashed [${window}/${boundary}] ${message}${stack === '' ? '' : ` | ${stack}`}`
}

/** Хвост файла. Пустые строки в конце отбрасываются, иначе экран показывает
 * пустоту там, где ждут последнюю запись. */
export function tailLines(content: string, limit = RECENT_LINES): string[] {
  const lines = content.split(/\r?\n/)
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines.slice(-limit)
}
