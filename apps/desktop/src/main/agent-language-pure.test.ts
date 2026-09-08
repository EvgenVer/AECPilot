// Каждая проверка держит одну сторону решения владельца 2026-09-08: строка
// пишется из ВИДИМОЙ настройки, а пустая настройка не пишет ничего.

import { describe, expect, it } from 'vitest'

import {
  applySoulLanguage,
  isAgentLanguage,
  parseAgentLanguageJson,
  serializeAgentLanguage,
  soulLanguageLine
} from './agent-language-pure'

const SOUL = '# Нормоконтролёр\n\n**Role:** проверяет альбомы'

describe('soulLanguageLine', () => {
  it('пишет правило на том же языке, о котором просит', () => {
    expect(soulLanguageLine('ru')).toContain('по-русски')
    expect(soulLanguageLine('en')).toContain('in English')
  })

  it('на «не задан» и на незнакомое значение отвечает пустой строкой', () => {
    // Английский запасной вариант здесь был бы решением за человека.
    expect(soulLanguageLine('')).toBe('')
    expect(soulLanguageLine('ja')).toBe('')
    expect(soulLanguageLine(undefined)).toBe('')
  })
})

describe('applySoulLanguage', () => {
  it('дописывает строку в SOUL создаваемого специалиста', () => {
    const out = applySoulLanguage(
      'profiles.create',
      { name: 'nk', soul: SOUL },
      'Отвечай по-русски.'
    )
    expect(out.soul).toBe(`${SOUL}\n\nОтвечай по-русски.`)
  })

  it('ПРИ ПУСТОЙ НАСТРОЙКЕ НЕ ТРОГАЕТ НИЧЕГО', () => {
    // Требование задачи 5.14 дословно: иначе умолчание стало бы вшитым
    // предпочтением, которого человек не выбирал.
    const params = { name: 'nk', soul: SOUL }
    expect(applySoulLanguage('profiles.create', params, '')).toBe(params)
  })

  it('не трогает другие методы моста', () => {
    const params = { soul: SOUL }
    expect(applySoulLanguage('prompt.submit', params, 'Отвечай по-русски.')).toBe(params)
  })

  it('не дописывает строку второй раз', () => {
    // Специалиста создают и клоном: `composeSoul` возвращает чужой SOUL как
    // есть, вместе с уже стоящей там строкой.
    const line = 'Отвечай по-русски.'
    const once = applySoulLanguage('profiles.create', { soul: SOUL }, line)
    expect(applySoulLanguage('profiles.create', once, line)).toBe(once)
  })

  it('не превращает пустой SOUL в файл из одной строки про язык', () => {
    const params = { name: 'nk', soul: '   ' }
    expect(applySoulLanguage('profiles.create', params, 'Отвечай по-русски.')).toBe(params)
    const without = { name: 'nk' }
    expect(applySoulLanguage('profiles.create', without, 'Отвечай по-русски.')).toBe(without)
  })
})

describe('хранение', () => {
  it('читает записанное', () => {
    expect(parseAgentLanguageJson(serializeAgentLanguage('ru'))).toBe('ru')
  })

  it('испорченный или чужой файл читается как «не задан», а не роняет запуск', () => {
    expect(parseAgentLanguageJson('{')).toBe('')
    expect(parseAgentLanguageJson('{"language":"klingon"}')).toBe('')
  })

  it('знает свой закрытый список', () => {
    expect(isAgentLanguage('ru')).toBe(true)
    expect(isAgentLanguage('')).toBe(true)
    expect(isAgentLanguage('de')).toBe(false)
  })
})
