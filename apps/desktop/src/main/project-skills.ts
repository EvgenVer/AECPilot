// Скилы проекта — сторона диска (задача 3.8а, SPEC UR29).
//
// Правила и их основания — в шапке `project-skills-pure.ts`. Здесь: обойти
// папку, посчитать отпечатки, переписать их конфиг, запомнить доверие.
//
// ОДИН ИНВАРИАНТ, РАДИ КОТОРОГО ВСЁ ОСТАЛЬНОЕ. В `skills.external_dirs` в любой
// момент времени стоят каталоги РОВНО ОДНОГО проекта — текущего и только если
// он доверен и не менялся с тех пор. Отсюда «скилы одного проекта не видны в
// другом» и «отзыв доверия отключает их немедленно»: и то и другое — следствие
// одной записи, а не отдельных механизмов, которые могут разойтись.

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { requiredToolsOf, skillDescriptionOf, skillNameOf } from '../shared/skill-frontmatter'

import {
  changedSince,
  SKILL_SUBDIRS,
  fingerprintOf,
  hashOf,
  parseTrustFile,
  serializeTrustFile,
  setProjectSkillDirs,
  skillRootsFor,
  type ProjectSkillEntry,
  type TrustRecord,
  type TrustState
} from './project-skills-pure'

export interface ProjectSkillsView {
  state: TrustState
  /** Что лежит в папке ПРЯМО СЕЙЧАС — это и показывается человеку. */
  skills: ProjectSkillEntry[]
  /** Заполнено только у `changed`: что именно разошлось с доверенным. */
  difference?: { added: string[]; changed: string[]; removed: string[] }
  /** Имена, которые ПЕРЕКРЫТЫ одноимённым скилом профиля. Замерено
   * (`runtime/skill-priority-probe.mjs`): порядок обхода у ядра
   * `project → local → external`, первое имя выигрывает, а мы вынуждены жить на
   * внешнем ярусе (у vault нет `.git`, см. 3.8б) — значит при совпадении имён
   * побеждает ПРОФИЛЬНЫЙ скил, а для UR29 нужно наоборот.
   *
   * Переименовывать файлы в чужой папке проекта мы не станем, а выключать
   * профильный скил за человека — тем более. Поэтому совпадение НАЗЫВАЕТСЯ: в
   * этом случае проектная инструкция не действует, и человек должен об этом
   * знать, а не гадать, почему правило не сработало. */
  shadowed: string[]
}

interface Paths {
  homeDir: string
  userDataDir: string
}

let paths: Paths | undefined

export function configureProjectSkills(value: Paths): void {
  paths = value
}

function trustPath(): string {
  return join(paths?.userDataDir ?? '', 'project-skills-trust.json')
}

function readTrust(): TrustRecord {
  try {
    return existsSync(trustPath()) ? parseTrustFile(readFileSync(trustPath(), 'utf-8')) : {}
  } catch {
    return {}
  }
}

function writeTrust(record: TrustRecord): void {
  try {
    writeFileSync(trustPath(), serializeTrustFile(record), 'utf-8')
  } catch (error: unknown) {
    console.error('aecpilot: could not save project skill trust', error)
  }
}

/** Обходит оба их каталога и собирает то, что там лежит.
 *
 * Раскладка их же: `skills/<имя>/SKILL.md`. Ошибка чтения одного файла не
 * должна прятать остальные — такой файл просто не попадает в список, и человек
 * увидит, что скилов меньше, чем он клал. */
export function scanProjectSkills(projectPath: string): ProjectSkillEntry[] {
  const entries: ProjectSkillEntry[] = []

  for (const [index, root] of skillRootsFor(projectPath).entries()) {
    const prefix = SKILL_SUBDIRS[index]
    let names: string[]
    try {
      if (!existsSync(root) || !statSync(root).isDirectory()) continue
      names = readdirSync(root)
    } catch {
      continue
    }

    for (const name of names) {
      const file = join(root, name, 'SKILL.md')
      try {
        if (!existsSync(file)) continue
        const content = readFileSync(file, 'utf-8')
        entries.push({
          rel: `${prefix}/${name}`,
          name: skillNameOf(content, name),
          description: skillDescriptionOf(content),
          tools: requiredToolsOf(content),
          hash: hashOf(content)
        })
      } catch {
        // нечитаемый файл — не скил; молчать о нём нельзя, но и ронять обход
        // из-за одного файла тоже.
        console.warn(`aecpilot: could not read a project skill at ${file}`)
      }
    }
  }

  return entries.sort((a, b) => a.rel.localeCompare(b.rel))
}

