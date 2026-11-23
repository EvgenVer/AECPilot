import type { Session } from 'electron'
import { describe, expect, it, vi } from 'vitest'

import { applyPermissionPolicy } from './permission-policy'

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
