// Задача 3E.10. Всё, что проверяется здесь, приезжает из окна — то есть из
// недоверенной стороны; тесты держат границу, а не форму.

import { describe, expect, it } from 'vitest'

import { pickSpellCheckLanguages, readEditCommand, readSpellcheckAction } from './context-menu-pure'

describe('readEditCommand', () => {
  it('четыре глагола их контракта проходят', () => {
    for (const command of ['copy', 'cut', 'paste', 'selectAll']) {
      expect(readEditCommand(command)).toBe(command)
    }
  })

  it('чужое имя команды — это отказ, а не догадка', () => {
    expect(readEditCommand('delete')).toBeNull()
    expect(readEditCommand('COPY')).toBeNull()
    expect(readEditCommand(undefined)).toBeNull()
    expect(readEditCommand({ command: 'copy' })).toBeNull()
  })
})

describe('readSpellcheckAction', () => {
  it('обычное действие проходит, слово обрезается по краям', () => {
    expect(readSpellcheckAction({ kind: 'add', word: '  ригель  ' })).toEqual({
      kind: 'add',
      word: 'ригель'
    })
  })

  it('без слова делать нечего', () => {
    expect(readSpellcheckAction({ kind: 'add', word: '   ' })).toBeNull()
    expect(readSpellcheckAction({ kind: 'replace' })).toBeNull()
  })

  it('неизвестный вид действия отклоняется целиком', () => {
    // Иначе `kind: 'remove'` тихо попал бы в ветку «добавить в словарь».
    expect(readSpellcheckAction({ kind: 'remove', word: 'ригель' })).toBeNull()
    expect(readSpellcheckAction('add')).toBeNull()
    expect(readSpellcheckAction(null)).toBeNull()
  })
})

describe('pickSpellCheckLanguages', () => {
  it('включаются оба языка спеки, когда оба есть в сборке', () => {
    expect(pickSpellCheckLanguages(['de', 'en-US', 'fr', 'ru'])).toEqual(['ru', 'en-US'])
  })

  it('язык, которого нет в сборке, отбрасывается', () => {
    // Не косметика: `setSpellCheckerLanguages` с неизвестным языком бросает
    // исключение и оставляет проверку выключенной целиком.
    expect(pickSpellCheckLanguages(['en-US'])).toEqual(['en-US'])
  })

  it('пустой список доступных языков даёт пустой ответ', () => {
    // Так отвечает macOS: там работает проверка системы, и настраивать нечего.
    expect(pickSpellCheckLanguages([])).toEqual([])
  })
})
