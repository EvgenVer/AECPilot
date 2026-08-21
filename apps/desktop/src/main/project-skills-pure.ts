// Скилы проекта: правила без диска (задача 3.8а, SPEC UR29).
//
// ЧТО ЭТО. Папка проекта может нести инструкции для агента — правила
// нормоконтроля организации, требования заказчика к альбому. Они действуют
// только в этом проекте и грузятся только после явного доверия.
//
// ПОЧЕМУ НЕ ИХ «ПРОЕКТНЫЙ ЯРУС». Замер 3.8б: их механизм проектных скилов
// включается только если рядом лежит `.git`, а наш vault репозиторием не
// является и не станет (решение владельца, плюс HX6). Без `.git` он не
// включается ВООБЩЕ — путь в списке доверенных не помогает. Работает другое их
// поле, `skills.external_dirs`: принимает любой абсолютный путь и `.git` не
// спрашивает.
//
// ЦЕНА ЭТОГО ПОЛЯ, КОТОРУЮ ЗАКРЫВАЕМ МЫ. У внешнего яруса нет ни их гейта
// доверия (каталоги грузятся безусловно), ни карантинного скана (сканер во всём
// ядре зовут ровно два места, и это не он). Значит:
//   • «видны только после доверия» держится тем, что путь не появляется в
//     конфиге раньше подтверждения и уходит при отзыве;
//   • «скилы одного проекта не видны в другом» — тем, что в списке всегда ровно
//     текущий проект;
//   • подмену закрывает РЕШЕНИЕ ВЛАДЕЛЬЦА 2026-08-21 «заметить и переспросить»:
//     при выдаче доверия человек видит список инструкций и что они просят, а
//     дальше мы держим отпечаток каждого файла. Изменился или появился новый —
//     доверие подвисает, и агент их не видит, пока человек не посмотрит заново.
//     Папка проекта в организации — сетевой диск, куда пишет не один человек;
//     «содержимое меняется под доверием» описывает нас точно.
//
// МЫ НИКОГДА НЕ ТРОГАЕМ ЧУЖИЕ СТРОКИ. Человек мог вписать свои каталоги в то же
// поле руками. Поэтому наши строки помечены, и переписываются только они.

import { createHash } from 'node:crypto'

/** Пометка на строках, которые пишем мы. Всё остальное в этом поле — чужое. */
export const OWNED_MARK = '# aecpilot:project'