/** Имена скилов, установленных в профиле. Читается каталог, а не их API: это
 * та же папка, куда их хаб и ставит, и лишний сетевой вызов ради списка имён
 * ничего не уточнит. */
function profileSkillNames(): Set<string> {
  const root = join(paths?.homeDir ?? '', 'skills')
  try {
    if (!existsSync(root)) return new Set()
    return new Set(readdirSync(root))
  } catch {
    return new Set()
  }
}

/** Что показывать человеку про скилы этого проекта. */
export function projectSkillsView(projectPath: string | undefined): ProjectSkillsView {
  if (!projectPath) return { state: 'none', skills: [], shadowed: [] }

  const skills = scanProjectSkills(projectPath)
  if (skills.length === 0) return { state: 'none', skills: [], shadowed: [] }

  const profile = profileSkillNames()
  const shadowed = skills
    .filter((skill) => profile.has(skill.rel.split('/').pop() ?? ''))
    .map((skill) => skill.name)

  const trusted = readTrust()[projectPath]
  if (!trusted) return { state: 'untrusted', skills, shadowed }

  const difference = changedSince(trusted, skills)
  const moved = difference.added.length + difference.changed.length + difference.removed.length > 0

  return moved
    ? { state: 'changed', skills, difference, shadowed }
    : { state: 'trusted', skills, shadowed }
}

/** Переписывает их конфиг так, чтобы в нём стояли каталоги ровно этого проекта
 * — или ни одного. Возвращает false, если структура конфига непривычная и его
 * решено не трогать. */
function writeDirs(dirs: string[]): boolean {
  const configPath = join(paths?.homeDir ?? '', 'config.yaml')

  let original: string
  try {
    original = readFileSync(configPath, 'utf-8')
  } catch (error: unknown) {
    console.error('aecpilot: could not read config.yaml for project skills', error)
    return false
  }

  const merged = setProjectSkillDirs(original, dirs)
  if (merged.unexpectedStructure) {
    console.warn('aecpilot: config.yaml has an unexpected skills: block — leaving it untouched')
    return false
  }
  if (!merged.changed) return true

  try {
    writeFileSync(configPath, merged.text, 'utf-8')
    return true
  } catch (error: unknown) {
    console.error('aecpilot: could not write config.yaml for project skills', error)
    return false
  }
}

/**
 * Приводит конфиг в соответствие с состоянием ТЕКУЩЕГО проекта. Зовётся при
 * каждом открытии проекта и после каждого решения человека.
 *
 * `changed` ведёт себя как «не доверено»: доверие подвисает до пересмотра, и
 * агент этих инструкций не видит. Это и есть решение владельца «заметить и
 * переспросить» — заметить мало, надо ещё перестать пускать.
 */
export function applyProjectSkills(projectPath: string | undefined): ProjectSkillsView {
  const view = projectSkillsView(projectPath)
  const allowed = view.state === 'trusted' && projectPath !== undefined

  writeDirs(allowed ? skillRootsFor(projectPath).filter((dir) => existsSync(dir)) : [])
  return view
}

/** Решение человека. Доверие запоминается ВМЕСТЕ с отпечатками того, что он
 * видел: доверяют не папке, а конкретному содержимому. */
export function setProjectSkillsTrust(
  projectPath: string | undefined,
  trusted: boolean
): ProjectSkillsView {
  if (!projectPath) return { state: 'none', skills: [], shadowed: [] }

  const record = readTrust()

  if (trusted) record[projectPath] = fingerprintOf(scanProjectSkills(projectPath))
  else delete record[projectPath]

  writeTrust(record)
  return applyProjectSkills(projectPath)
}
