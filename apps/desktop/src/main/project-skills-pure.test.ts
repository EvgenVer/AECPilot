// Задача 3.8а. Самое опасное здесь — правка ИХ файла настроек: испортив его, мы
// сломаем не свою поверхность, а всё ядро. Поэтому проверяется и то, что мы
// пишем, и — отдельно — то, чего мы НЕ трогаем.

import { describe, expect, it } from 'vitest'

import {
  changedSince,
  fingerprintOf,
  hashOf,
  OWNED_MARK,
  parseTrustFile,
  serializeTrustFile,
  setProjectSkillDirs,
  skillRootsFor,
  type ProjectSkillEntry
} from './project-skills-pure'

const DIR = 'D:/work/smeta/.agents/skills'

describe('где ядро ищет скилы проекта', () => {
  it('оба их каталога', () => {
    expect(skillRootsFor('D:/work/smeta')).toEqual([
      'D:/work/smeta/.agents/skills',
      'D:/work/smeta/.hermes/skills'
    ])
  })
})

describe('правка skills.external_dirs', () => {
  it('секции нет — добавляется целиком', () => {
    const result = setProjectSkillDirs('model:\n  name: x\n', [DIR])

    expect(result.changed).toBe(true)
    expect(result.text).toContain('skills:')
    expect(result.text).toContain(`external_dirs:`)
    expect(result.text).toContain(`${JSON.stringify(DIR)} ${OWNED_MARK}`)
  })

  it('секция есть, поля нет — добавляется поле', () => {
    const result = setProjectSkillDirs('skills:\n  enabled: true\n', [DIR])

    expect(result.changed).toBe(true)
    expect(result.text).toContain('  external_dirs:')
    expect(result.text, 'соседнее поле остаётся').toContain('  enabled: true')
  })

  it('ЧУЖИЕ строки в том же поле остаются на месте', () => {
    const yaml = [
      'skills:',
      '  external_dirs:',
      '    - "C:/moi/skills"',
      `    - "C:/staroe" ${OWNED_MARK}`,
      'model:',
      '  name: x',
      ''
    ].join('\n')

    const result = setProjectSkillDirs(yaml, [DIR])

    expect(result.changed).toBe(true)
    expect(result.text, 'чужой каталог не наш и не трогается').toContain('    - "C:/moi/skills"')
    expect(result.text, 'наш прежний уходит').not.toContain('C:/staroe')
    expect(result.text).toContain(JSON.stringify(DIR))
    expect(result.text, 'соседняя секция цела').toContain('model:')
  })

  it('отзыв доверия убирает наши строки и только их', () => {
    const yaml = [
      'skills:',
      '  external_dirs:',
      '    - "C:/moi/skills"',
      `    - ${JSON.stringify(DIR)} ${OWNED_MARK}`,
      ''
    ].join('\n')

    const result = setProjectSkillDirs(yaml, [])

    expect(result.changed).toBe(true)
    expect(result.text).toContain('    - "C:/moi/skills"')
    expect(result.text).not.toContain(DIR)
  })

  it('повторная запись того же — не изменение', () => {
    const once = setProjectSkillDirs('skills:\n  external_dirs:\n', [DIR])
    const twice = setProjectSkillDirs(once.text, [DIR])

    expect(twice.changed).toBe(false)
    expect(twice.text).toBe(once.text)
  })

  it('нет секции и нет доверия — файл не трогается', () => {
    const result = setProjectSkillDirs('model:\n  name: x\n', [])

    expect(result.changed).toBe(false)
    expect(result.unexpectedStructure).toBe(false)
  })

  it('непривычная структура — файл оставляется как есть', () => {
    expect(setProjectSkillDirs('skills: off\n', [DIR])).toMatchObject({
      changed: false,
      unexpectedStructure: true
    })
    expect(setProjectSkillDirs('skills:\n  external_dirs: [a, b]\n', [DIR])).toMatchObject({
      changed: false,
      unexpectedStructure: true
    })
  })
})

const entry = (rel: string, content: string): ProjectSkillEntry => ({
  rel,
  name: rel,
  description: '',
  tools: [],
  hash: hashOf(content)
})

describe('что изменилось с тех пор, как человек смотрел', () => {
  it('ничего', () => {
    const now = [entry('a/SKILL.md', 'один'), entry('b/SKILL.md', 'два')]
    expect(changedSince(fingerprintOf(now), now)).toEqual({
      added: [],
      changed: [],
      removed: []
    })
  })

  it('файл переписали — назван именно он', () => {
    const before = fingerprintOf([entry('a/SKILL.md', 'один'), entry('b/SKILL.md', 'два')])
    const now = [entry('a/SKILL.md', 'один'), entry('b/SKILL.md', 'ДРУГОЕ')]

    expect(changedSince(before, now)).toEqual({
      added: [],
      changed: ['b/SKILL.md'],
      removed: []
    })
  })

  it('появился новый — это тоже повод переспросить', () => {
    const before = fingerprintOf([entry('a/SKILL.md', 'один')])
    const now = [entry('a/SKILL.md', 'один'), entry('c/SKILL.md', 'новое')]

    expect(changedSince(before, now).added).toEqual(['c/SKILL.md'])
  })

  it('файл убрали', () => {
    const before = fingerprintOf([entry('a/SKILL.md', 'один'), entry('b/SKILL.md', 'два')])
    expect(changedSince(before, [entry('a/SKILL.md', 'один')]).removed).toEqual(['b/SKILL.md'])
  })

  it('отпечаток не зависит от порядка обхода', () => {
    const one = fingerprintOf([entry('a/SKILL.md', 'x'), entry('b/SKILL.md', 'y')])
    const two = fingerprintOf([entry('b/SKILL.md', 'y'), entry('a/SKILL.md', 'x')])
    expect(one).toEqual(two)
  })
})

describe('файл доверия', () => {
  it('записанное читается обратно', () => {
    const record = { 'D:/work/smeta': { 'a/SKILL.md': 'abc' } }
    expect(parseTrustFile(serializeTrustFile(record))).toEqual(record)
  })

  it('испорченный файл — доверия нет (а не «доверяем всему»)', () => {
    expect(parseTrustFile('{')).toEqual({})
    expect(parseTrustFile('[]')).toEqual({})
    expect(parseTrustFile('null')).toEqual({})
  })

  it('мусор внутри отбрасывается по одной записи, а не целиком', () => {
    expect(parseTrustFile('{"p":{"a":"h","b":42},"q":"нет"}')).toEqual({ p: { a: 'h' } })
  })
})
