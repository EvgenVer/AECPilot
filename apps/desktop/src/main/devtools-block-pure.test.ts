// Задача 3E.11. Гасить чужое нажатие — право, которым легко злоупотребить, и
// тесты держат ровно границу: одна клавиша, только при включённой настройке.

import { describe, expect, it } from 'vitest'

import {
  parseDevtoolsBlocked,
  serializeDevtoolsBlocked,
  shouldBlockDevtoolsKey
} from './devtools-block-pure'

describe('shouldBlockDevtoolsKey', () => {
  it('выключенная настройка не гасит ничего', () => {
    expect(shouldBlockDevtoolsKey({ key: 'F12' }, false)).toBe(false)
  })

  it('включённая гасит F12', () => {
    expect(shouldBlockDevtoolsKey({ key: 'F12' }, true)).toBe(true)
  })

  it('сочетание из трёх клавиш не трогается: туда попадают намеренно', () => {
    expect(shouldBlockDevtoolsKey({ key: 'I', control: true, shift: true }, true)).toBe(false)
  })

  it('F12 с модификатором — другая команда, и запрета на неё не просили', () => {
    expect(shouldBlockDevtoolsKey({ key: 'F12', shift: true }, true)).toBe(false)
    expect(shouldBlockDevtoolsKey({ key: 'F12', control: true }, true)).toBe(false)
  })

  it('обычный ввод проходит', () => {
    expect(shouldBlockDevtoolsKey({ key: 'f' }, true)).toBe(false)
    expect(shouldBlockDevtoolsKey({ key: 'Enter' }, true)).toBe(false)
  })
})

describe('файл настройки', () => {
  it('круг записи и чтения', () => {
    expect(parseDevtoolsBlocked(serializeDevtoolsBlocked(true))).toBe(true)
    expect(parseDevtoolsBlocked(serializeDevtoolsBlocked(false))).toBe(false)
  })

  it('испорченный файл — это «не блокировать», а не падение', () => {
    // Запрет, взявшийся из битого JSON, человек не сможет ни объяснить, ни снять.
    expect(parseDevtoolsBlocked('{')).toBe(false)
    expect(parseDevtoolsBlocked('')).toBe(false)
    expect(parseDevtoolsBlocked('{"on":"да"}')).toBe(false)
  })
})
