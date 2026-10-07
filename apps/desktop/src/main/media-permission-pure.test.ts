import { describe, expect, test } from 'vitest'
import { isAllowedPermission } from './media-permission-pure'

/**
 * Task 3.7a. Before this policy existed the renderer got every permission it
 * asked for, because that is Electron's default when no handler is installed.
 * So the interesting cases here are the refusals. С задачи 3H.3 отказ получает
 * и микрофон: голос вне продукта (SPEC HX19).
 */

describe('isAllowedPermission', () => {
  test('микрофон запрещён — голос вне продукта (SPEC HX19, задача 3H.3)', () => {
    expect(isAllowedPermission('media', ['audio'])).toBe(false)
  })

  test('камера запрещена, в том числе вместе с микрофоном', () => {
    expect(isAllowedPermission('media', ['video'])).toBe(false)
    expect(isAllowedPermission('media', ['audio', 'video'])).toBe(false)
  })

  test('media без объявленных видов — тоже отказ', () => {
    expect(isAllowedPermission('media', [])).toBe(false)
    expect(isAllowedPermission('media')).toBe(false)
  })

  test('всё остальное, что умеет спрашивать страница, запрещено', () => {
    for (const permission of [
      'geolocation',
      'notifications',
      'midi',
      'midiSysex',
      'hid',
      'usb',
      'serial',
      'display-capture',
      'window-management',
      'idle-detection',
      'clipboard-read',
      'deprecated-sync-clipboard-read',
      'openExternal',
      'fileSystem',
      'pointerLock',
      'keyboardLock',
      'fullscreen',
      'unknown'
    ]) {
      expect(isAllowedPermission(permission, ['audio']), permission).toBe(false)
    }
  })

  test('копирование картинки в буфер разрешено — это исходящее действие по клику', () => {
    expect(isAllowedPermission('clipboard-sanitized-write')).toBe(true)
  })
})
