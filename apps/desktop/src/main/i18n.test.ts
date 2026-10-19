// Язык интерфейса в главном процессе (задача T27, часть 2): состояние,
// перевод, уведомление подписчиков и видимые строки, которые от него зависят.

import { afterEach, describe, expect, it, vi } from 'vitest'

import { describeRestError } from './hermes-rest-pure'
import {
  DEFAULT_UI_LANGUAGE,
  getUiLanguage,
  mainT,
  onUiLanguageChange,
  parseUiLanguage,
  setUiLanguage,
  translateMain
} from './i18n'
import { watchOutsideError } from './preview-watch-pure'
import { quitPromptFor } from './quit-guard-pure'
import { sshErrorMessage } from './ssh-pure'

afterEach(() => {
  setUiLanguage('ru')
})

describe('parseUiLanguage', () => {
  it('принимает en/ru и региональные теги', () => {
    expect(parseUiLanguage('en')).toBe('en')
    expect(parseUiLanguage('EN-us')).toBe('en')
    expect(parseUiLanguage('ru')).toBe('ru')
    expect(parseUiLanguage(' ru-RU ')).toBe('ru')
  })

  it('остальное — null, а не молчаливое умолчание', () => {
    expect(parseUiLanguage('de')).toBeNull()
    expect(parseUiLanguage('')).toBeNull()
    expect(parseUiLanguage(undefined)).toBeNull()
    expect(parseUiLanguage(42)).toBeNull()
    expect(parseUiLanguage({})).toBeNull()
  })
})

describe('setUiLanguage / getUiLanguage', () => {
  it('по умолчанию русский (SPEC C7)', () => {
    expect(DEFAULT_UI_LANGUAGE).toBe('ru')
    expect(getUiLanguage()).toBe('ru')
  })

  it('переключает язык и возвращает действующий', () => {
    expect(setUiLanguage('en')).toBe('en')
    expect(getUiLanguage()).toBe('en')
    expect(setUiLanguage('ru-RU')).toBe('ru')
  })

  it('неизвестное значение язык не меняет', () => {
    setUiLanguage('en')
    expect(setUiLanguage('fr')).toBe('en')
    expect(setUiLanguage(null)).toBe('en')
    expect(getUiLanguage()).toBe('en')
  })

  it('подписчики зовутся только при настоящей смене', () => {
    const listener = vi.fn()
    const off = onUiLanguageChange(listener)

    setUiLanguage('ru')
    expect(listener).not.toHaveBeenCalled()

    setUiLanguage('en')
    setUiLanguage('en')
    expect(listener).toHaveBeenCalledExactlyOnceWith('en')

    off()
    setUiLanguage('ru')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('сбой подписчика не мешает смене языка и другим подписчикам', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const after = vi.fn()
    const offBad = onUiLanguageChange(() => {
      throw new Error('boom')
    })
    const offAfter = onUiLanguageChange(after)

    expect(setUiLanguage('en')).toBe('en')
    expect(after).toHaveBeenCalledWith('en')

    offBad()
    offAfter()
    quiet.mockRestore()
  })
})

describe('mainT', () => {
  it('говорит на текущем языке', () => {
    expect(mainT('common.noProject')).toBe('Нет открытого проекта')
    setUiLanguage('en')
    expect(mainT('common.noProject')).toBe('No project is open')
  })

  it('подставляет параметры в обоих языках', () => {
    expect(mainT('quit.manyChats', 3)).toBe('Агент ещё работает в чатах: 3.')
    setUiLanguage('en')
    expect(mainT('quit.manyChats', 3)).toBe('The agent is still working in 3 chats.')
  })

  it('translateMain берёт язык явно, не трогая текущий', () => {
    expect(translateMain('en', 'tray.quit')).toBe('Quit AECPilot')
    expect(translateMain('ru', 'tray.quit')).toBe('Выйти из AECPilot')
    expect(getUiLanguage()).toBe('ru')
  })
})

describe('видимые строки следуют за языком', () => {
  it('диалог выхода', () => {
    const work = { count: 1, titles: ['Смета'] }
    expect(quitPromptFor(work)?.message).toBe('Агент ещё работает в одном чате.')
    setUiLanguage('en')
    const prompt = quitPromptFor(work)
    expect(prompt?.message).toBe('The agent is still working in one chat.')
    expect(prompt?.detail).toContain('• Смета')
    expect(prompt?.detail).toContain('Quitting will stop it mid-turn')
    expect(prompt?.detail).not.toContain('Выход остановит')
  })

  it('пункт «и ещё N» в диалоге выхода', () => {
    const work = { count: 6, titles: ['A', 'B', 'C', 'D', 'E', 'F'] }
    expect(quitPromptFor(work)?.detail).toContain('• и ещё 2')
    setUiLanguage('en')
    expect(quitPromptFor(work)?.detail).toContain('• and 2 more')
  })

  it('ошибка ssh и ответ ядра', () => {
    expect(sshErrorMessage('timeout')).toBe(
      'Сервер не ответил вовремя. Проверьте адрес и доступность сети.'
    )
    expect(describeRestError(404, 'x')).toBe('Не найдено: x')
    setUiLanguage('en')
    expect(sshErrorMessage('timeout')).toBe(
      'The server did not respond in time. Check the address and network availability.'
    )
    expect(describeRestError(404, 'x')).toBe('Not found: x')
  })

  it('бывшая константа читает язык в момент вызова', () => {
    const ru = watchOutsideError()
    setUiLanguage('en')
    expect(watchOutsideError()).not.toBe(ru)
    expect(watchOutsideError()).toMatch(/watched/)
  })
})
