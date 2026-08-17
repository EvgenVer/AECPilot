import { describe, expect, test } from 'vitest'
import { decideMicrophoneAccess, isAllowedPermission } from './media-permission-pure'

/**
 * Task 3.7a. Before this policy existed the renderer got every permission it
 * asked for, because that is Electron's default when no handler is installed.
 * So the interesting cases here are the refusals — and the one grant the voice
 * mode depends on.
 */

describe('isAllowedPermission', () => {
  test('микрофон разрешён', () => {
    expect(isAllowedPermission('media', ['audio'])).toBe(true)
  })

  test('камера запрещена, в том числе вместе с микрофоном', () => {
    expect(isAllowedPermission('media', ['video'])).toBe(false)
    expect(isAllowedPermission('media', ['audio', 'video'])).toBe(false)
  })

  test('media без объявленных видов считается микрофоном', () => {
    // Chromium не везде заполняет список (в проверочном обработчике вид
    // приезжает как 'unknown', а в типах Electron поле необязательное).
    // Отказ на пустом списке убил бы микрофон из-за формы запроса, а не из-за
    // решения; видео себя всегда называет.
    expect(isAllowedPermission('media', [])).toBe(true)
    expect(isAllowedPermission('media')).toBe(true)
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

describe('decideMicrophoneAccess', () => {
  test('запрет в настройках ОС — это отказ', () => {
    expect(decideMicrophoneAccess('denied')).toBe(false)
    expect(decideMicrophoneAccess('restricted')).toBe(false)
  })

  test('всё, что не запрет, считается доступом', () => {
    // 'unknown' приезжает с Linux, где статуса нет вовсе; 'not-determined' —
    // с macOS до первого запроса. Ни то ни другое не отказ: дальше решает сам
    // Chromium, и он спросит.
    for (const status of ['granted', 'not-determined', 'unknown', '']) {
      expect(decideMicrophoneAccess(status), status).toBe(true)
    }
  })
})
