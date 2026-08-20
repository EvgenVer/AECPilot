// Задача 3.26. Засев умолчания — это одно решение и один способ его испортить:
// перезаписать выбор человека. Проверяется и то, и другое.
//
// Файл .tsx, потому что нужен DOM (localStorage): по `vitest.config.ts`
// окружение выбирает расширение.

import { beforeEach, describe, expect, it } from 'vitest'

import { seedSystemThemeDefault } from './system-theme-default'

const MODE_KEY = 'hermes-desktop-mode-v1'

beforeEach(() => {
  window.localStorage.clear()
})

describe('seedSystemThemeDefault', () => {
  it('на чистой установке ставит «системную» тему', () => {
    expect(seedSystemThemeDefault()).toBe(true)
    expect(window.localStorage.getItem(MODE_KEY)).toBe('system')
  })

  it('выбор человека не трогает — даже если это их прежнее умолчание', () => {
    window.localStorage.setItem(MODE_KEY, 'light')

    expect(seedSystemThemeDefault()).toBe(false)
    expect(window.localStorage.getItem(MODE_KEY)).toBe('light')
  })

  it('повторный запуск ничего не переписывает', () => {
    seedSystemThemeDefault()
    window.localStorage.setItem(MODE_KEY, 'dark')

    expect(seedSystemThemeDefault()).toBe(false)
    expect(window.localStorage.getItem(MODE_KEY)).toBe('dark')
  })
})
