// Обращение по имени: `@смета` (задача 3C.7, SPEC UR27).
//
// ЧТО ЗДЕСЬ РЕШАЕТСЯ. Какие имена предлагать в подсказке и как отличить
// обращение к специалисту от обычного текста, в котором просто есть собачка.
// Само ДЕЙСТВИЕ (передать вопрос другому специалисту и вернуть ответ) — вопрос
// архитектуры, и он решается отдельно: см. `specs/agent-roster.md` §Р6.
//
// ГЛАВНОЕ ПРАВИЛО: ЧУЖОЕ НЕ ТРОГАЕМ. Адрес почты, тег в тексте, имя, которого
// в роестре нет, — всё это проходит текстом. Их же тест на это отдельный, и
// причина простая: человек пишет письмо, а не команду, и превратить `@` в
// вызов там, где его не звали, — это испортить сообщение.

export interface MentionCandidate {
  /** Имя профиля — то, что вставляется в текст. */
  handle: string
  /** Подпись человеку. */
  title: string
  role: string
  /** Машина, если специалист не на этой. Пусто — местный. */
  device: string
}

/** Как выглядит обращение к специалисту в тексте. Кириллица допускается: имена
 * на экране русские, и требовать латиницу в обращении значило бы заставить
 * человека помнить два имени одного и того же. */
const MENTION = /(^|\s)@([\p{L}\p{N}][\p{L}\p{N}_-]*)/gu

/** Имя, под которым специалист откликается. Одинаковые имена на разных машинах
 * различаются машиной — иначе непонятно, кого позвали. */
export function mentionHandle(candidate: MentionCandidate): string {
  const base = candidate.title.trim() === '' ? candidate.handle : candidate.title.trim()
  const slug = base.replace(/\s+/g, '-')
  return candidate.device === '' ? slug : `${slug}-${candidate.device}`
}

/**
 * Кого предложить по началу имени.
 *
 * Себя не предлагаем: обращение к себе — это не обращение, а путаница (их же
 * правило). Порядок роестра сохраняется.
 */
export function mentionCompletions(
  roster: readonly MentionCandidate[],
  query: string,
  activeHandle: string
): MentionCandidate[] {
  const needle = query.trim().toLowerCase()

  return roster.filter((candidate) => {
    if (candidate.handle === activeHandle && candidate.device === '') return false
    if (needle === '') return true

    return (
      mentionHandle(candidate).toLowerCase().startsWith(needle) ||
      candidate.handle.toLowerCase().startsWith(needle) ||
      candidate.title.toLowerCase().startsWith(needle)
    )
  })
}

/** Символы, из которых состоит имя в обращении. Тот же набор, что в `MENTION`. */
const MENTION_CHARS = /[\p{L}\p{N}_-]/u

/**
 * Незаконченное обращение под курсором — то, что набирает человек прямо сейчас.
 *
 * Возвращает набранное после `@` и место самой собачки, чтобы вставка знала,
 * что заменять. `null` — курсор не в обращении, и подсказке показываться не на
 * что.
 *
 * ПОЧЕМУ ПРОВЕРЯЕТСЯ СИМВОЛ ПЕРЕД СОБАЧКОЙ: в адресе почты она стоит после
 * буквы, и без этой проверки подсказка вылезала бы посреди `mail@smeta.ru`.
 * Правило то же, что у `MENTION`: обращение начинается со строки или пробела.
 */
export function mentionAtCaret(
  text: string,
  caret: number
): { query: string; start: number } | null {
  for (let at = Math.min(caret, text.length) - 1; at >= 0; at--) {
    const char = text[at]

    if (char === '@') {
      const before = at === 0 ? '' : text[at - 1]
      if (before !== '' && !/\s/.test(before)) return null
      return { query: text.slice(at + 1, caret), start: at }
    }

    if (!MENTION_CHARS.test(char)) return null
  }
  return null
}

/** Текст с подставленным обращением и место курсора после вставки.
 *
 * Пробел в конце ставится сам: человек, выбравший имя, продолжает писать, и
 * дописывать пробел руками — работа, которой можно не быть.
 */
export function applyMention(
  text: string,
  start: number,
  caret: number,
  handle: string
): { text: string; caret: number } {
  const inserted = `@${handle} `
  return {
    text: text.slice(0, start) + inserted + text.slice(caret),
    caret: start + inserted.length
  }
}

/**
 * Кого позвали в этом тексте.
 *
 * Возвращает только тех, кто ЕСТЬ в роестре: неизвестное `@` — это обычный
 * текст, и трогать его нельзя. Адрес почты не проходит по построению: перед
 * собачкой в нём стоит буква, а обращение начинается со строки или пробела.
 */
export function mentionedSpecialists(
  text: string,
  roster: readonly MentionCandidate[]
): MentionCandidate[] {
  const byHandle = new Map<string, MentionCandidate>()
  for (const candidate of roster) {
    byHandle.set(mentionHandle(candidate).toLowerCase(), candidate)
    byHandle.set(candidate.handle.toLowerCase(), candidate)
  }

  const found: MentionCandidate[] = []
  const seen = new Set<string>()

  for (const match of text.matchAll(MENTION)) {
    const candidate = byHandle.get(match[2].toLowerCase())
    if (!candidate || seen.has(candidate.handle)) continue
    seen.add(candidate.handle)
    found.push(candidate)
  }

  return found
}
