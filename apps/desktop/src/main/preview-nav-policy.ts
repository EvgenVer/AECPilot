// Куда встроенной странице позволено уходить (задача 3E.4, риск R22).
//
// ЧТО ЗДЕСЬ ЗАЩИЩАЕТСЯ. Агент открывает страницу сам, читает её, а страница
// пишет её автор — не мы и не человек. Отравленная страница уводит агента
// дальше: ссылкой, редиректом, формой. Опасен не сам переход, а то, что вместе
// с ним уезжает АДРЕС, а в адрес можно положить всё, что агент к этому моменту
// знает. Поэтому граница проходит по ИСТОЧНИКУ (схема + хост + порт): пока
// переход внутри того же источника, наружу ничего не утекает; как только
// источник другой — решение принимает человек.
//
// ПОЧЕМУ ЭТО В ГЛАВНОМ ПРОЦЕССЕ, А НЕ В ОКНЕ. Окно у нас недоверенная сторона
// (`docs/SECURITY.md` §Trust boundaries), а страница живёт внутри окна. Правило,
// стоящее рядом с тем, от чего оно защищает, защищает не от него.
//
// ПРАВИЛО НАПИСАНО ДО ВОЗМОЖНОСТИ, а не после: тега `webview` у нас ещё нет, он
// включается задачей 3E.5, и она же подключает это правило к событию
// `will-navigate` гостя. Порядок «сначала возможность, потом защита» запрещён
// правилом фазы (PLAN §«R21 и R22»), потому что ровно на этом основании
// исключение HX13 и стояло.
//
// РАСХОЖДЕНИЕ С БУКВОЙ SPEC — НАЗВАНО, А НЕ СПРЯТАНО. R22 говорит «выход за
// пределы СТРАНИЦЫ, которую агент открыл сам». По букве это значит спрашивать
// на каждом переходе, включая канонизацию адреса и редирект на `https` — то
// есть диалог сразу после открытия, каждый раз. Такое подтверждение человек
// перестаёт читать через день, и защита превращается в кнопку «да». Поэтому
// умолчание — граница по источнику, а буквальная строгость оставлена рабочей и
// проверенной: выбор между ними принадлежит владельцу (см. TASKS, задача 3E.4).

export type NavStrictness = 'origin' | 'page'

export type NavDecision =
  | { action: 'allow' }
  | { action: 'ask'; reason: 'other-origin' | 'other-page' | 'nothing-opened' }
  | { action: 'deny'; reason: 'not-web' }

/** Схемы, которым позволено жить во встроенной странице. Всё остальное —
 * `file:`, `data:`, `javascript:`, `blob:` — это не переход, а побег: страница
 * оказалась бы в чужом источнике или с доступом к диску. */
const WEB_SCHEME = /^https?:$/i

/** Пустая страница гостя. Тег `webview` начинает с неё, и считать её переходом
 * значило бы спрашивать человека до того, как что-то вообще открылось. */
const BLANK = new Set(['about:blank', 'about:blank#blocked'])

function originOf(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (!WEB_SCHEME.test(parsed.protocol)) return null
    return parsed.origin
  } catch {
    return null
  }
}

/** Адрес без хвоста, который меняется сам собой. Якорь — это движение ВНУТРИ
 * страницы, и различать по нему значило бы спрашивать на каждом оглавлении. */
function pageKeyOf(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (!WEB_SCHEME.test(parsed.protocol)) return null
    parsed.hash = ''
    // Косая черта в конце пути — та же страница: сервер сам её и дописывает.
    if (parsed.pathname.endsWith('/') && parsed.pathname !== '/') {
      parsed.pathname = parsed.pathname.slice(0, -1)
    }
    return parsed.toString()
  } catch {
    return null
  }
}

/**
 * Что делать с переходом внутри встроенной страницы.
 *
 * `opened` — адрес, который агент (или человек) открыл сам; пустая строка
 * значит «ничего не открывали», и тогда сравнивать не с чем.
 */
export function decidePreviewNavigation(
  opened: string,
  target: string,
  strictness: NavStrictness = 'origin'
): NavDecision {
  const clean = target.trim()
  if (BLANK.has(clean.toLowerCase())) return { action: 'allow' }

  // Сначала схема, и только потом всё остальное: `javascript:` внутри чужой
  // страницы — это исполнение её кода в нашем гостe, и спрашивать про такое
  // человека нечестно, потому что ответить «да» тут не может быть правильно.
  const targetOrigin = originOf(clean)
  if (targetOrigin === null) return { action: 'deny', reason: 'not-web' }

  const openedOrigin = originOf(opened.trim())
  if (openedOrigin === null) return { action: 'ask', reason: 'nothing-opened' }

  if (targetOrigin !== openedOrigin) return { action: 'ask', reason: 'other-origin' }
  if (strictness === 'origin') return { action: 'allow' }

  return pageKeyOf(clean) === pageKeyOf(opened.trim())
    ? { action: 'allow' }
    : { action: 'ask', reason: 'other-page' }
}

/** Что показать человеку в вопросе. Адрес обрезается, потому что в вопросе
 * важен ХОСТ, а строка на две тысячи знаков прячет его за собой — а именно в
 * такой строке и уезжает то, что агент успел узнать. */
export function describeNavigation(target: string): { host: string; address: string } {
  const clean = target.trim()
  let host = ''
  try {
    host = new URL(clean).host
  } catch {
    host = ''
  }

  return { host, address: clean.length > 200 ? `${clean.slice(0, 200)}…` : clean }
}
