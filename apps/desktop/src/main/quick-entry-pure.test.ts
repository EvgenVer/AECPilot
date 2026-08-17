import { describe, expect, test } from 'vitest'
import {
  DEFAULT_QUICK_ENTRY_SHORTCUT,
  decideRegistration,
  isQuickEntryTarget,
  isValidAccelerator,
  quickEntryBounds,
  QUICK_ENTRY_HEIGHT,
  QUICK_ENTRY_WIDTH
} from './quick-entry-pure'

/**
 * Task 3.15. A global shortcut is the one piece of UI that affects apps this
 * one did not write, so the rules worth pinning are the refusals: a malformed
 * chord, and a feature that is off never claiming a key at all.
 */

describe('isValidAccelerator', () => {
  test('умолчание и обычные сочетания принимаются', () => {
    for (const value of [
      DEFAULT_QUICK_ENTRY_SHORTCUT,
      'Ctrl+Shift+Space',
      'Alt+F4',
      'CommandOrControl+Alt+K',
      'Super+/',
      'Ctrl+F12'
    ]) {
      expect(isValidAccelerator(value), value).toBe(true)
    }
  })

  test('без модификатора — не сочетание, а перехват одной клавиши', () => {
    for (const value of ['Space', 'K', 'F5']) {
      expect(isValidAccelerator(value), value).toBe(false)
    }
  })

  test('мусор и опечатки отклоняются, а не уезжают в ОС', () => {
    for (const value of [
      '',
      '   ',
      'Ctrl+',
      '+Space',
      'Ctrl++Space',
      'Ctrl+Shift',
      'Ctrl+Пробел',
      'Ctrl+F25',
      'Ctrl+Shift+Spacebar',
      42,
      null,
      undefined,
      {}
    ]) {
      expect(isValidAccelerator(value), String(value)).toBe(false)
    }
  })
})

describe('decideRegistration', () => {
  test('выключено — значит клавиша не занимается вовсе', () => {
    expect(decideRegistration({ enabled: false, shortcut: 'Ctrl+Shift+Space' })).toEqual({
      register: false,
      reason: 'disabled'
    })
  })

  test('включено без своего сочетания — берётся умолчание', () => {
    expect(decideRegistration({ enabled: true })).toEqual({
      register: true,
      accelerator: DEFAULT_QUICK_ENTRY_SHORTCUT
    })
  })

  test('негодное сочетание не доходит до ОС и называет причину', () => {
    expect(decideRegistration({ enabled: true, shortcut: 'Ctrl+Пробел' })).toEqual({
      register: false,
      reason: 'invalid'
    })
  })
})

describe('quickEntryBounds', () => {
  test('окно по центру экрана и в верхней трети', () => {
    const bounds = quickEntryBounds({ x: 0, y: 0, width: 1920, height: 1080 })

    expect(bounds.width).toBe(QUICK_ENTRY_WIDTH)
    expect(bounds.height).toBe(QUICK_ENTRY_HEIGHT)
    expect(bounds.x).toBe(Math.round((1920 - QUICK_ENTRY_WIDTH) / 2))
    expect(bounds.y).toBeGreaterThan(0)
    expect(bounds.y).toBeLessThan(1080 / 2)
  })

  test('второй монитор — окно на нём, а не на первом', () => {
    // Рабочая область второго экрана начинается за правым краем первого.
    const bounds = quickEntryBounds({ x: 1920, y: 0, width: 1280, height: 1024 })

    expect(bounds.x).toBeGreaterThanOrEqual(1920)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(1920 + 1280)
  })

  test('координаты целые — дробные размывают окно на Windows', () => {
    const bounds = quickEntryBounds({ x: 0, y: 0, width: 1367, height: 769 })

    expect(Number.isInteger(bounds.x)).toBe(true)
    expect(Number.isInteger(bounds.y)).toBe(true)
  })
})

describe('isQuickEntryTarget', () => {
  test('только две цели, всё остальное — отказ', () => {
    expect(isQuickEntryTarget('current')).toBe(true)
    expect(isQuickEntryTarget('new')).toBe(true)
    for (const value of ['', 'session-42', 'CURRENT', 0, null, undefined, {}]) {
      expect(isQuickEntryTarget(value), String(value)).toBe(false)
    }
  })
})
