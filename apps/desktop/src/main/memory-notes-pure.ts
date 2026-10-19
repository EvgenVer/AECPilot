// Задача 5.4 — решения экрана памяти, отделённые от диска.
//
// ЧТО ЗДЕСЬ РЕШАЕТСЯ. Какой файл записки открывать, можно ли записать присланный
// текст и не станет ли записка дороже, чем она стоит. Сам ввод-вывод — в
// `index.ts`, чтобы эти решения проверялись тестом без файловой системы.
//
// ПОЧЕМУ ПУТЬ НЕ ПРИХОДИТ ИЗ ОКНА. Имена файлов выбирает ядро
// (`$HERMES_HOME/memories/{MEMORY,USER}.md`), и окно называет только СТОРОНУ —
// «записка агента» или «записка о человеке». Приняв путь от окна, мы дали бы
// возможность записать что угодно куда угодно внутри профиля.

import { mainT } from './i18n'

/** Сторона записки в терминах окна. Ничего, кроме этих двух, не существует. */
export type NoteTarget = 'memory' | 'user'

/** Имена файлов принадлежат ядру; мы их не выбираем и не переименовываем. */
export const NOTE_FILES: Record<NoteTarget, string> = {
  memory: 'MEMORY.md',
  user: 'USER.md'
}

// ПРЕДЕЛЫ — ИХ УМОЛЧАНИЯ, И ЭТО НЕ ПРОИЗВОЛ. `memory_char_limit` = 2200,
// `user_char_limit` = 1375 (`agent_init.py`, читаются как
// `mem_config.get("memory_char_limit", 2200)`). Их инструмент записи на
// переполнении ОТКАЗЫВАЕТ и требует сначала consolidate.
//
// ЗАЧЕМ ПОВТОРЯТЬ ИХ У СЕБЯ. Экран пишет файл НАПРЯМУЮ, минуя их инструмент, —
// значит и минуя их отказ. Без этой проверки человек сохранил бы записку на
// мегабайт, а заплатил бы за неё КОНТЕКСТОМ КАЖДОГО ХОДА: текст записки
// вклеивается в системный промпт целиком. Отказ здесь дешевле, чем молча
// подорожавший каждый разговор.
export const NOTE_LIMITS: Record<NoteTarget, number> = {
  memory: 2200,
  user: 1375
}

export const NOTE_TARGET_ERROR = 'Неизвестная сторона записки'
export const NOTE_CONTENT_ERROR = 'Текст записки должен быть строкой'

export function noteTooLongError(target: NoteTarget, length: number): string {
  return mainT('memory.noteTooLong', length, NOTE_LIMITS[target])
}

export function isNoteTarget(value: unknown): value is NoteTarget {
  return value === 'memory' || value === 'user'
}

export type NoteWriteDecision =
  { ok: true; file: string; content: string } | { ok: false; error: string }

/**
 * Решает, писать ли присланную записку. Перевод строк приводится к `\n`: файл
 * читает python, а пришедший из окна текст может нести CRLF.
 */
export function decideNoteWrite(target: unknown, content: unknown): NoteWriteDecision {
  if (!isNoteTarget(target)) return { ok: false, error: NOTE_TARGET_ERROR }
  if (typeof content !== 'string') return { ok: false, error: NOTE_CONTENT_ERROR }

  const normalized = content.replace(/\r\n/g, '\n')
  if (normalized.length > NOTE_LIMITS[target]) {
    return { ok: false, error: noteTooLongError(target, normalized.length) }
  }

  return { ok: true, file: NOTE_FILES[target], content: normalized }
}

// ── Переключатель автозаписи ─────────────────────────────────────────────────
//
// ЧТО ТАКОЕ АВТОЗАПИСЬ, И ПОЧЕМУ ВЫКЛЮЧАТЕЛЕЙ ДВА. Память пополняется сама по
// двум путям, и они принадлежат разным слоям:
//   · слой 2 — конец каждого хода уезжает в провайдера (`MemoryManager.sync_all`);
//     выключателя у ядра для этого НЕТ, поэтому его исполняет наш плагин, читая
//     файл ниже;
//   · слой 1 — их фоновый разбор после хода (`background_review`), и у него
//     выключатель ЕСТЬ, обычным ключом конфига.
// Переключатель в экране один, а трогает оба: человек просил «не записывай сам»,
// а не «не записывай сам в одно из двух мест».
export const AUTOWRITE_FILE = 'aec-memory.json'

export interface AutowriteState {
  autowrite: boolean
}

/** Разбор файла состояния. Нет файла или мусор внутри — автозапись включена:
 *  это умолчание ядра, и тихо выключать его мы не вправе. */
export function parseAutowrite(text: string | null): AutowriteState {
  if (!text) return { autowrite: true }
  try {
    const parsed: unknown = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && 'autowrite' in parsed) {
      return { autowrite: (parsed as { autowrite: unknown }).autowrite !== false }
    }
  } catch {
    // мусор — умолчание
  }
  return { autowrite: true }
}

export function serializeAutowrite(state: AutowriteState): string {
  return JSON.stringify(state, null, 2) + '\n'
}

const REVIEW_SECTION_RE = /^background_review:\s*(#.*)?$/
const ENABLED_KEY_RE = /^ {2}enabled:\s*(?:true|false)\s*(#.*)?$/
const TOP_LEVEL_LINE_RE = /^\S/

/**
 * Вносит `background_review.enabled` в текст `config.yaml`, не трогая остальное.
 * Тот же текстовый приём и та же причина, что у соседей: в файле живут чужие
 * ключи и чужие комментарии.
 */
export function mergeBackgroundReview(yamlText: string, enabled: boolean): string {
  const line = `  enabled: ${enabled ? 'true' : 'false'}`
  const hadTrailingNewline = yamlText.endsWith('\n')
  const lines = (hadTrailingNewline ? yamlText.slice(0, -1) : yamlText).split('\n')

  const sectionStart = lines.findIndex((text) => REVIEW_SECTION_RE.test(text))
  if (sectionStart === -1) {
    const separator = yamlText === '' || hadTrailingNewline ? '' : '\n'
    return `${yamlText}${separator}background_review:\n${line}\n`
  }

  let sectionEnd = lines.length
  for (let i = sectionStart + 1; i < lines.length; i++) {
    if (TOP_LEVEL_LINE_RE.test(lines[i])) {
      sectionEnd = i
      break
    }
  }

  const section = lines.slice(sectionStart + 1, sectionEnd)
  const keyAt = section.findIndex((text) => ENABLED_KEY_RE.test(text))
  if (keyAt === -1) section.unshift(line)
  else section[keyAt] = line

  return (
    [...lines.slice(0, sectionStart + 1), ...section, ...lines.slice(sectionEnd)].join('\n') + '\n'
  )
}
