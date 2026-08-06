import { describe, expect, it } from 'vitest'
import {
  checkRestCall,
  checkRpcCall,
  explainProfileDeleteFailure
} from './gateway-passthrough-pure'

describe('checkRpcCall', () => {
  it('passes a gateway method through unchanged', () => {
    expect(checkRpcCall('session.list')).toBe('session.list')
    expect(checkRpcCall('skill_hub.search')).toBe('skill_hub.search')
  })

  it('refuses the plaintext key-write method (rule R2)', () => {
    expect(() => checkRpcCall('model.save_key')).toThrow(/rule R2/)
  })

  it('refuses anything that is not shaped like a method name', () => {
    expect(() => checkRpcCall('')).toThrow(/non-empty string/)
    expect(() => checkRpcCall(42)).toThrow(/non-empty string/)
    // No namespace, and no room for a smuggled path or frame field.
    expect(() => checkRpcCall('submit')).toThrow(/not a gateway method name/)
    expect(() => checkRpcCall('session.list; drop')).toThrow(/not a gateway method name/)
  })
})

describe('checkRestCall', () => {
  it('normalizes the verb and keeps the path', () => {
    expect(checkRestCall('post', '/api/mcp/servers')).toEqual({
      method: 'POST',
      path: '/api/mcp/servers'
    })
  })

  it('defaults to GET when the caller omits the verb', () => {
    expect(checkRestCall(undefined, '/api/status').method).toBe('GET')
  })

  it('refuses the plaintext secret-read route (rule R2)', () => {
    expect(() => checkRestCall('POST', '/api/env/reveal')).toThrow(/rule R2/)
  })

  it('refuses the denied route with a query string attached', () => {
    expect(() => checkRestCall('POST', '/api/env/reveal?profile=dev')).toThrow(/rule R2/)
  })

  it('allows the same path under a verb that is not denied', () => {
    expect(checkRestCall('GET', '/api/env/reveal').method).toBe('GET')
  })

  it('refuses a path outside /api/', () => {
    expect(() => checkRestCall('GET', '/etc/passwd')).toThrow(/must start with/)
    expect(() => checkRestCall('GET', 'api/status')).toThrow(/must start with/)
    expect(() => checkRestCall('GET', 42)).toThrow(/must start with/)
  })

  it('refuses path traversal', () => {
    expect(() => checkRestCall('GET', '/api/../secret')).toThrow(/traversal/)
  })

  it('refuses an unsupported verb', () => {
    expect(() => checkRestCall('PATCH', '/api/status')).toThrow(/unsupported method/)
  })
})

describe('explainProfileDeleteFailure', () => {
  const busy = 'REST DELETE /api/profiles/dev failed: 500 [WinError 32] file is being used'

  it('replaces the raw 500 with something the user can act on (D-14)', () => {
    const message = explainProfileDeleteFailure('DELETE', '/api/profiles/dev', busy)
    expect(message).toContain('Профиль не удалён')
    expect(message).toContain('перезапустите приложение')
  })

  it('leaves every other failure alone', () => {
    // A different route, a different verb, and a different reason must all
    // keep the core's own words — this translation is for ONE known bug.
    expect(explainProfileDeleteFailure('DELETE', '/api/mcp/servers/x', busy)).toBeNull()
    expect(explainProfileDeleteFailure('GET', '/api/profiles/dev', busy)).toBeNull()
    expect(
      explainProfileDeleteFailure('DELETE', '/api/profiles/dev', 'profile not found (404)')
    ).toBeNull()
  })

  it('still matches when the path carries a query string', () => {
    expect(explainProfileDeleteFailure('DELETE', '/api/profiles/dev?force=1', busy)).not.toBeNull()
  })
})
