// Задача 3E.11. Гасить чужое нажатие — право, которым легко злоупотребить, и
// тесты держат ровно границу: одна клавиша, только при включённой настройке.

import { describe, expect, it } from 'vitest'

import {
  f12Payload,
  parseDevtoolsBlocked,
  serializeDevtoolsBlocked,
  shouldBlockDevtoolsKey,
  shouldForwardF12
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

// Задача 3G.23 (D-146): F12 как назначаемая клавиша.
describe('shouldForwardF12', () => {
  it('forwards F12 to the window only while a binding claims it', () => {
    expect(shouldForwardF12({ key: 'F12', type: 'keyDown' }, true)).toBe(true)
    expect(shouldForwardF12({ key: 'F12', type: 'keyDown' }, false)).toBe(false)
  })

  it('ignores key-up and other keys', () => {
    expect(shouldForwardF12({ key: 'F12', type: 'keyUp' }, true)).toBe(false)
    expect(shouldForwardF12({ key: 'F11', type: 'keyDown' }, true)).toBe(false)
  })

  it('hands the press over in their payload shape', () => {
    expect(f12Payload({ key: 'F12', code: 'F12', shift: true, isAutoRepeat: true })).toEqual({
      alt: false,
      code: 'F12',
      control: false,
      key: 'F12',
      meta: false,
      repeat: true,
      shift: true
    })
  })
})
