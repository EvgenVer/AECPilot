import type { Session, WebContents } from 'electron'
import { describe, expect, it, vi } from 'vitest'

import { applyPermissionPolicy, grantMicrophone } from './permission-policy'

function fakeSession() {
  return {
    setPermissionRequestHandler: vi.fn(),
    setPermissionCheckHandler: vi.fn()
  }
}

describe('permission policy on a page session (review T88)', () => {
  it('a preview jar gets both handlers, so a page is not granted everything by default', () => {
    const ses = fakeSession()
    applyPermissionPolicy(ses as unknown as Session)
    expect(ses.setPermissionRequestHandler).toHaveBeenCalledTimes(1)
    expect(ses.setPermissionCheckHandler).toHaveBeenCalledTimes(1)

    const check = ses.setPermissionCheckHandler.mock.calls[0][0]
    expect(check(null, 'geolocation', 'https://example.com', {})).toBe(false)

    const request = ses.setPermissionRequestHandler.mock.calls[0][0]
    const callback = vi.fn()
    request(null, 'notifications', callback, {})
    expect(callback).toHaveBeenCalledWith(false)
  })

  it('installs once per session, however many guests attach to it', () => {
    const ses = fakeSession()
    applyPermissionPolicy(ses as unknown as Session)
    applyPermissionPolicy(ses as unknown as Session)
    expect(ses.setPermissionRequestHandler).toHaveBeenCalledTimes(1)
  })
})

describe('the microphone is let out for one press (UR49, T59)', () => {
  const audio = { mediaTypes: ['audio'], isMainFrame: true }

  function policy() {
    const ses = fakeSession()
    applyPermissionPolicy(ses as unknown as Session)
    const request = ses.setPermissionRequestHandler.mock.calls[0][0]
    const check = ses.setPermissionCheckHandler.mock.calls[0][0]
    return {
      asks: (contents: unknown, details: object = audio): boolean => {
        const callback = vi.fn()
        request(contents, 'media', callback, details)
        return callback.mock.calls[0][0] as boolean
      },
      checks: (contents: unknown): boolean =>
        check(contents, 'media', 'file://', { mediaType: 'audio', isMainFrame: true }) as boolean
    }
  }

  it('without a press it stays closed; with one it opens for that window only', () => {
    const { asks, checks } = policy()
    const window = {} as WebContents
    const other = {} as WebContents
    expect(asks(window)).toBe(false)
    grantMicrophone(window)
    expect(checks(window)).toBe(true)
    expect(asks(other)).toBe(false)
    expect(asks(null)).toBe(false)
    expect(asks(window)).toBe(true)
  })

  it('one press opens one stream', () => {
    const { asks, checks } = policy()
    const window = {} as WebContents
    grantMicrophone(window)
    expect(asks(window)).toBe(true)
    expect(asks(window)).toBe(false)
    expect(checks(window)).toBe(false)
  })

  it('a frame inside the window gets nothing, and neither does the camera', () => {
    const { asks } = policy()
    const window = {} as WebContents
    grantMicrophone(window)
    expect(asks(window, { mediaTypes: ['audio'], isMainFrame: false })).toBe(false)
    expect(asks(window, { mediaTypes: ['audio', 'video'], isMainFrame: true })).toBe(false)
  })

  it('a few seconds later the press is over', () => {
    const { asks, checks } = policy()
    const window = {} as WebContents
    grantMicrophone(window, Date.now() - 11_000)
    expect(asks(window)).toBe(false)
    expect(checks(window)).toBe(false)
  })
})