const SKILLS_SECTION_RE = /^skills:\s*(#.*)?$/
const SKILLS_SCALAR_RE = /^skills:\s*[^#\s]/
const EXTERNAL_DIRS_RE = /^\s{2}external_dirs:\s*(#.*)?$/
const EXTERNAL_DIRS_INLINE_RE = /^\s{2}external_dirs:\s*[^#\s]/
const TOP_LEVEL_RE = /^\S/
const LIST_ITEM_RE = /^\s{4}-\s/

export interface ConfigEditResult {
  text: string
  changed: boolean
  /** Структура не та, которую умеет переписывать построчная правка. Тогда файл
   * оставляется как есть: испортить чужой конфиг хуже, чем не записать путь. */
  unexpectedStructure: boolean
}

/** Каталоги, в которых их механизм ищет скилы проекта. Оба их собственные — мы
 * только объявляем корень. */
export const SKILL_SUBDIRS = ['.agents/skills', '.hermes/skills'] as const

/** Путь нормализуется к косой черте: он уезжает в ИХ конфиг, который читает
 * python, и смешанные разделители в одной строке — лишний повод для сюрприза.
 * Windows принимает косую черту наравне с обратной. */
export function skillRootsFor(projectPath: string): string[] {
  const root = projectPath.replace(/\\/g, '/').replace(/\/+$/, '')
  return SKILL_SUBDIRS.map((sub) => `${root}/${sub}`)
}

function ownedLine(dir: string): string {
  return `    - ${JSON.stringify(dir)} ${OWNED_MARK}`
}

/**
 * Переписывает НАШИ строки в `skills.external_dirs`, оставляя чужие на месте.
 *
 * Пустой `dirs` означает «доверия нет» — тогда наши строки просто исчезают.
 */
export function setProjectSkillDirs(yamlText: string, dirs: string[]): ConfigEditResult {
  const lines = yamlText.split('\n')

  if (lines.some((line) => SKILLS_SCALAR_RE.test(line))) {
    return { text: yamlText, changed: false, unexpectedStructure: true }
  }

  const sectionStart = lines.findIndex((line) => SKILLS_SECTION_RE.test(line))

  // Ни секции, ни доверия — писать нечего.
  if (sectionStart === -1 && dirs.length === 0) {
    return { text: yamlText, changed: false, unexpectedStructure: false }
  }

  if (sectionStart === -1) {
    const separator = yamlText === '' || yamlText.endsWith('\n') ? '' : '\n'
    const block = ['skills:', '  external_dirs:', ...dirs.map(ownedLine), ''].join('\n')
    return { text: `${yamlText}${separator}${block}`, changed: true, unexpectedStructure: false }
  }

  let sectionEnd = lines.length
  for (let i = sectionStart + 1; i < lines.length; i += 1) {
    if (TOP_LEVEL_RE.test(lines[i])) {
      sectionEnd = i
      break
    }
  }

  const section = lines.slice(sectionStart + 1, sectionEnd)

  if (section.some((line) => EXTERNAL_DIRS_INLINE_RE.test(line))) {
    return { text: yamlText, changed: false, unexpectedStructure: true }
  }

  const fieldIndex = section.findIndex((line) => EXTERNAL_DIRS_RE.test(line))

  if (fieldIndex === -1) {
    if (dirs.length === 0) return { text: yamlText, changed: false, unexpectedStructure: false }

    const next = [
      ...lines.slice(0, sectionStart + 1),
      '  external_dirs:',
      ...dirs.map(ownedLine),
      ...section,
      ...lines.slice(sectionEnd)
    ]
    return { text: next.join('\n'), changed: true, unexpectedStructure: false }
  }

  // Границы списка внутри секции.
  let listEnd = section.length
  for (let i = fieldIndex + 1; i < section.length; i += 1) {
    if (!LIST_ITEM_RE.test(section[i])) {
      listEnd = i
      break
    }
  }

  const items = section.slice(fieldIndex + 1, listEnd)
  const foreign = items.filter((line) => !line.includes(OWNED_MARK))
  const rebuilt = [...dirs.map(ownedLine), ...foreign]

  if (items.join('\n') === rebuilt.join('\n')) {
    return { text: yamlText, changed: false, unexpectedStructure: false }
  }

  const nextSection = [...section.slice(0, fieldIndex + 1), ...rebuilt, ...section.slice(listEnd)]
  const next = [...lines.slice(0, sectionStart + 1), ...nextSection, ...lines.slice(sectionEnd)]

  return { text: next.join('\n'), changed: true, unexpectedStructure: false }
}

/** Один файл инструкций, каким его видит человек в списке доверия. */
export interface ProjectSkillEntry {
  /** Путь относительно папки проекта — чтобы отпечаток не зависел от того, где
   * проект лежит на диске. */
  rel: string
  name: string
  description: string
  tools: string[]
  hash: string
}

export function hashOf(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex').slice(0, 16)
}

export type TrustState = 'changed' | 'none' | 'trusted' | 'untrusted'

/**
 * Что изменилось с тех пор, как человек посмотрел.
 *
 * Возвращает список путей, а не «да/нет»: человеку показывается, ЧТО именно
 * поменялось, иначе «пересмотрите доверие» — это просьба перечитать всё.
 */
export function changedSince(
  trusted: Record<string, string>,
  current: readonly ProjectSkillEntry[]
): { added: string[]; changed: string[]; removed: string[] } {
  const seen = new Set<string>()
  const added: string[] = []
  const changed: string[] = []

  for (const entry of current) {
    seen.add(entry.rel)
    const known = trusted[entry.rel]
    if (known === undefined) added.push(entry.rel)
    else if (known !== entry.hash) changed.push(entry.rel)
  }

  const removed = Object.keys(trusted).filter((rel) => !seen.has(rel))

  return { added: added.sort(), changed: changed.sort(), removed: removed.sort() }
}

/** Отпечаток, который сохраняется вместе с доверием. */
export function fingerprintOf(entries: readonly ProjectSkillEntry[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const entry of entries) out[entry.rel] = entry.hash
  return out
}

export interface TrustRecord {
  /** Путь проекта → отпечатки его файлов на момент доверия. */
  [projectPath: string]: Record<string, string>
}

export function parseTrustFile(raw: string): TrustRecord {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    const out: TrustRecord = {}
    for (const [project, files] of Object.entries(parsed as Record<string, unknown>)) {
      if (!files || typeof files !== 'object' || Array.isArray(files)) continue
      const clean: Record<string, string> = {}
      for (const [rel, hash] of Object.entries(files as Record<string, unknown>)) {
        if (typeof hash === 'string') clean[rel] = hash
      }
      out[project] = clean
    }
    return out
  } catch {
    return {}
  }
}

export function serializeTrustFile(record: TrustRecord): string {
  return `${JSON.stringify(record, null, 2)}\n`
}
