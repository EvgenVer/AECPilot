// Разбор атрибутов живых блоков (задача 3.4б, SPEC UR28).
//
// ЧТО ЗА БЛОКИ. Ответ агента может нести не только текст: абзац вида
// `::имя{ключ="значение"}` отрисовывается работающим блоком внутри сообщения.
// Механизм — донорский (`lib/transcript-directives.ts`): разбор узкий (директива
// обязана занимать АБЗАЦ ЦЕЛИКОМ), незанятое имя остаётся обычным абзацем, а
// исключение при отрисовке ловится их границей и даёт значок внутри сообщения.
// Наше здесь — три блока предметной области и разбор их атрибутов.
//
// ПОЧЕМУ АТРИБУТЫ — ЭТО ВСЁ, ЧТО У НАС ЕСТЬ. Их разбор отдаёт плоский
// `Record<string, string>` (пары `ключ="значение"`, до 1024 знаков на директиву).
// Значит, таблицу в директиву не вложить — и не надо: ведомость лежит файлом в
// проекте, а блок её ПОКАЗЫВАЕТ. Один источник правды на диске, блок — живой вид
// на него.
//
// ПОЧЕМУ ЭТО БЕЗОПАСНЕЕ ИХ `::preview`. Их эталонный блок рисует HTML, который
// написал агент, — отсюда изолированная рамка и требование R19. Наши три блока
// исполняют НАШ код и показывают ДАННЫЕ: всё, что приходит от агента, — строки
// атрибутов (React их экранирует) и относительный путь, который резолвит главный
// процесс теми же проверками, что и любой путь из окна (SPEC C9). Кода агента
// внутри наших блоков не исполняется вовсе, поэтому и изолировать нечего.
//
// ВСЁ, ЧТО НИЖЕ, — РАЗБОР ВРАЖДЕБНОГО ВВОДА. Атрибуты пишет модель: пропущенное
// поле, мусор вместо числа и полуобрезанная ссылка — это норма, а не сбой.
// Каждая функция отвечает «что показать», а не бросает.

import { parseCitationLabel, type Citation } from '../citations/citation-pure'

/** Их форма атрибутов: только строки, ключи в нижнем регистре. */
export type DirectiveAttrs = Readonly<Record<string, string>>

function text(attrs: DirectiveAttrs, key: string): string {
  return (attrs[key] ?? '').trim()
}

/** Ссылка на место в документе. Формат тот же, что агент уже пишет в тексте
 * ответа (`[src: источник/путь#p12]`), — учить его второму синтаксису ради
 * блока незачем. Неразобранная ссылка — не ошибка блока: он просто не покажет
 * кнопку перехода. */
function citation(attrs: DirectiveAttrs, key: string): Citation | null {
  const raw = text(attrs, key)
  return raw ? parseCitationLabel(raw) : null
}

// ── ::aec-clause — пункт норматива ──────────────────────────────────────────

export interface ClauseBlock {
  /** Номер пункта, как его назвал агент («5.6.3»). Пусто — блок покажет один
   * заголовок документа. */
  clause: string
  /** Название документа («СП 22.13330.2016»). Пусто — возьмём имя файла из
   * ссылки. */
  doc: string
  /** Выдержка или пояснение, если агент его дал. */
  note: string
  source: Citation | null
}

export function readClauseBlock(attrs: DirectiveAttrs): ClauseBlock {
  const source = citation(attrs, 'src')
  const doc = text(attrs, 'doc') || (source ? source.relPath.split('/').pop() || '' : '')

  return {
    clause: text(attrs, 'clause'),
    doc,
    note: text(attrs, 'note'),
    source
  }
}

// ── ::aec-conflict — карточка расхождения ───────────────────────────────────

export interface ConflictSide {
  label: string
  source: Citation | null
  value: string
}

export interface ConflictBlock {
  left: ConflictSide
  right: ConflictSide
  subject: string
}

function side(
  attrs: DirectiveAttrs,
  prefix: 'left' | 'right',
  fallbackLabel: string
): ConflictSide {
  return {
    label: text(attrs, `${prefix}-label`) || fallbackLabel,
    source: citation(attrs, `${prefix}-src`),
    value: text(attrs, prefix)
  }
}

export function readConflictBlock(
  attrs: DirectiveAttrs,
  fallbackLabels: { left: string; right: string }
): ConflictBlock {
  return {
    left: side(attrs, 'left', fallbackLabels.left),
    right: side(attrs, 'right', fallbackLabels.right),
    subject: text(attrs, 'subject')
  }
}

/** Карточку расхождения показывать не о чем, если не названо ни одно значение:
 * пустая рамка на месте абзаца хуже самого абзаца. */
export function conflictIsEmpty(block: ConflictBlock): boolean {
  return block.left.value === '' && block.right.value === ''
}

// ── ::aec-table — ведомость таблицей ────────────────────────────────────────

export const TABLE_DEFAULT_LIMIT = 20
export const TABLE_MAX_LIMIT = 100

export interface TableBlock {
  /** Путь внутри хранилища или подключённого источника. Пусто — показать нечего. */
  file: string
  limit: number
  /** Имя подключённого источника; пусто означает vault — соглашение
   * `readDocument`. */
  sourceId: string
  title: string
}

export function readTableBlock(attrs: DirectiveAttrs): TableBlock {
  const raw = Number.parseInt(text(attrs, 'limit'), 10)
  const limit = Number.isFinite(raw)
    ? Math.min(Math.max(raw, 1), TABLE_MAX_LIMIT)
    : TABLE_DEFAULT_LIMIT

  return {
    file: text(attrs, 'file'),
    limit,
    sourceId: text(attrs, 'source'),
    title: text(attrs, 'title')
  }
}

/** Разбирается ли файл как таблица без чтения байтов — по расширению. XLSX
 * читает главный процесс (exceljs — библиотека Node), CSV/TSV разбираем сами. */
export function tableKindOf(file: string): 'csv' | 'sheet' | 'unsupported' {
  const ext = file.slice(file.lastIndexOf('.')).toLowerCase()
  if (ext === '.xlsx' || ext === '.xlsm') return 'sheet'
  if (ext === '.csv' || ext === '.tsv' || ext === '.txt') return 'csv'
  return 'unsupported'
}

/** Строки для показа: шапка отдельно, тело обрезано по `limit`. Пустые хвосты
 * не выравниваем — таблица показывает файл, а не его улучшенную версию. */
export function tablePreview(
  rows: readonly (readonly string[])[],
  limit: number
): { body: readonly (readonly string[])[]; head: readonly string[]; hidden: number } {
  if (rows.length === 0) return { body: [], head: [], hidden: 0 }

  const [head, ...rest] = rows
  return {
    body: rest.slice(0, limit),
    head,
    hidden: Math.max(0, rest.length - limit)
  }
}
