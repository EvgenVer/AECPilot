import { describe, expect, it } from 'vitest'
import {
  buildRestHeaders,
  buildRestUrl,
  describeRestError,
  extractRestDetail,
  redactSecrets,
  SESSION_TOKEN_HEADER
} from './hermes-rest-pure'

const target = { host: '127.0.0.1', port: 18789, token: 'a'.repeat(48) }

describe('buildRestUrl', () => {
  it('builds an absolute URL against the serve handle host/port', () => {
    expect(buildRestUrl(target, '/api/mcp/servers')).toBe('http://127.0.0.1:18789/api/mcp/servers')
  })

  it('appends query parameters', () => {
    expect(buildRestUrl(target, '/api/mcp/servers', { profile: 'dev' })).toBe(
      'http://127.0.0.1:18789/api/mcp/servers?profile=dev'
    )
  })

  it('escapes a name that would otherwise change the path', () => {
    const url = buildRestUrl(target, `/api/mcp/servers/${encodeURIComponent('a/b')}/test`)
    expect(url).toBe('http://127.0.0.1:18789/api/mcp/servers/a%2Fb/test')
  })

  it('rejects a path without a leading slash instead of guessing', () => {
    expect(() => buildRestUrl(target, 'api/status')).toThrow(/must start with/)
  })
})

describe('buildRestHeaders', () => {
  it('sends the session token header', () => {
    expect(buildRestHeaders(target, false)[SESSION_TOKEN_HEADER]).toBe(target.token)
  })

  it('adds a JSON content type only when there is a body', () => {
    expect(buildRestHeaders(target, false)['Content-Type']).toBeUndefined()
    expect(buildRestHeaders(target, true)['Content-Type']).toBe('application/json')
  })
})

describe('describeRestError', () => {
  it('gives every status its own message', () => {
    const messages = [400, 401, 404, 409, 422, 500].map((status) =>
      describeRestError(status, 'boom')
    )
    expect(new Set(messages).size).toBe(messages.length)
  })

  it('says a token problem is a token problem, not a server error', () => {
    expect(describeRestError(401, '')).toMatch(/токен/i)
    expect(describeRestError(403, '')).toMatch(/токен/i)
  })

  it('keeps the core detail, so a refused MCP command reads as a refusal', () => {
    expect(
      describeRestError(400, "Server 'x' rejected: suspicious command/args configuration")
    ).toContain('suspicious command/args configuration')
  })

  it('reports an unknown status without pretending to know more', () => {
    expect(describeRestError(418, '')).toContain('418')
  })

  // The load-bearing test of this module: the failure this guards against is
  // a key typed into an MCP server's env map coming back in an error string.
  it('never echoes the session token or a key-shaped string', () => {
    const message = describeRestError(
      400,
      `bad env for token ${target.token} and key sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789`,
      [target.token]
    )
    expect(message).not.toContain(target.token)
    expect(message).not.toContain('sk-ant-api03')
    expect(message).toContain('[скрыто]')
  })
})

describe('redactSecrets', () => {
  it('masks provider key prefixes', () => {
    expect(redactSecrets('key sk-abcdefghijklmnop tail')).toBe('key [скрыто] tail')
    expect(redactSecrets('ghp_abcdefghijklmnopqrst')).toBe('[скрыто]')
    expect(redactSecrets('xoxb-1234567890-abcdefghij')).toContain('[скрыто]')
  })

  it('masks bare high-entropy strings', () => {
    expect(redactSecrets('hash 0123456789abcdef0123456789abcdef')).toBe('hash [скрыто]')
  })

  it('leaves ordinary words and short ids alone', () => {
    expect(redactSecrets('server aec-sources not found (code 404)')).toBe(
      'server aec-sources not found (code 404)'
    )
  })

  it('ignores an empty or too-short extra secret rather than masking everything', () => {
    expect(redactSecrets('abc', ['', 'a'])).toBe('abc')
  })
})

describe('extractRestDetail', () => {
  it('reads FastAPI string detail', () => {
    expect(extractRestDetail({ detail: "Server 'x' not found" })).toBe("Server 'x' not found")
  })

  it('flattens pydantic field errors so the user learns which field failed', () => {
    expect(extractRestDetail({ detail: [{ loc: ['body', 'url'], msg: 'field required' }] })).toBe(
      'body.url: field required'
    )
  })

  it('returns an empty string for a body it cannot read', () => {
    expect(extractRestDetail('<html>502</html>')).toBe('<html>502</html>')
    expect(extractRestDetail(null)).toBe('')
    expect(extractRestDetail({ error: 'nope' })).toBe('')
  })
})
